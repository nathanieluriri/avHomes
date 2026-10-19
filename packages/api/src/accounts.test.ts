/*
 * The balance sheet's promises, tested on rows rather than a database: every
 * total ties back to the rows behind it, and every roll-forward closes.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeAccounts, type AccountsInput, type DealRow, type FundRow, type LedgerRow, type PayRunRow } from "./accounts";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const NAMES = { reward: "Reward Pool", foundation: "AV Foundation" } as const;

const outright: DealRow = {
  _id: "d-out",
  listingTitle: "Bungalow, Ajah",
  buyerName: "Tunde",
  reporterName: "Ada",
  closerKind: "marketer",
  closerName: "Ada",
  amountMinor: 10_000_000,
  closedOn: at(2026, 3, 10),
  shares: [
    { level: 1, amountMinor: 500_000 },
    { level: 2, amountMinor: 100_000 },
  ],
  fundShares: [{ amountMinor: 100_000 }, { amountMinor: 100_000 }],
  keptMinor: 9_200_000,
};

/* 12,000,000 on a plan: 3,000,000 down in January, a second 3,000,000 verified, a third logged in April. */
const plan: DealRow = {
  _id: "d-plan",
  listingTitle: "Duplex, Lekki",
  buyerName: "Bisi",
  reporterName: "Ada",
  closerKind: "marketer",
  closerName: "Ada",
  amountMinor: 12_000_000,
  closedOn: at(2026, 1, 5),
  plan: { depositMinor: 3_000_000, instalments: 3, frequency: "monthly", firstDueOn: at(2026, 2, 5) },
  shares: [{ level: 1, amountMinor: 300_000 }],
  planShares: [{ level: 1, amountMinor: 600_000 }],
  fundShares: [{ amountMinor: 120_000 }],
  keptMinor: 5_580_000,
  payments: [
    {
      id: "p0",
      amountMinor: 3_000_000,
      paidOn: at(2026, 1, 5),
      status: "verified",
      note: "Deposit",
      shares: [{ level: 1, amountMinor: 150_000 }],
      fundShares: [{ amountMinor: 60_000 }],
      keptMinor: 2_790_000,
    },
    {
      id: "p1",
      amountMinor: 3_000_000,
      // Dated before the deal closed; it must still count no earlier than the close.
      paidOn: at(2025, 12, 30),
      status: "verified",
      note: "",
      shares: [{ level: 1, amountMinor: 150_000 }],
      fundShares: [{ amountMinor: 60_000 }],
      keptMinor: 2_790_000,
    },
    { id: "p2", amountMinor: 3_000_000, paidOn: at(2026, 4, 2), status: "pending", note: "" },
  ],
};

const ledger: LedgerRow[] = [
  { kind: "earn", status: "paid", amountMinor: 400_000, createdAt: at(2025, 12, 1) },
  { kind: "earn", status: "earned", amountMinor: 500_000, createdAt: at(2026, 3, 12) },
  { kind: "earn", status: "void", amountMinor: 999_999, createdAt: at(2026, 3, 12) },
  { kind: "clawback", status: "earned", amountMinor: -50_000, createdAt: at(2026, 4, 1) },
];

const runs: PayRunRow[] = [
  {
    _id: "run-1",
    month: "2026-01",
    items: [
      {
        marketerId: "m1",
        code: "AV1",
        displayName: "Ada",
        totalMinor: 400_000,
        bank: { bankCode: "058", bankName: "GTB", accountNumber: "0123456789", accountName: "ADA", verifiedAt: 1 },
        status: "paid",
        proof: [],
        reference: "",
        paidAt: at(2026, 1, 28),
        paidByName: "Arc",
        issueId: "issue-resolved",
      },
      {
        marketerId: "m2",
        code: "AV2",
        displayName: "Bayo",
        totalMinor: 70_000,
        bank: null,
        status: "pending",
        proof: [],
        reference: "",
        paidAt: null,
        paidByName: "",
        issueId: "issue-open",
      },
    ],
  },
];

const fundRows: FundRow[] = [
  { fund: "reward", kind: "accrual", amountMinor: 200_000, dealId: "d-old", note: "", byName: "Arc", createdAt: at(2025, 11, 2) },
  { fund: "reward", kind: "accrual", amountMinor: 100_000, dealId: "d-out", note: "", byName: "Arc", createdAt: at(2026, 3, 12) },
  { fund: "reward", kind: "adjustment", amountMinor: -200_000, dealId: "d-old", note: "Cancelled", byName: "Arc", createdAt: at(2026, 2, 3) },
  { fund: "foundation", kind: "payout", amountMinor: -40_000, dealId: null, note: "Books", byName: "Arc", recipient: "School", reference: "T1", paidAt: at(2026, 2, 10), createdAt: at(2026, 2, 11) },
  { fund: "foundation", kind: "payout", amountMinor: -99_000, dealId: null, note: "Wrong", byName: "Arc", recipient: "X", paidAt: at(2026, 2, 10), voidedAt: at(2026, 2, 12), createdAt: at(2026, 2, 11) },
  { fund: "foundation", kind: "adjustment", amountMinor: 99_000, dealId: null, note: "Void", byName: "Arc", voidsId: "v1", createdAt: at(2026, 2, 12) },
];

function input(over: Partial<AccountsInput> = {}): AccountsInput {
  return {
    from: "2026-01",
    to: "2026-04",
    now: at(2026, 4, 20),
    currency: "NGN",
    names: NAMES,
    deals: [outright, plan],
    waiting: [{ amountMinor: 5_000_000 }],
    ledger,
    runs,
    openIssueIds: new Set(["issue-open"]),
    fundRows,
    dealTitles: new Map([["d-old", "Old plot"]]),
    fundsNow: [],
    check: { ok: true, problems: [] },
    ...over,
  };
}

