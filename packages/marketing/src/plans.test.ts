/*
 * Payment plans pay commission only on money received, and never more in total
 * than the outright sale would have.
 *
 * The maths tests always run. The database tests need MONGODB_URI (a throwaway
 * server; each run uses its own database and drops it) or they are skipped.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import {
  DEFAULT_MARKETING_SETTINGS,
  planSchedule,
  planStanding,
  reminderKey,
  slicePayment,
  splitDeal,
  splitFor,
  type DealPlan,
  type DealShare,
  type FundShare,
  type Marketer,
  type MarketingSettings,
} from "@avhomes/contracts";
import { createDeal, reconcile, reviewDeal, type FundAccrual } from "./repo";
import { claimDueReminders, logPayment, rejectPayment, settleNumbers, verifyPayment } from "./plans";
import { writeMarketingSettings, readMarketingSettings } from "./settings";

const DAY = 24 * 60 * 60 * 1000;

/** A small deterministic generator, so a failure can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function fullSplit(total: number) {
  const cell = splitFor(DEFAULT_MARKETING_SETTINGS.commission, "partner", "sale");
  const chain = [
    { id: "m1", name: "One", code: "AV-0001", status: "active" as const },
    { id: "m2", name: "Two", code: "AV-0002", status: "active" as const },
    { id: "m3", name: "Three", code: "AV-0003", status: "active" as const },
  ];
  const split = splitDeal(total, cell, chain);
  const people: DealShare[] = split.people.map((p) => ({ ...p }));
  return { people, funds: split.funds as FundShare[], kept: split.keptMinor };
}

describe("payment plan maths", () => {
  test("the schedule always adds up to the price, the last payment taking the remainder", () => {
    const plan: DealPlan = { depositMinor: 1_000_001, instalments: 7, frequency: "monthly", firstDueOn: Date.UTC(2026, 0, 31, 12) };
    const rows = planSchedule(10_000_000, plan);
    assert.equal(rows.length, 8);
    assert.equal(rows.reduce((t, r) => t + r.amountMinor, 0), 10_000_000);
    assert.equal(rows[0]!.n, 0);
    assert.equal(new Date(rows[2]!.dueOn).getDate() <= 29, true, "31 January plus a month lands at the end of February");
  });

  test("however a plan is paid, each person and fund ends with exactly their full-price share", () => {
    const next = rng(42);
    for (let run = 0; run < 400; run++) {
      const total = 1 + Math.floor(next() * 500_000_000);
      const full = fullSplit(total);
      let paid = 0;
      const people = new Map<string, number>();
      const funds = new Map<string, number>();
      let kept = 0;
      while (paid < total) {
        const amount = Math.min(total - paid, 1 + Math.floor(next() * (total / 3 + 1)));
        const slice = slicePayment(paid, amount, total, full);
        const out =
          slice.people.reduce((t, s) => t + s.amountMinor, 0) + slice.funds.reduce((t, s) => t + s.amountMinor, 0);
        assert.equal(out + slice.keptMinor, amount, "every payment is fully accounted for");
        assert.ok(slice.keptMinor >= 0);
        for (const s of slice.people) people.set(s.marketerId, (people.get(s.marketerId) ?? 0) + s.amountMinor);
        for (const s of slice.funds) funds.set(s.fund, (funds.get(s.fund) ?? 0) + s.amountMinor);
        kept += slice.keptMinor;
        paid += amount;
      }
      for (const share of full.people) assert.equal(people.get(share.marketerId) ?? 0, share.amountMinor, `total ${total}`);
      for (const share of full.funds) assert.equal(funds.get(share.fund) ?? 0, share.amountMinor, `total ${total}`);
      assert.equal(kept, full.kept);
    }
  });

  test("the deposit is dated the day it was paid, not the day the deal was approved", () => {
    const cell = splitFor(DEFAULT_MARKETING_SETTINGS.commission, "av", "sale");
    const plan: DealPlan = { depositMinor: 2_000_000, instalments: 4, frequency: "monthly", firstDueOn: Date.UTC(2026, 5, 1) };
    const closedOn = Date.UTC(2026, 3, 3);
    const approvedAt = Date.UTC(2026, 3, 20);
    const settled = settleNumbers(10_000_000, cell, [], plan, { at: approvedAt, paidOn: closedOn, byName: "Arc", proof: [] });
    assert.equal(settled.payments[0]?.paidOn, closedOn);
    assert.equal(settled.payments[0]?.reviewedAt, approvedAt);
    const legacy = settleNumbers(10_000_000, cell, [], plan, { at: approvedAt, byName: "Arc", proof: [] });
    assert.equal(legacy.payments[0]?.paidOn, approvedAt, "a caller that does not say falls back to the approval time");
  });

  test("a payment past the price earns nothing beyond it", () => {
    const full = fullSplit(1000);
    const slice = slicePayment(900, 500, 1000, full);
    const out = slice.people.reduce((t, s) => t + s.amountMinor, 0) + slice.funds.reduce((t, s) => t + s.amountMinor, 0);
    assert.equal(out + slice.keptMinor, 100);
  });

  test("reminders: due soon, then overdue, then once a week while overdue, and none for logged money", () => {
    const now = Date.UTC(2026, 9, 19, 9);
    const plan: DealPlan = { depositMinor: 100, instalments: 3, frequency: "monthly", firstDueOn: now + 2 * DAY };
    const soon = planStanding(400, plan, [{ amountMinor: 100, status: "verified" }], now);
    assert.equal(soon.state, "due-soon");
    assert.deepEqual(reminderKey(soon, now), { key: "1:soon", late: false });

    const late = planStanding(400, plan, [{ amountMinor: 100, status: "verified" }], now + 3 * DAY);
    assert.deepEqual(reminderKey(late, now + 3 * DAY), { key: "1:late", late: true });
    assert.deepEqual(reminderKey(late, now + 10 * DAY), { key: "1:late:1", late: true });

    const logged = planStanding(400, plan, [{ amountMinor: 100, status: "verified" }, { amountMinor: 100, status: "pending" }], now + 3 * DAY);
    assert.equal(logged.next?.n, 2);
    assert.equal(logged.state, "on-track");
    assert.equal(reminderKey(logged, now + 3 * DAY), null);
  });
});

const uri = process.env.MONGODB_URI;
let client: MongoClient;
let db: Db;
const CTX = { name: "Tolu Admin" };

interface Accrued {
  [key: string]: number;
}

function fundRecorder(): { accrue: FundAccrual; accrued: Accrued; calls: number[] } {
  const accrued: Accrued = {};
  const calls: number[] = [];
  return {
    accrued,
    calls,
    accrue: async (_db, input) => {
      calls.push(1);
      for (const share of input.shares) {
        // Mirrors the real fund ledger: one entry per deal, payment and fund.
        accrued[`${input.dealId}:${input.key ?? ""}:${share.fund}`] = share.amountMinor;
      }
    },
  };
}

async function addMarketer(id: string, upline: string[], phone = ""): Promise<Marketer> {
  const now = Date.now();
  const doc = {
    _id: id,
    userId: `usr_${id}`,
    code: `AV-${id}`,
    seq: Math.floor(Math.random() * 1e6),
    displayName: `Partner ${id}`,
    email: `${id}@test.local`,
    phone,
    state: "Lagos",
    status: "active",
    statusReason: "",
    statusAt: null,
    parentId: upline[0] ?? null,
    upline,
    bank: null,
    isAdmin: false,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("marketers").insertOne(doc as never);
  return { ...doc, id } as unknown as Marketer;
}

async function ledgerTotals(dealId: string): Promise<Map<string, number>> {
  const rows = await db.collection("marketing_ledger").find({ dealId, status: { $ne: "void" } }).toArray();
  const by = new Map<string, number>();
  for (const row of rows) by.set(row.marketerId as string, (by.get(row.marketerId as string) ?? 0) + (row.amountMinor as number));
  return by;
}

let listing = 0;
async function planDeal(reporter: Marketer, settings: MarketingSettings, total: number, plan: DealPlan | null, self = false) {
  listing += 1;
  return createDeal(
    db,
    reporter,
    {
      listingId: `prop_${listing}`,
      listingTitle: `Plot ${listing}`,
      listingLocation: "Lekki",
      listingEstate: "",
      listingType: "sale",
      unitKey: "",
      amountMinor: total,
      currency: "NGN",
      buyerName: self ? reporter.displayName : "Ada Buyer",
      buyerPhone: self ? reporter.phone : "08030000000",
      proof: ["/r.jpg"],
      note: "",
      closedOn: Date.now(),
      ownership: "av",
      plan,
      selfPurchase: self,
    },
    settings,
  );
}

describe("payment plan deals", { skip: uri ? false : "set MONGODB_URI to run" }, () => {
  before(async () => {
    client = await MongoClient.connect(uri!);
  });
  after(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    db = client.db(`avhomes_test_plans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  });

  test("approval earns only on the deposit; each verified payment earns its slice; the total equals the outright split", async () => {
    await addMarketer("top", []);
    await addMarketer("mid", ["top"]);
    const closer = await addMarketer("low", ["mid", "top"]);
    const settings = await readMarketingSettings(db);
    const total = 25_000_003;
    const plan: DealPlan = { depositMinor: 5_000_001, instalments: 4, frequency: "monthly", firstDueOn: Date.now() + 30 * DAY };
    const { accrue, accrued } = fundRecorder();

    const deal = await planDeal(closer, settings, total, plan);
    const approved = await reviewDeal(db, deal.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, settings, accrue);
    assert.equal(approved.paidMinor, 5_000_001);
    assert.equal(approved.payments.length, 1);
    assert.equal(approved.planShares.length, 3);
    const outright = splitDeal(total, splitFor(settings.commission, "av", "sale"), [
      { id: "low", name: "", code: "", status: "active" },
      { id: "mid", name: "", code: "", status: "active" },
      { id: "top", name: "", code: "", status: "active" },
    ]);
    assert.equal((await ledgerTotals(deal.id)).get("low"), Math.floor((5_000_001 * 5) / 100));

    // Logged from the app, then verified; then three from the console in awkward amounts.
    const fromApp = await logPayment(db, deal.id, { amountMinor: 4_999_999, paidOn: Date.now(), proof: ["/p.jpg"], note: "" }, { side: "marketer", name: "low", marketerId: "low" }, accrue);
    assert.equal(fromApp.payment.status, "pending");
    assert.equal(fromApp.deal.paidMinor, 5_000_001, "pending money earns nothing yet");
    await verifyPayment(db, deal.id, fromApp.payment.id, CTX, accrue);
    await assert.rejects(verifyPayment(db, deal.id, fromApp.payment.id, CTX, accrue), /payment_decided/u);

    await logPayment(db, deal.id, { amountMinor: 3_333_333, paidOn: Date.now(), proof: [], note: "" }, { side: "admin", name: CTX.name }, accrue);
    await assert.rejects(
      logPayment(db, deal.id, { amountMinor: total, paidOn: Date.now(), proof: [], note: "" }, { side: "admin", name: CTX.name }, accrue),
      /payment_too_large/u,
    );
    const rest = total - 5_000_001 - 4_999_999 - 3_333_333;
    const last = await logPayment(db, deal.id, { amountMinor: rest, paidOn: Date.now(), proof: [], note: "" }, { side: "admin", name: CTX.name }, accrue);
    assert.equal(last.verified?.complete, true);
    assert.equal(last.deal.paidMinor, total);

    const totals = await ledgerTotals(deal.id);
    for (const line of outright.people) assert.equal(totals.get(line.marketerId), line.amountMinor, line.marketerId);
    for (const share of outright.funds) {
      const sum = Object.entries(accrued)
        .filter(([key]) => key.startsWith(`${deal.id}:`) && key.endsWith(`:${share.fund}`))
        .reduce((t, [, v]) => t + v, 0);
      assert.equal(sum, share.amountMinor, share.fund);
    }
    assert.equal(last.deal.keptMinor, outright.keptMinor);
    assert.deepEqual(await reconcile(db), { ok: true, problems: [] });
    await db.dropDatabase();
  });

  test("two payments verified at the same moment are each priced from the right starting point", async () => {
    const closer = await addMarketer("solo", []);
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const total = 9_999_999;
    const deal = await planDeal(closer, settings, total, { depositMinor: 0, instalments: 3, frequency: "monthly", firstDueOn: Date.now() + DAY });
    await reviewDeal(db, deal.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, settings, accrue);
    const a = await logPayment(db, deal.id, { amountMinor: 3_333_333, paidOn: 0, proof: [], note: "" }, { side: "marketer", name: "solo", marketerId: "solo" }, accrue);
    const b = await logPayment(db, deal.id, { amountMinor: 6_666_666, paidOn: 0, proof: [], note: "" }, { side: "marketer", name: "solo", marketerId: "solo" }, accrue);
    await Promise.all([verifyPayment(db, deal.id, a.payment.id, CTX, accrue), verifyPayment(db, deal.id, b.payment.id, CTX, accrue)]);
    assert.equal((await ledgerTotals(deal.id)).get("solo"), Math.floor((total * 5) / 100));
    await db.dropDatabase();
  });

  test("a rejected payment earns nothing and frees its amount to be logged again", async () => {
    const closer = await addMarketer("rj", []);
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const deal = await planDeal(closer, settings, 1_000_000, { depositMinor: 500_000, instalments: 1, frequency: "monthly", firstDueOn: Date.now() + DAY });
    await reviewDeal(db, deal.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, settings, accrue);
    const logged = await logPayment(db, deal.id, { amountMinor: 500_000, paidOn: 0, proof: [], note: "" }, { side: "marketer", name: "rj", marketerId: "rj" }, accrue);
    await assert.rejects(
      logPayment(db, deal.id, { amountMinor: 1, paidOn: 0, proof: [], note: "" }, { side: "marketer", name: "rj", marketerId: "rj" }, accrue),
      /payment_too_large/u,
    );
    const rejected = await rejectPayment(db, deal.id, logged.payment.id, "Receipt unreadable", CTX);
    assert.equal(rejected.deal.paidMinor, 500_000);
    await logPayment(db, deal.id, { amountMinor: 500_000, paidOn: 0, proof: [], note: "" }, { side: "marketer", name: "rj", marketerId: "rj" }, accrue);
    await db.dropDatabase();
  });

  test("a partner's own purchase pays nobody by default, and pays as usual when the setting is on", async () => {
    await addMarketer("up", []);
    const buyer = await addMarketer("me", ["up"], "08031112222");
    const { accrue, accrued } = fundRecorder();

    const off = await readMarketingSettings(db);
    const own = await planDeal(buyer, off, 2_000_000, null, true);
    const settled = await reviewDeal(db, own.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, off, accrue);
    assert.equal(settled.shares.length, 0);
    assert.equal(settled.closerKind, "direct");
    assert.ok(Object.keys(accrued).some((key) => key.startsWith(own.id)), "the funds still take their share");
    assert.equal((await ledgerTotals(own.id)).size, 0);

    await writeMarketingSettings(db, { selfPurchaseCommission: true });
    const on = await readMarketingSettings(db);
    const paid = await planDeal(buyer, on, 2_000_000, null, true);
    const settledOn = await reviewDeal(db, paid.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, on, accrue);
    assert.deepEqual(settledOn.shares.map((s) => s.marketerId), ["me", "up"]);
    await db.dropDatabase();
  });

  test("each reminder is claimed once, however many runs overlap", async () => {
    const closer = await addMarketer("rm", []);
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const now = Date.now();
    const deal = await planDeal(closer, settings, 300_000, { depositMinor: 100_000, instalments: 2, frequency: "monthly", firstDueOn: now - 2 * DAY });
    await reviewDeal(db, deal.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, settings, accrue);
    const [a, b] = await Promise.all([claimDueReminders(db, now), claimDueReminders(db, now)]);
    assert.equal(a.length + b.length, 1);
    assert.equal([...a, ...b][0]!.late, true);
    assert.equal((await claimDueReminders(db, now)).length, 0);
    assert.equal((await claimDueReminders(db, now + 6 * DAY)).length, 1, "a week overdue earns the weekly nudge");
    await db.dropDatabase();
  });
});
