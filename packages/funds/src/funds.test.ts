/*
 * The two funds add up: deals feed them, cancellations take back, payments and
 * voids move the balance and nothing else, and the monthly view agrees with the
 * running balance.
 *
 * The database tests need MONGODB_URI (a throwaway server; each test uses its own
 * database and drops it) or they are skipped. The pure maths always runs.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import {
  disbursementRefusal,
  fundMonthOf,
  splitDeal,
  type ChainMember,
  type CommissionSplit,
  type FundKind,
} from "@avhomes/contracts";
import {
  accrueForDeal,
  disburse,
  foldMonths,
  fundBalances,
  fundMonthly,
  listFundEntries,
  listPayments,
  reverseForDeal,
  voidPayment,
} from "./repo";

const uri = process.env.MONGODB_URI;
const NAMES: Record<FundKind, string> = { reward: "Reward Pool", foundation: "AV Foundation" };
const CELL: CommissionSplit = { level1: 5, level2: 2, level3: 1, rewardPool: 1, foundation: 0.5 };
const ADA: ChainMember = { id: "mkt_1", name: "Ada", code: "AV-0002", status: "active" };
const BAYO: ChainMember = { id: "mkt_2", name: "Bayo", code: "AV-0003", status: "paused" };
const CHI: ChainMember = { id: "mkt_3", name: "Chi", code: "AV-0004", status: "active" };
const DAY = 86_400_000;

describe("splitting a deal", () => {
  test("every share plus what AV Homes keeps is the deal, to the kobo", () => {
    for (const amount of [1, 99, 12_345_67, 85_000_000_00, 3_333_333_33]) {
      const split = splitDeal(amount, CELL, [ADA, CHI, CHI]);
      const total =
        split.people.reduce((s, l) => s + l.amountMinor, 0) +
        split.funds.reduce((s, f) => s + f.amountMinor, 0) +
        split.keptMinor;
      assert.equal(total, amount);
      assert.ok(split.keptMinor >= 0);
    }
  });

  test("a paused upline's share stays with AV Homes and level 3 keeps its own rate", () => {
    const split = splitDeal(100_000_000, CELL, [ADA, BAYO, CHI]);
    assert.deepEqual(
      split.people.map((l) => [l.marketerId, l.level, l.amountMinor]),
      [
        ["mkt_1", 1, 5_000_000],
        ["mkt_3", 3, 1_000_000],
      ],
    );
    assert.equal(split.keptMinor, 100_000_000 - 5_000_000 - 1_000_000 - 1_000_000 - 500_000);
  });

  test("both funds take their share of a direct sale with nobody to pay", () => {
    const split = splitDeal(50_000_000, CELL, []);
    assert.deepEqual(split.funds, [
      { fund: "reward", rate: 1, amountMinor: 500_000 },
      { fund: "foundation", rate: 0.5, amountMinor: 250_000 },
    ]);
  });
});

describe("a payment's refusal", () => {
  const ok = { amountMinor: 1000, balanceMinor: 5000, recipient: "Ajah School", note: "Borehole", paidAt: Date.now() };
  test("passes a complete payment without a receipt", () => {
    assert.equal(disbursementRefusal(ok), null);
  });
  test("refuses more than the balance, a missing recipient and a future date", () => {
    assert.match(disbursementRefusal({ ...ok, amountMinor: 5001 }) ?? "", /more than/u);
    assert.match(disbursementRefusal({ ...ok, recipient: " " }) ?? "", /who was paid/u);
    assert.match(disbursementRefusal({ ...ok, paidAt: Date.now() + 3 * DAY }) ?? "", /future/u);
  });
});

describe("the monthly fold", () => {
  test("months are zero filled, voids drop out, and the closing balance runs on", () => {
    const now = new Date(2026, 9, 15).getTime();
    const at = (y: number, m: number, d = 10) => new Date(y, m, d).getTime();
    const rows = [
      { amountMinor: 10_000, currency: "NGN", dealId: "d0", kind: "accrual" as const, createdAt: at(2026, 3) },
      { amountMinor: 5_000, currency: "NGN", dealId: "d1", kind: "accrual" as const, createdAt: at(2026, 7) },
      { amountMinor: 7_000, currency: "NGN", dealId: "d2", kind: "accrual" as const, createdAt: at(2026, 7, 20) },
      { amountMinor: -7_000, currency: "NGN", dealId: "d2", kind: "adjustment" as const, createdAt: at(2026, 8) },
      { amountMinor: -4_000, currency: "NGN", dealId: null, kind: "payout" as const, paidAt: at(2026, 8, 2), createdAt: at(2026, 9) },
      { amountMinor: -1_000, currency: "NGN", dealId: null, kind: "payout" as const, paidAt: at(2026, 9), voidedAt: at(2026, 9, 11), createdAt: at(2026, 9) },
      { amountMinor: 1_000, currency: "NGN", dealId: null, kind: "adjustment" as const, voidsId: "x", createdAt: at(2026, 9, 11) },
    ];
    const out = foldMonths(rows, { fund: "reward", name: "Reward Pool", months: 3, now });
    assert.equal(out.openingMinor, 10_000);
    assert.deepEqual(out.months.map((m) => m.month), ["2026-08", "2026-09", "2026-10"]);
    const [aug, sep, oct] = out.months;
    assert.deepEqual([aug!.inMinor, aug!.deals, aug!.closingMinor], [12_000, 2, 22_000]);
    assert.deepEqual(
      [sep!.reversedMinor, sep!.reversals, sep!.paidMinor, sep!.payments, sep!.netMinor, sep!.closingMinor],
      [7_000, 1, 4_000, 1, -11_000, 11_000],
    );
    assert.deepEqual([oct!.paidMinor, oct!.payments, oct!.closingMinor], [0, 0, 11_000]);
  });

  test("a payment plan paying the fund twice in a month, and again the next, is one deal each month and one in all", () => {
    const now = new Date(2026, 9, 15).getTime();
    const at = (m: number, d: number) => new Date(2026, m, d).getTime();
    const share = (amountMinor: number, dealId: string, createdAt: number) => ({ amountMinor, currency: "NGN", dealId, kind: "accrual" as const, createdAt });
    const out = foldMonths([share(3_000, "plan", at(8, 2)), share(2_000, "plan", at(8, 20)), share(1_000, "other", at(8, 21)), share(2_000, "plan", at(9, 3))], {
      fund: "reward",
      name: "Reward Pool",
      months: 2,
      now,
    });
    const [sep, oct] = out.months;
    assert.deepEqual([sep!.inMinor, sep!.deals], [6_000, 2]);
    assert.deepEqual([oct!.inMinor, oct!.deals], [2_000, 1]);
    assert.equal(out.dealsInWindow, 2);
  });
});

describe("the fund ledger", { skip: uri ? false : "set MONGODB_URI to run" }, () => {
  let client: MongoClient;
  let db: Db;
  before(async () => {
    client = await MongoClient.connect(uri!);
  });
  after(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    db = client.db(`avhomes_test_funds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  });

  const balanceOf = async (fund: FundKind) => (await fundBalances(db, NAMES)).find((b) => b.fund === fund)!;
  const approve = (dealId: string, amount: number) =>
    accrueForDeal(db, { dealId, currency: "NGN", shares: splitDeal(amount, CELL, [ADA]).funds, byName: "Tolu" });
  const pay = (fund: FundKind, amountMinor: number, extra: Partial<Parameters<typeof disburse>[1]> = {}) =>
    disburse(db, {
      fund,
      amountMinor,
      currency: "NGN",
      recipient: "Ajah Primary School",
      note: "Borehole repair",
      reference: "TRF-001",
      paidAt: Date.now() - DAY,
      proof: [],
      byName: "Tolu",
      names: NAMES,
      ...extra,
    });

  test("a deal approved twice is counted once, in both funds", async () => {
    await approve("deal_a", 100_000_000);
    await approve("deal_a", 100_000_000);
    await approve("deal_b", 40_000_000);
    const reward = await balanceOf("reward");
    const foundation = await balanceOf("foundation");
    assert.deepEqual([reward.accruedMinor, reward.paidMinor, reward.balanceMinor], [1_400_000, 0, 1_400_000]);
    assert.deepEqual([foundation.balanceMinor, foundation.entries], [700_000, 2]);
    await db.dropDatabase();
  });

  test("a cancelled deal comes back out of income, not out as a payment, and only once", async () => {
    await approve("deal_a", 100_000_000);
    await approve("deal_b", 40_000_000);
    assert.equal(await reverseForDeal(db, { dealId: "deal_b", byName: "Tolu", note: "Fell through" }), 2);
    assert.equal(await reverseForDeal(db, { dealId: "deal_b", byName: "Tolu", note: "Fell through" }), 0);
    const reward = await balanceOf("reward");
    assert.deepEqual([reward.accruedMinor, reward.paidMinor, reward.balanceMinor], [1_000_000, 0, 1_000_000]);
    await db.dropDatabase();
  });

  test("a deal cancelled and then approved again feeds the funds again, once", async () => {
    await approve("deal_a", 100_000_000);
    await reverseForDeal(db, { dealId: "deal_a", byName: "Tolu", note: "Wrong buyer" });
    assert.equal((await balanceOf("reward")).balanceMinor, 0);
    await approve("deal_a", 100_000_000);
    await approve("deal_a", 100_000_000);
    assert.equal((await balanceOf("reward")).balanceMinor, 1_000_000);
    assert.equal((await balanceOf("foundation")).balanceMinor, 500_000);
    await db.dropDatabase();
  });

  test("a payment is refused past the balance and writes nothing", async () => {
    await approve("deal_a", 100_000_000);
    await assert.rejects(pay("foundation", 500_001), /fund_disbursement_refused/u);
    const page = await listFundEntries(db, { fund: "foundation", limit: 20 });
    assert.equal(page.entries.length, 1);
    await db.dropDatabase();
  });

  test("payments from either fund carry who, when and why, and reduce only that fund", async () => {
    await approve("deal_a", 100_000_000);
    const paidAt = Date.now() - 3 * DAY;
    const entry = await pay("reward", 250_000, { recipient: "Ada Obi", note: "Top seller hamper", paidAt });
    assert.deepEqual([entry.recipient, entry.reference, entry.paidAt, entry.amountMinor], ["Ada Obi", "TRF-001", paidAt, -250_000]);
    await pay("foundation", 100_000);
    const reward = await balanceOf("reward");
    assert.deepEqual([reward.accruedMinor, reward.paidMinor, reward.balanceMinor], [1_000_000, 250_000, 750_000]);
    assert.equal((await balanceOf("foundation")).balanceMinor, 400_000);
    await db.dropDatabase();
  });

  test("two payments at once cannot overdraw the fund", async () => {
    await approve("deal_a", 100_000_000);
    const results = await Promise.allSettled([pay("foundation", 400_000), pay("foundation", 400_000)]);
    assert.ok(results.some((r) => r.status === "rejected"));
    assert.ok((await balanceOf("foundation")).balanceMinor >= 0);
    await db.dropDatabase();
  });

  test("voiding a payment gives the money back once and keeps the row", async () => {
    await approve("deal_a", 100_000_000);
    const entry = await pay("foundation", 200_000);
    const voided = await voidPayment(db, { fund: "foundation", id: entry.id, reason: "Typed the wrong amount", byName: "Tolu" });
    assert.notEqual(voided.voidedAt, null);
    assert.equal(voided.voidReason, "Typed the wrong amount");
    await voidPayment(db, { fund: "foundation", id: entry.id, reason: "Again", byName: "Tolu" });
    const foundation = await balanceOf("foundation");
    assert.deepEqual([foundation.paidMinor, foundation.balanceMinor], [0, 500_000]);
    const payments = await listPayments(db, { fund: "foundation", limit: 20 });
    assert.equal(payments.length, 1);
    assert.notEqual(payments[0]!.voidedAt, null);
    await db.dropDatabase();
  });

  test("a prize payment cannot be voided from here", async () => {
    await db.collection("fund_ledger").insertOne({
      _id: "fund_prize",
      fund: "reward",
      kind: "payout",
      amountMinor: -1000,
      currency: "NGN",
      dealId: null,
      rate: 0,
      awardId: "awrd_1",
      note: "Prize",
      proof: [],
      byName: "Tolu",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never);
    await assert.rejects(
      voidPayment(db, { fund: "reward", id: "fund_prize", reason: "Wrong person", byName: "Tolu" }),
      /fund_void_refused/u,
    );
    await db.dropDatabase();
  });

  test("the monthly view closes on the same balance as the fund", async () => {
    await approve("deal_a", 100_000_000);
    await approve("deal_b", 40_000_000);
    await reverseForDeal(db, { dealId: "deal_b", byName: "Tolu", note: "Fell through" });
    await pay("reward", 300_000, { paidAt: Date.now() });
    const monthly = await fundMonthly(db, { fund: "reward", months: 12, names: NAMES });
    const last = monthly.months.at(-1)!;
    assert.equal(monthly.months.length, 12);
    assert.equal(last.month, fundMonthOf(Date.now()));
    assert.deepEqual([last.inMinor, last.deals, last.reversedMinor, last.paidMinor], [1_400_000, 2, 400_000, 300_000]);
    assert.equal(last.closingMinor, (await balanceOf("reward")).balanceMinor);
    await db.dropDatabase();
  });
});
