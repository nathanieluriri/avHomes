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
  formatMoney,
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
import { alertsFor, balanceFor, createDeal, marketingCounts, recordSale, reconcile, reviewDeal, type FundAccrual } from "./repo";
import { claimDueReminders, logPayment, planAlertsFor, rejectPayment, settleNumbers, verifyPayment } from "./plans";
import { createLead, winLead } from "./leads";
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
async function planDeal(reporter: Marketer, settings: MarketingSettings, total: number, plan: DealPlan | null, self = false, leadId: string | null = null) {
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
      leadId,
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

  test("a partner's alerts follow the plan: overdue, each verified payment's earnings, a refusal's reason", async () => {
    const upline = await addMarketer("al-up", []);
    const closer = await addMarketer("al", ["al-up"]);
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const now = Date.now();
    const ids = async (id: string) => (await planAlertsFor(db, id, Date.now())).map((a) => a.id);
    const deal = await planDeal(closer, settings, 3_000_000, { depositMinor: 1_000_000, instalments: 2, frequency: "monthly", firstDueOn: now - 2 * DAY });
    assert.deepEqual(await ids("al"), [], "nothing is owed before approval");

    await reviewDeal(db, deal.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, settings, accrue);
    const overdue = (await planAlertsFor(db, "al", Date.now())).find((a) => a.id === `plan-overdue:${deal.id}:1`);
    assert.equal(overdue?.tone, "act");
    assert.equal(overdue?.action.label, "Log a payment");
    assert.ok(!(await ids("al")).some((id) => id.startsWith("plan-earned")), "the deposit is announced with the approval");

    const logged = await logPayment(db, deal.id, { amountMinor: 1_000_000, paidOn: now, proof: ["/p.jpg"], note: "" }, { side: "marketer", name: "al", marketerId: "al" }, accrue);
    assert.ok(!(await ids("al")).includes(`plan-overdue:${deal.id}:1`), "logged money is not chased");
    await verifyPayment(db, deal.id, logged.payment.id, CTX, accrue);
    const earned = (await planAlertsFor(db, "al", Date.now())).find((a) => a.id === `plan-earned:${logged.payment.id}`);
    assert.match(earned?.title ?? "", /^You earned/u);
    assert.ok((await ids("al-up")).includes(`plan-earned:${logged.payment.id}:2`), "the upline hears about their share");
    const approvedNews = (await alertsFor(db, upline, settings, { now: Date.now(), bankCheck: false })).find((a) => a.id === `deal-approved:${deal.id}`);
    const stored = await db.collection("marketing_deals").findOne({ _id: deal.id as never });
    const depositShare = (stored!.payments[0].shares as DealShare[]).find((row) => row.marketerId === "al-up")!.amountMinor;
    assert.equal(approvedNews?.title, `You earned ${formatMoney(depositShare, "NGN")}`, "the approval tells of the deposit's share, not the running total");

    const second = await logPayment(db, deal.id, { amountMinor: 1_000_000, paidOn: now, proof: [], note: "" }, { side: "marketer", name: "al", marketerId: "al" }, accrue);
    await rejectPayment(db, deal.id, second.payment.id, "Receipt unreadable", CTX);
    const refused = (await planAlertsFor(db, "al", Date.now())).find((a) => a.id === `plan-refused:${second.payment.id}`);
    assert.equal(refused?.detail, "Receipt unreadable");
    await db.dropDatabase();
  });

  test("a partner's own purchase is announced step by step: interest, payment being checked, owner", async () => {
    const buyer = await addMarketer("ob", [], "08035556666");
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const lead = await createLead(
      db,
      buyer,
      { buyerName: buyer.displayName, buyerPhone: buyer.phone, buyerEmail: "", listingId: "prop_own", listingTitle: "Terrace, Ikoyi", wantUnits: [], wantKind: null, wantArea: "", wantBudgetMinor: 0, brief: "", self: true },
      settings,
    );
    const interest = (await planAlertsFor(db, "ob", Date.now())).find((a) => a.id === `purchase-interest:${lead.id}`);
    assert.match(interest?.action.href ?? "", new RegExp(`lead=${lead.id}`, "u"));

    const deal = await planDeal(buyer, settings, 2_000_000, null, true, lead.id);
    const checking = await planAlertsFor(db, "ob", Date.now());
    assert.ok(checking.some((a) => a.id === `purchase-checking:${deal.id}`));
    assert.ok(!checking.some((a) => a.id === `purchase-interest:${lead.id}`), "the interest gives way to the payment");

    await reviewDeal(db, deal.id, { status: "approved", reason: "", actorId: "u1", actorName: CTX.name }, settings, accrue);
    const owned = await planAlertsFor(db, "ob", Date.now());
    assert.deepEqual(owned.map((a) => a.id), [`purchase-owned:${deal.id}`]);
    await db.dropDatabase();
  });

  test("a console sale on a plan earns on its deposit, counts its logged payments, and shows the partner what is to come", async () => {
    const closer = await addMarketer("cs", []);
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const now = Date.now();
    const deal = await recordSale(
      db,
      {
        listingId: "prop_console",
        unitKey: "",
        kind: "sale",
        amountMinor: 10_000_000,
        currency: "NGN",
        buyerName: "Chika",
        buyerPhone: "",
        closedOn: now - DAY,
        proof: ["/deposit.jpg"],
        note: "",
        closer: { kind: "marketer", marketerId: closer.id },
        dealId: null,
        plan: { depositMinor: 2_000_000, instalments: 4, frequency: "monthly", firstDueOn: now + 20 * DAY },
        actorId: "u1",
        actorName: CTX.name,
      },
      settings,
      { ownership: "av", title: "Console plot", location: "Lekki", estate: "" },
      accrue,
    );
    assert.equal(deal.status, "approved");
    assert.equal(deal.paidMinor, 2_000_000);
    assert.equal(deal.payments[0]?.paidOn, now - DAY, "the deposit is dated the day the sale closed");

    const full = deal.planShares.find((share) => share.marketerId === "cs")!.amountMinor;
    const earned = deal.shares.find((share) => share.marketerId === "cs")!.amountMinor;
    const balance = await balanceFor(db, "cs", "NGN");
    assert.equal(balance.planToComeMinor, full - earned);
    assert.equal(balance.plansOpen, 1);

    const logged = await logPayment(db, deal.id, { amountMinor: 2_000_000, paidOn: now, proof: ["/p.jpg"], note: "" }, { side: "marketer", name: "cs", marketerId: "cs" }, accrue);
    assert.equal((await marketingCounts(db)).paymentsWaiting, 1);
    await verifyPayment(db, deal.id, logged.payment.id, CTX, accrue, 1_500_000);
    assert.equal((await marketingCounts(db)).paymentsWaiting, 0);
    const after = await balanceFor(db, "cs", "NGN");
    assert.ok((after.planToComeMinor ?? 0) < (balance.planToComeMinor ?? 0), "a verified payment moves money from to come into earned");
    assert.deepEqual(await reconcile(db), { ok: true, problems: [] });
    await db.dropDatabase();
  });

  test("a buyer marked bought on a plan becomes an approved plan deal that earns on its deposit only", async () => {
    const partner = await addMarketer("wl", []);
    const settings = await readMarketingSettings(db);
    const { accrue } = fundRecorder();
    const lead = await createLead(
      db,
      partner,
      { buyerName: "Ngozi", buyerPhone: "08039998888", buyerEmail: "", listingId: "prop_lead", listingTitle: "Semi, Ajah", wantUnits: [], wantKind: "sale", wantArea: "", wantBudgetMinor: 0, brief: "", self: false },
      settings,
    );
    const { dealId } = await winLead(
      db,
      lead.id,
      {
        listingId: "prop_lead",
        listingTitle: "Semi, Ajah",
        listingLocation: "",
        listingEstate: "",
        listingType: "sale",
        unitKey: "",
        amountMinor: 6_000_000,
        closedOn: Date.now(),
        reason: "Deposit taken",
        note: "Deposit in, the rest over three months.",
        ownership: "av",
        plan: { depositMinor: 1_500_000, instalments: 3, frequency: "monthly", firstDueOn: Date.now() + 30 * DAY },
      },
      partner,
      { id: "u1", name: CTX.name, side: "admin" },
      settings,
      accrue,
    );
    const doc = await db.collection("marketing_deals").findOne({ _id: dealId as never });
    assert.equal(doc?.status, "approved");
    assert.equal(doc?.paidMinor, 1_500_000);
    assert.equal((await ledgerTotals(dealId)).get("wl"), Math.floor((1_500_000 * 5) / 100));
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
