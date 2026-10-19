/*
 * A buyer is congratulated once and added to the mailing list. Needs MONGODB_URI.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import type { MailMessage, Mailer } from "@avhomes/core";
import { AV_CONSTRUCTIONS_URL, welcomeBuyer } from "./buyers";

const uri = process.env.MONGODB_URI;
// The unsubscribe link is signed; a throwaway secret is enough here.
process.env.SESSION_SECRET ??= "test-only-secret-that-is-long-enough-123";
const CTX = { requestId: "test", route: "test" };
const ORIGIN = "https://www.avhomesltd.com";

let client: MongoClient;
let db: Db;

function mailer(works = true): { mailer: Mailer; sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    mailer: {
      assertConfigured: () => {},
      send: async (message) => {
        if (!works) throw new Error("provider down");
        sent.push(message);
      },
    },
  };
}

const buyer = (email = "Ngozi@Example.com") => ({ email, name: "Ngozi Okeke", property: "Kuje Heights", origin: ORIGIN });

describe("buyer welcome", { skip: uri ? false : "set MONGODB_URI to run" }, () => {
  before(async () => {
    client = await MongoClient.connect(uri!);
  });
  after(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    db = client.db(`avhomes_test_buyer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  });

  test("joins the list with source buyer and gets one email naming AV Constructions", async () => {
    const m = mailer();
    assert.equal(await welcomeBuyer(db, m.mailer, buyer(), CTX), true);
    const row = await db.collection("subscribers").findOne({ email: "ngozi@example.com" });
    assert.equal(row?.source, "buyer");
    assert.equal(m.sent.length, 1);
    assert.match(m.sent[0]!.subject, /Kuje Heights/u);
    assert.ok((m.sent[0]!.html ?? "").includes(AV_CONSTRUCTIONS_URL));
    assert.ok((m.sent[0]!.html ?? "").includes("/unsubscribe?s="));
    assert.match(m.sent[0]!.text, /Congratulations, Ngozi\./u);

    assert.equal(await welcomeBuyer(db, m.mailer, buyer(), CTX), false, "a second sale sends nothing");
    assert.equal(m.sent.length, 1);
    await db.dropDatabase();
  });

  test("an existing subscriber keeps their source, and someone who unsubscribed is left alone", async () => {
    await db.collection("subscribers").insertMany([
      { _id: "sub_a", email: "reader@example.com", source: "footer", createdAt: 1, updatedAt: 1, confirmedAt: null },
      { _id: "sub_b", email: "left@example.com", source: "footer", createdAt: 1, updatedAt: 1, confirmedAt: null, unsubscribedAt: 5 },
    ] as never);
    const m = mailer();
    assert.equal(await welcomeBuyer(db, m.mailer, buyer("reader@example.com"), CTX), true);
    assert.equal((await db.collection("subscribers").findOne({ _id: "sub_a" as never }))?.source, "footer");
    assert.equal(await welcomeBuyer(db, m.mailer, buyer("left@example.com"), CTX), false);
    assert.equal((await db.collection("subscribers").findOne({ _id: "sub_b" as never }))?.unsubscribedAt, 5);
    assert.deepEqual(m.sent.map((s) => s.to), ["reader@example.com"]);
    await db.dropDatabase();
  });

  test("a failed send is tried again on the next approved sale", async () => {
    assert.equal(await welcomeBuyer(db, mailer(false).mailer, buyer(), CTX), false);
    const m = mailer();
    assert.equal(await welcomeBuyer(db, m.mailer, buyer(), CTX), true);
    assert.equal(m.sent.length, 1);
    await db.dropDatabase();
  });

  test("a malformed address is ignored", async () => {
    assert.equal(await welcomeBuyer(db, mailer().mailer, buyer("not-an-email"), CTX), false);
    assert.equal(await db.collection("subscribers").countDocuments(), 0);
    await db.dropDatabase();
  });
});
