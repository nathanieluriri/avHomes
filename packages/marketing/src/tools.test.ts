/*
 * Marketing tools: defaults, merch grades, requests and downloads.
 *
 * The database tests need MONGODB_URI (each run uses its own database and drops it).
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import { DEFAULT_MARKETING_TOOLS, downloadLink, gradeAllows, gradeFor, type Marketer } from "@avhomes/contracts";
import { partnerTools, readTools, requestMerch, settleMerchRequest, writeToolList } from "./tools";

const uri = process.env.MONGODB_URI;
const grades = DEFAULT_MARKETING_TOOLS.grades;

/** Matches a refusal by the message the partner is shown. */
const says = (pattern: RegExp) => (err: unknown) =>
  ((err as { issues?: { message: string }[] }).issues ?? []).some((issue) => pattern.test(issue.message));

describe("merch grades", () => {
  test("a partner reaches the highest grade their approved deals allow", () => {
    assert.equal(gradeFor(grades, 0)?.name, "Standard");
    assert.equal(gradeFor(grades, 2)?.name, "Standard");
    assert.equal(gradeFor(grades, 3)?.name, "Premium");
    assert.equal(gradeFor(grades, 25)?.name, "Elite");
    assert.equal(gradeFor([{ id: "g", name: "Gold", includes: "", minDeals: 1 }], 0), null);
  });

  test("a grade allows its own items and every lower grade's", () => {
    assert.equal(gradeAllows(grades, "grade-premium", "grade-standard"), true);
    assert.equal(gradeAllows(grades, "grade-premium", "grade-premium"), true);
    assert.equal(gradeAllows(grades, "grade-premium", "grade-elite"), false);
    assert.equal(gradeAllows(grades, null, "grade-standard"), false);
  });
});

describe("download links", () => {
  test("same-origin files keep their path and get a tidy filename", () => {
    assert.deepEqual(downloadLink("/tutorials/report-a-deal.mp4", "Report a deal"), {
      href: "/tutorials/report-a-deal.mp4",
      filename: "report-a-deal.mp4",
    });
  });

  test("Cloudinary is asked for an attachment, Blob for a download", () => {
    assert.equal(
      downloadLink("https://res.cloudinary.com/av/video/upload/v1/clip.mp4", "Site visit")?.href,
      "https://res.cloudinary.com/av/video/upload/fl_attachment:site-visit/v1/clip.mp4",
    );
    assert.equal(
      downloadLink("https://abc.public.blob.vercel-storage.com/guide.pdf", "Price list")?.href,
      "https://abc.public.blob.vercel-storage.com/guide.pdf?download=1",
    );
  });

  test("a page elsewhere cannot be downloaded", () => {
    assert.equal(downloadLink("https://www.youtube.com/watch?v=abc", "Video"), null);
  });
});

let client: MongoClient;
let db: Db;

const partner = {
  id: "mkt_1",
  userId: "usr_1",
  code: "AV-0002",
  displayName: "Ada Obi",
  phone: "+2348000000000",
  email: "ada@test.local",
} as unknown as Marketer;

async function approve(count: number) {
  for (let i = 0; i < count; i += 1) {
    await db.collection("marketing_deals").insertOne({ _id: `deal_${i}` as never, status: "approved", reporterId: partner.id });
  }
}

describe("merch requests", { skip: uri ? false : "set MONGODB_URI to run" }, () => {
  before(async () => {
    client = await MongoClient.connect(uri!);
  });
  after(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    db = client.db(`avhomes_test_tools_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  });

  test("an unsaved site reads the defaults, and a saved list replaces them", async () => {
    assert.equal((await readTools(db)).guides.length, DEFAULT_MARKETING_TOOLS.guides.length);
    await writeToolList(db, "guides", []);
    const tools = await readTools(db);
    assert.equal(tools.guides.length, 0);
    assert.equal(tools.merch.length, DEFAULT_MARKETING_TOOLS.merch.length);
    await db.dropDatabase();
  });

  test("a partner can ask for their grade's merch once, but not a higher grade's", async () => {
    await approve(3);
    const view = await partnerTools(db, partner);
    assert.equal(view.approvedDeals, 3);
    assert.equal(view.gradeId, "grade-premium");

    const asked = await requestMerch(db, partner, { itemId: "merch-hoodie", size: "L", note: "" });
    assert.equal(asked.status, "requested");
    assert.equal(asked.gradeName, "Premium");
    await assert.rejects(requestMerch(db, partner, { itemId: "merch-hoodie", size: "L", note: "" }), says(/already asked/u));
    await assert.rejects(requestMerch(db, partner, { itemId: "merch-elite-kit", size: "L", note: "" }));
    await assert.rejects(requestMerch(db, partner, { itemId: "merch-polo", size: "XS", note: "" }));
    await db.dropDatabase();
  });

  test("sending a request takes one off the stock, and an empty stock refuses", async () => {
    const tools = await readTools(db);
    await writeToolList(db, "merch", tools.merch.map((m) => (m.id === "merch-flyers" ? { ...m, stock: 1 } : m)));
    const asked = await requestMerch(db, partner, { itemId: "merch-flyers", size: "", note: "Lekki office" });
    await settleMerchRequest(db, asked.id, "sent", "Tolu");
    assert.equal((await readTools(db)).merch.find((m) => m.id === "merch-flyers")?.stock, 0);
    await assert.rejects(settleMerchRequest(db, asked.id, "sent", "Tolu"), says(/already been handled/u));
    await assert.rejects(requestMerch(db, partner, { itemId: "merch-flyers", size: "", note: "" }), says(/out of stock/u));
    await db.dropDatabase();
  });
});
