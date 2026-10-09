/*
 * The WhatsApp invite reaches every partner exactly once.
 *
 * Needs a MongoDB to talk to. Set MONGODB_URI (a throwaway server, each run uses
 * its own database and drops it) or every test is skipped.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import type { Marketer, PushMessage } from "@avhomes/contracts";
import { writeMarketingSettings } from "./settings";
import {
  inviteUninvited,
  listLinkChanges,
  recordLinkChange,
  remindPartners,
  welcomePartner,
  whatsappReport,
  type InviteDeps,
} from "./whatsapp";

const uri = process.env.MONGODB_URI;
const GROUP = "https://chat.whatsapp.com/AbCdEfGhIjKlMnOp12";
const ORIGIN = "https://www.avhomesltd.com";
const CTX = { requestId: "test", route: "test" };

let client: MongoClient;
let db: Db;

interface Sent {
  mail: { to: string; key: string; text: Record<string, string> }[];
  push: { userIds: string[]; message: PushMessage }[];
}

function recorder(mailWorks = true): { deps: InviteDeps; sent: Sent } {
  const sent: Sent = { mail: [], push: [] };
  return {
    sent,
    deps: {
      mail: async (_db, to, key, text) => {
        sent.mail.push({ to, key, text });
        return mailWorks;
      },
      tell: async (_db, userIds, message) => {
        sent.push.push({ userIds, message });
      },
    },
  };
}

let seq = 0;
async function addPartner(name: string, extra: { status?: string; isAdmin?: boolean } = {}): Promise<Marketer> {
  seq += 1;
  const id = `mkt_${seq}`;
  const doc = {
    _id: id,
    userId: `usr_${seq}`,
    code: `AV-${String(seq).padStart(4, "0")}`,
    seq,
    displayName: name,
    email: `${name.toLowerCase().replace(/\s+/gu, ".")}@test.local`,
    phone: "",
    state: "Lagos",
    status: extra.status ?? "active",
    statusReason: "",
    statusAt: null,
    parentId: null,
    upline: [],
    bank: null,
    isAdmin: extra.isAdmin ?? false,
    joinedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.collection("marketers").insertOne(doc as never);
  return { ...doc, id } as unknown as Marketer;
}

const emailsTo = (sent: Sent, to: string) => sent.mail.filter((m) => m.to === to);
const pushesTo = (sent: Sent, userId: string) => sent.push.filter((p) => p.userIds.includes(userId));

describe("WhatsApp group invites", { skip: uri ? false : "set MONGODB_URI to run" }, () => {
  before(async () => {
    client = await MongoClient.connect(uri!);
  });
  after(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    db = client.db(`avhomes_test_wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  });

  test("with no group set, a new partner is welcomed without a link and is not counted as invited", async () => {
    const { deps, sent } = recorder();
    const ada = await addPartner("Ada Obi");
    await welcomePartner(deps, db, ada, ORIGIN, CTX);
    assert.equal(sent.mail.length, 1);
    assert.equal(sent.mail[0]!.key, "property-partner-welcome");
    assert.equal(sent.mail[0]!.text.whatsappLink, "");
    assert.equal(sent.push.length, 0);
    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 });
    await db.dropDatabase();
  });

  test("saving the link invites every current partner once, and saving again sends nothing", async () => {
    const { deps, sent } = recorder();
    const ada = await addPartner("Ada Obi");
    const bayo = await addPartner("Bayo Ade");
    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });

    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 2, emailed: 2 });
    for (const m of [ada, bayo]) {
      const mails = emailsTo(sent, m.email);
      assert.equal(mails.length, 1);
      assert.equal(mails[0]!.key, "property-partner-whatsapp");
      assert.equal(mails[0]!.text.whatsappLink, `${ORIGIN}/wa/${m.code}`);
      assert.equal(pushesTo(sent, m.userId).length, 1);
      assert.equal(pushesTo(sent, m.userId)[0]!.message.url, "/m/whatsapp");
    }

    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 });
    await writeMarketingSettings(db, { whatsappGroupUrl: "https://chat.whatsapp.com/ZyXwVuTsRqPoNm98" });
    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 });
    assert.equal(sent.mail.length, 2);
    assert.equal(sent.push.length, 2);
    await db.dropDatabase();
  });

  test("a partner who joins after the link is set gets it with their welcome, and never again", async () => {
    const { deps, sent } = recorder();
    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });
    const chidi = await addPartner("Chidi Eze");
    await welcomePartner(deps, db, chidi, ORIGIN, CTX);

    const mails = emailsTo(sent, chidi.email);
    assert.equal(mails.length, 1);
    assert.equal(mails[0]!.key, "property-partner-welcome");
    assert.equal(mails[0]!.text.whatsappLink, `${ORIGIN}/wa/${chidi.code}`);
    assert.equal(pushesTo(sent, chidi.userId).length, 1);

    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 });
    assert.equal(sent.mail.length, 1);
    assert.equal(sent.push.length, 1);
    await db.dropDatabase();
  });

  test("partners who joined before the group existed are caught up when the link is saved", async () => {
    const { deps, sent } = recorder();
    const early = await addPartner("Early Bird");
    await welcomePartner(deps, db, early, ORIGIN, CTX);
    assert.equal(sent.push.length, 0);

    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });
    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 1, emailed: 1 });
    const invite = emailsTo(sent, early.email).find((m) => m.key === "property-partner-whatsapp");
    assert.equal(invite?.text.whatsappLink, `${ORIGIN}/wa/${early.code}`);
    assert.equal(pushesTo(sent, early.userId).length, 1);
    await db.dropDatabase();
  });

  test("paused partners and admin accounts are not invited", async () => {
    const { deps, sent } = recorder();
    await addPartner("Paused Person", { status: "paused" });
    await addPartner("Admin Person", { isAdmin: true });
    const active = await addPartner("Active Person");
    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });
    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 1, emailed: 1 });
    assert.deepEqual(sent.mail.map((m) => m.to), [active.email]);
    await db.dropDatabase();
  });

  test("when email is not set up, the push goes once and the email follows on a later save", async () => {
    const offline = recorder(false);
    const dayo = await addPartner("Dayo Bello");
    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });
    assert.deepEqual(await inviteUninvited(offline.deps, db, ORIGIN, CTX), { invited: 1, emailed: 0 });
    assert.equal(pushesTo(offline.sent, dayo.userId).length, 1);
    assert.deepEqual(await inviteUninvited(offline.deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 }, "nothing new to report");
    assert.equal(offline.sent.push.length, 1, "still one push");

    const online = recorder(true);
    assert.deepEqual(await inviteUninvited(online.deps, db, ORIGIN, CTX), { invited: 1, emailed: 1 });
    assert.equal(online.sent.push.length, 0, "no second push");
    assert.equal(emailsTo(online.sent, dayo.email).length, 1);

    assert.deepEqual(await inviteUninvited(online.deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 });
    await db.dropDatabase();
  });

  test("two saves at the same moment do not send anyone the invite twice", async () => {
    const { deps, sent } = recorder();
    const people = await Promise.all(["P One", "P Two", "P Three", "P Four"].map((n) => addPartner(n)));
    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });
    const [a, b] = await Promise.all([inviteUninvited(deps, db, ORIGIN, CTX), inviteUninvited(deps, db, ORIGIN, CTX)]);
    assert.equal(a.invited + b.invited, people.length);
    for (const m of people) assert.equal(emailsTo(sent, m.email).length, 1, m.displayName);
    await db.dropDatabase();
  });

  test("a reminder counts as the invite, and the report shows who was invited", async () => {
    const { deps, sent } = recorder();
    const ema = await addPartner("Ema Udo");
    await writeMarketingSettings(db, { whatsappGroupUrl: GROUP });
    assert.equal((await remindPartners(deps, db, ORIGIN, CTX)).partners, 1);
    assert.deepEqual(await inviteUninvited(deps, db, ORIGIN, CTX), { invited: 0, emailed: 0 });
    assert.equal(emailsTo(sent, ema.email).length, 1);

    const report = await whatsappReport(db);
    assert.equal(report.totals.partnersInvited, 1);
    assert.notEqual(report.partners[0]!.invitedAt, null);
    await db.dropDatabase();
  });

  test("link changes are kept newest first, and the report shows the latest", async () => {
    assert.equal((await whatsappReport(db)).lastChange, null);
    await recordLinkChange(db, { url: GROUP, previousUrl: "", reason: "first-link", note: "", byId: "u1", byName: "Tolu", invited: 3 });
    await new Promise((r) => setTimeout(r, 5));
    await recordLinkChange(db, {
      url: "https://chat.whatsapp.com/ZyXwVuTsRqPoNm98",
      previousUrl: GROUP,
      reason: "link-leaked",
      note: "Posted on a public page",
      byId: "u2",
      byName: "Ada",
      invited: 0,
    });
    const changes = await listLinkChanges(db);
    assert.deepEqual(changes.map((c) => c.reason), ["link-leaked", "first-link"]);
    assert.equal(changes[0]!.previousUrl, GROUP);
    assert.equal(changes[0]!.note, "Posted on a public page");
    const report = await whatsappReport(db);
    assert.equal(report.lastChange?.byName, "Ada");
    await db.dropDatabase();
  });
});