describe("balance sheet", () => {
  const report = computeAccounts(input());
  const month = (key: string) => report.months.find((m) => m.month === key)!;

  test("an outright deal is money in on the day it closed, split into commission, overrides, funds and kept", () => {
    const march = month("2026-03");
    assert.equal(march.deals, 1);
    assert.equal(march.agreedMinor, 10_000_000);
    assert.equal(march.commissionMinor, 500_000);
    assert.equal(march.overridesMinor, 100_000);
    assert.equal(month("2026-01").commissionMinor, 150_000 + 150_000, "both plan payments land on the close");
  });

  test("a plan counts its full price as agreed when it closes, and only what was paid as money in", () => {
    const jan = month("2026-01");
    assert.equal(jan.agreedMinor, 12_000_000);
    assert.equal(jan.planAgreedMinor, 12_000_000);
    // The deposit, and the instalment dated before the close, both land on the close.
    assert.equal(jan.moneyInMinor, 6_000_000);
    assert.equal(jan.planReceivedMinor, 6_000_000);
    assert.equal(month("2026-04").moneyInMinor, 0, "a logged payment is not money in until it is verified");
  });

  test("every month's money in is exactly commission + overrides + funds + kept", () => {
    for (const m of report.months) {
      assert.equal(m.moneyInMinor, m.commissionMinor + m.overridesMinor + m.fundsMinor + m.keptMinor, m.month);
    }
  });

  test("owed to partners rolls forward: start + credited - clawed back - paid = end", () => {
    const p = report.partners;
    assert.equal(p.startMinor, 400_000, "the December line was owed going into January");
    assert.equal(p.earnedMinor, 500_000, "a void line is never counted");
    assert.equal(p.clawbackMinor, 50_000);
    assert.equal(p.paidOutMinor, 400_000);
    assert.equal(p.endMinor, p.startMinor + p.earnedMinor - p.clawbackMinor - p.paidOutMinor);
    assert.equal(month("2026-04").owedEndMinor, p.endMinor);
  });

  test("each fund rolls forward, and a voided payment and its reversal leave no trace", () => {
    for (const fund of report.funds) {
      assert.equal(fund.endMinor, fund.startMinor + fund.inMinor - fund.outMinor, fund.name);
    }
    const reward = report.funds.find((f) => f.fund === "reward")!;
    assert.equal(reward.startMinor, 200_000);
    assert.equal(reward.inMinor, 100_000 - 200_000);
    const foundation = report.funds.find((f) => f.fund === "foundation")!;
    assert.equal(foundation.outMinor, 40_000);
    const returned = report.fundMoves.find((m) => m.type === "returned");
    assert.equal(returned?.detail, "Old plot");
  });

  test("due from buyers rolls forward: start + plans agreed - received = end", () => {
    const b = report.buyers;
    assert.equal(b.startMinor, 0);
    assert.equal(b.newPlansMinor, 12_000_000);
    assert.equal(b.receivedMinor, 6_000_000);
    assert.equal(b.endMinor, b.startMinor + b.newPlansMinor - b.receivedMinor);
    assert.equal(month("2026-04").dueEndMinor, 6_000_000);
  });

  test("today's position names the plans, what is overdue, what is still to come and what waits to be checked", () => {
    const { position } = report;
    assert.equal(position.plans, 1);
    assert.equal(position.dueMinor, 6_000_000);
    // 12,000,000 has fallen due by 20 April: 6,000,000 is verified and 3,000,000 is logged, which is not chased.
    assert.equal(position.overdueMinor, 3_000_000);
    assert.equal(position.toComeMinor, 300_000);
    assert.equal(position.paymentsWaiting, 1);
    assert.equal(position.paymentsWaitingMinor, 3_000_000);
    assert.equal(position.dealsWaiting, 1);
    assert.equal(position.owedMinor, 500_000 - 50_000);
    assert.equal(report.plans[0]?.state, "overdue");
  });

  test("a payout is flagged disputed only while its problem is still open", () => {
    const ada = report.payouts.find((p) => p.code === "AV1")!;
    const bayo = report.payouts.find((p) => p.code === "AV2")!;
    assert.ok(!ada.flags.includes("disputed"));
    assert.ok(ada.flags.includes("no-proof") && ada.flags.includes("no-reference"));
    assert.ok(bayo.flags.includes("disputed") && bayo.flags.includes("no-bank"));
  });

  test("totals are the sum of the months", () => {
    const sum = (key: "moneyInMinor" | "agreedMinor" | "paidOutMinor") => report.months.reduce((s, m) => s + m[key], 0);
    assert.equal(report.totals.moneyInMinor, sum("moneyInMinor"));
    assert.equal(report.totals.agreedMinor, sum("agreedMinor"));
    assert.equal(report.totals.paidOutMinor, sum("paidOutMinor"));
    assert.equal(report.receipts.reduce((s, r) => s + r.amountMinor, 0), report.totals.moneyInMinor);
  });

  test("a deal settled before kept was stored is derived, so it still adds up", () => {
    const legacy: DealRow = { ...outright, _id: "legacy", keptMinor: undefined };
    const r = computeAccounts(input({ deals: [legacy] }));
    const march = r.months.find((m) => m.month === "2026-03")!;
    assert.equal(march.keptMinor, 10_000_000 - 600_000 - 200_000);
  });
});
