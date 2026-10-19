import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { BadRequestError, currentDb, readJson, readQuery, type AppEnv } from "@avhomes/core";
import {
  FUND_MOVE_LABEL,
  PAYOUT_FLAG_LABELS,
  PLAN_STATE_LABEL,
  RECEIPT_TYPE_LABEL,
  fundMonthLabel,
  fundMonthOf,
  minorUnitsFor,
  planSchedule,
  planStanding,
  type AccountsDeal,
  type AccountsFlows,
  type AccountsFundMove,
  type AccountsMonth,
  type AccountsPlan,
  type AccountsReceipt,
  type AccountsReport,
  type AccountsSummary,
  type DealPlan,
  type FundKind,
  type FundMoveType,
  type FundRoll,
  type MarketerBank,
  type PaymentStatus,
  type PayoutFlag,
  type PayoutRecord,
  type PlanState,
  type ReceiptType,
} from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";
import { fundBalances } from "@avhomes/funds";
import {
  readMarketingSettings,
  reconcile,
  sheetCsv,
  workbook,
  type Sheet,
  type SheetCell,
  type SheetColumn,
  type StatementLine,
} from "@avhomes/marketing";

/* ══════════════════════════════════════════════════════════════════ ROWS ══ */

interface ShareRow {
  level: number;
  amountMinor: number;
}

interface PaymentRow {
  id: string;
  amountMinor: number;
  paidOn: number;
  status: PaymentStatus;
  note: string;
  shares?: ShareRow[];
  fundShares?: { amountMinor: number }[];
  keptMinor?: number;
}

export interface DealRow {
  _id: string;
  listingTitle?: string;
  listingType?: string;
  ownership?: string;
  buyerName?: string;
  reporterName?: string;
  closerKind?: string;
  closerName?: string;
  amountMinor: number;
  closedOn: number;
  shares?: ShareRow[];
  fundShares?: { amountMinor: number }[];
  keptMinor?: number;
  plan?: DealPlan | null;
  payments?: PaymentRow[];
  planShares?: ShareRow[];
  selfPurchase?: boolean;
}

export interface LedgerRow {
  kind: string;
  status: string;
  amountMinor: number;
  createdAt: number;
}

export interface FundRow {
  fund: string;
  kind: string;
  amountMinor: number;
  dealId: string | null;
  note: string;
  byName: string;
  recipient?: string;
  reference?: string;
  paidAt?: number | null;
  voidedAt?: number | null;
  voidsId?: string | null;
  createdAt: number;
}

export interface PayRunRow {
  _id: string;
  month: string;
  items: {
    marketerId: string;
    code: string;
    displayName: string;
    totalMinor: number;
    bank: MarketerBank | null;
    status: "pending" | "paid" | "held";
    proof: string[];
    reference: string;
    paidAt: number | null;
    paidByName: string;
    issueId: string | null;
  }[];
}

export interface AccountsInput {
  from: string;
  to: string;
  now: number;
  currency: string;
  names: Record<FundKind, string>;
  /** Every approved deal, of any date: plans closed years ago are still being paid. */
  deals: readonly DealRow[];
  /** Deals reported and not yet decided. */
  waiting: readonly { amountMinor: number }[];
  ledger: readonly LedgerRow[];
  runs: readonly PayRunRow[];
  openIssueIds: ReadonlySet<string>;
  fundRows: readonly FundRow[];
  /** Titles for deals a fund line points at, cancelled ones included. */
  dealTitles: ReadonlyMap<string, string>;
  /** From the funds package, so "now" agrees with The two funds page to the kobo. */
  fundsNow: readonly { fund: string; name: string; balanceMinor: number }[];
  check: { ok: boolean; problems: string[] };
}

/* ═══════════════════════════════════════════════════════════════ MONTHS ══ */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;

function monthStart(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year ?? 1970, (mon ?? 1) - 1, 1).getTime();
}

function nextMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return fundMonthOf(new Date(year ?? 1970, mon ?? 1, 1).getTime());
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 60; m = nextMonth(m)) out.push(m);
  return out;
}

function zeroFlows(): AccountsFlows {
  return {
    deals: 0,
    agreedMinor: 0,
    planAgreedMinor: 0,
    moneyInMinor: 0,
    planReceivedMinor: 0,
    commissionMinor: 0,
    overridesMinor: 0,
    fundsMinor: 0,
    keptMinor: 0,
    earnedMinor: 0,
    clawbackMinor: 0,
    paidOutMinor: 0,
    fundInMinor: 0,
    fundOutMinor: 0,
  };
}

/* ════════════════════════════════════════════════════════════════ MATHS ══ */

function total<T>(rows: readonly T[] | undefined, of: (row: T) => number): number {
  let sum = 0;
  for (const row of rows ?? []) sum += of(row);
  return sum;
}

function splitOf(shares: readonly ShareRow[] | undefined): { commission: number; overrides: number } {
  let commission = 0;
  let overrides = 0;
  for (const share of shares ?? []) {
    if (share.level === 1) commission += share.amountMinor;
    else overrides += share.amountMinor;
  }
  return { commission, overrides };
}

/* Stored `keptMinor` is used as it stands, so a row whose shares were ever
   rewritten no longer adds up and the statement's check line says so. A deal
   settled before kept was stored is derived instead. */
function keptOf(amount: number, shares: readonly ShareRow[] | undefined, funds: readonly { amountMinor: number }[] | undefined, kept: number | undefined): number {
  if (typeof kept === "number") return kept;
  return amount - total(shares, (s) => s.amountMinor) - total(funds, (f) => f.amountMinor);
}

/** Who the deal is credited to, in words. A partner's own purchase names the partner. */
function partnerOf(deal: DealRow): string {
  if (deal.selfPurchase) return deal.reporterName ?? "";
  if (deal.closerKind === "direct") return "Direct sale";
  return deal.closerName || deal.reporterName || "";
}

/* A plan payment counts no earlier than the deal it belongs to closed, so what is
   due from buyers can never go below zero across a month boundary. */
function paymentAt(deal: DealRow, payment: PaymentRow): number {
  return Math.max(payment.paidOn || deal.closedOn, deal.closedOn);
}

export function receiptsOf(deal: DealRow): AccountsReceipt[] {
  const base = {
    dealId: deal._id,
    property: deal.listingTitle ?? "",
    buyer: deal.buyerName ?? "",
    partner: partnerOf(deal),
    selfPurchase: deal.selfPurchase ?? false,
  };
  if (!deal.plan) {
    const split = splitOf(deal.shares);
    return [
      {
        ...base,
        at: deal.closedOn,
        type: "outright",
        amountMinor: deal.amountMinor,
        commissionMinor: split.commission,
        overridesMinor: split.overrides,
        fundsMinor: total(deal.fundShares, (f) => f.amountMinor),
        keptMinor: keptOf(deal.amountMinor, deal.shares, deal.fundShares, deal.keptMinor),
      },
    ];
  }
  const out: AccountsReceipt[] = [];
  (deal.payments ?? []).forEach((payment, index) => {
    if (payment.status !== "verified") return;
    const split = splitOf(payment.shares);
    const type: ReceiptType = index === 0 && payment.note === "Deposit" ? "deposit" : "instalment";
    out.push({
      ...base,
      at: paymentAt(deal, payment),
      type,
      amountMinor: payment.amountMinor,
      commissionMinor: split.commission,
      overridesMinor: split.overrides,
      fundsMinor: total(payment.fundShares, (f) => f.amountMinor),
      keptMinor: keptOf(payment.amountMinor, payment.shares, payment.fundShares, payment.keptMinor),
    });
  });
  return out;
}

function verifiedOf(deal: DealRow, before = Infinity): number {
  return total(
    (deal.payments ?? []).filter((p) => p.status === "verified" && paymentAt(deal, p) < before),
    (p) => p.amountMinor,
  );
}

function fundTime(row: FundRow): number {
  return row.kind === "payout" ? (row.paidAt ?? row.createdAt) : row.createdAt;
}

function fundMoveType(row: FundRow): FundMoveType {
  if (row.kind === "payout") return "payment";
  if (row.kind === "accrual") return "share";
  return row.dealId && row.amountMinor < 0 ? "returned" : "adjustment";
}

function flagsFor(item: PayRunRow["items"][number], openIssueIds: ReadonlySet<string>): PayoutFlag[] {
  const flags: PayoutFlag[] = [];
  if (item.status === "paid" && item.proof.length === 0) flags.push("no-proof");
  if (item.status === "paid" && item.reference.trim() === "") flags.push("no-reference");
  if (!item.bank) flags.push("no-bank");
  else if (item.bank.verifiedAt === null) flags.push("unverified-bank");
  // A resolved problem keeps its id on the item, so only an open one is still a dispute.
  if (item.issueId && openIssueIds.has(item.issueId)) flags.push("disputed");
  return flags;
}

const STATE_ORDER: Record<PlanState, number> = { overdue: 0, "due-soon": 1, "on-track": 2, paid: 3 };

/**
 * The whole balance sheet, from rows already read. Pure, so every identity it
 * promises is tested without a database:
 *   money in = commission + overrides + funds' share + kept, every month;
 *   owed to partners: start + earned - clawed back - paid out = end;
 *   each fund: start + in - out = end;
 *   due from buyers on plans: start + new plans - received = end.
 */
export function computeAccounts(input: AccountsInput): AccountsReport {
  const { from, to, now } = input;
  const keys = monthsBetween(from, to);
  const start = monthStart(from);
  const end = monthStart(nextMonth(to));
  const inPeriod = (at: number) => at >= start && at < end;
  const byMonth = new Map<string, AccountsMonth>(
    keys.map((month) => [month, { month, ...zeroFlows(), owedEndMinor: 0, fundsEndMinor: 0, dueEndMinor: 0 }]),
  );
  const bucket = (at: number) => (inPeriod(at) ? byMonth.get(fundMonthOf(at)) : undefined);

  const planDeals = input.deals.filter((deal) => deal.plan);
  const live = input.ledger.filter((line) => line.status !== "void");
  const paidItems = input.runs.flatMap((run) => run.items).filter((item) => item.status === "paid" && item.paidAt !== null);
  const fundLive = input.fundRows.filter((row) => !row.voidsId && !(row.kind === "payout" && row.voidedAt));

  const owedAt = (t: number) =>
    total(live.filter((line) => line.createdAt < t), (line) => line.amountMinor) -
    total(paidItems.filter((item) => (item.paidAt ?? 0) < t), (item) => item.totalMinor);
  const fundAt = (t: number, fund?: string) =>
    total(fundLive.filter((row) => fundTime(row) < t && (!fund || row.fund === fund)), (row) => row.amountMinor);
  const dueAt = (t: number) =>
    total(planDeals.filter((deal) => deal.closedOn < t), (deal) => Math.max(0, deal.amountMinor - verifiedOf(deal, t)));

  /* Deals and money in. */
  const receipts: AccountsReceipt[] = [];
  const dealsClosed: AccountsDeal[] = [];
  for (const deal of input.deals) {
    const month = bucket(deal.closedOn);
    if (month) {
      month.deals += 1;
      month.agreedMinor += deal.amountMinor;
      if (deal.plan) month.planAgreedMinor += deal.amountMinor;
      const split = splitOf(deal.shares);
      dealsClosed.push({
        dealId: deal._id,
        closedOn: deal.closedOn,
        property: deal.listingTitle ?? "",
        buyer: deal.buyerName ?? "",
        closer: partnerOf(deal),
        ownership: deal.ownership === "partner" ? "Non-AV" : "AV Homes",
        kind: deal.listingType === "rent" ? "Rent" : "Sale",
        selfPurchase: deal.selfPurchase ?? false,
        onPlan: Boolean(deal.plan),
        agreedMinor: deal.amountMinor,
        paidMinor: deal.plan ? verifiedOf(deal) : deal.amountMinor,
        commissionMinor: split.commission,
        overridesMinor: split.overrides,
        fundsMinor: total(deal.fundShares, (f) => f.amountMinor),
        keptMinor: keptOf(deal.plan ? verifiedOf(deal) : deal.amountMinor, deal.shares, deal.fundShares, deal.keptMinor),
      });
    }
    for (const receipt of receiptsOf(deal)) {
      const into = bucket(receipt.at);
      if (!into) continue;
      receipts.push(receipt);
      into.moneyInMinor += receipt.amountMinor;
      if (receipt.type !== "outright") into.planReceivedMinor += receipt.amountMinor;
      into.commissionMinor += receipt.commissionMinor;
      into.overridesMinor += receipt.overridesMinor;
      into.fundsMinor += receipt.fundsMinor;
      into.keptMinor += receipt.keptMinor;
    }
  }

  /* Partners, from their ledger and the pay runs. */
  for (const line of live) {
    const month = bucket(line.createdAt);
    if (!month) continue;
    if (line.kind === "clawback") month.clawbackMinor += -line.amountMinor;
    else month.earnedMinor += line.amountMinor;
  }
  for (const item of paidItems) {
    const month = bucket(item.paidAt ?? 0);
    if (month) month.paidOutMinor += item.totalMinor;
  }

  /* The funds, from their own ledger. */
  const fundMoves: AccountsFundMove[] = [];
  for (const row of fundLive) {
    const at = fundTime(row);
    const month = bucket(at);
    if (!month) continue;
    if (row.kind === "payout") month.fundOutMinor += -row.amountMinor;
    else month.fundInMinor += row.amountMinor;
    const type = fundMoveType(row);
    const title = row.dealId ? input.dealTitles.get(row.dealId) ?? "" : "";
    fundMoves.push({
      at,
      fund: row.fund,
      fundName: input.names[row.fund as FundKind] ?? row.fund,
      type,
      detail: type === "payment" ? [row.recipient, row.note].filter(Boolean).join(": ") : title || row.note,
      reference: row.reference ?? "",
      byName: row.byName,
      amountMinor: row.amountMinor,
    });
  }

  const months = keys.map((key) => {
    const month = byMonth.get(key)!;
    const close = monthStart(nextMonth(key));
    month.owedEndMinor = owedAt(close);
    month.fundsEndMinor = fundAt(close);
    month.dueEndMinor = dueAt(close);
    return month;
  });

  const totals = zeroFlows();
  for (const month of months) {
    for (const field of Object.keys(totals) as (keyof AccountsFlows)[]) totals[field] += month[field];
  }

  const funds: FundRoll[] = (["reward", "foundation"] as const).map((fund) => {
    const rows = fundLive.filter((row) => row.fund === fund && inPeriod(fundTime(row)));
    return {
      fund,
      name: input.names[fund],
      startMinor: fundAt(start, fund),
      inMinor: total(rows.filter((row) => row.kind !== "payout"), (row) => row.amountMinor),
      outMinor: total(rows.filter((row) => row.kind === "payout"), (row) => -row.amountMinor),
      endMinor: fundAt(end, fund),
    };
  });

  /* Plans still being paid, as they stand now. */
  const plans: AccountsPlan[] = [];
  let toComeMinor = 0;
  let paymentsWaiting = 0;
  let paymentsWaitingMinor = 0;
  for (const deal of planDeals) {
    const plan = deal.plan as DealPlan;
    const payments = deal.payments ?? [];
    const waiting = payments.filter((p) => p.status === "pending");
    paymentsWaiting += waiting.length;
    paymentsWaitingMinor += total(waiting, (p) => p.amountMinor);
    const paid = verifiedOf(deal);
    if (paid >= deal.amountMinor) continue;
    const standing = planStanding(deal.amountMinor, plan, payments, now);
    const fallenDue = total(planSchedule(deal.amountMinor, plan).filter((row) => row.dueOn <= now), (row) => row.amountMinor);
    toComeMinor += Math.max(0, total(deal.planShares, (s) => s.amountMinor) - total(deal.shares, (s) => s.amountMinor));
    plans.push({
      dealId: deal._id,
      property: deal.listingTitle ?? "",
      buyer: deal.buyerName ?? "",
      partner: partnerOf(deal),
      selfPurchase: deal.selfPurchase ?? false,
      agreedMinor: deal.amountMinor,
      paidMinor: paid,
      pendingMinor: standing.pendingMinor,
      dueMinor: deal.amountMinor - paid,
      // Logged money is not chased, the same rule the reminders follow.
      overdueMinor: Math.max(0, fallenDue - paid - standing.pendingMinor),
      nextDueOn: standing.next && standing.next.dueOn > 0 ? standing.next.dueOn : null,
      nextMinor: standing.nextLeftMinor,
      state: standing.state,
    });
  }
  plans.sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.nextDueOn ?? Infinity) - (b.nextDueOn ?? Infinity),
  );

  const payouts: PayoutRecord[] = [];
  for (const run of input.runs) {
    if (run.month < from || run.month > to) continue;
    for (const item of run.items) {
      payouts.push({
        runId: run._id,
        month: run.month,
        marketerId: item.marketerId,
        code: item.code,
        displayName: item.displayName,
        totalMinor: item.totalMinor,
        status: item.status,
        bankName: item.bank?.bankName ?? "",
        accountName: item.bank?.accountName ?? "",
        accountMasked: item.bank ? `••••${item.bank.accountNumber.slice(-4)}` : "",
        reference: item.reference,
        proof: item.proof,
        paidAt: item.paidAt,
        paidByName: item.paidByName,
        flags: flagsFor(item, input.openIssueIds),
      });
    }
  }
  payouts.sort((a, b) => (a.month === b.month ? a.displayName.localeCompare(b.displayName) : a.month < b.month ? 1 : -1));

  return {
    currency: input.currency,
    from,
    to,
    generatedAt: now,
    months,
    totals,
    partners: {
      startMinor: owedAt(start),
      earnedMinor: totals.earnedMinor,
      clawbackMinor: totals.clawbackMinor,
      paidOutMinor: totals.paidOutMinor,
      endMinor: owedAt(end),
    },
    funds,
    buyers: {
      startMinor: dueAt(start),
      newPlansMinor: totals.planAgreedMinor,
      receivedMinor: totals.planReceivedMinor,
      endMinor: dueAt(end),
    },
    position: {
      owedMinor: total(live.filter((l) => l.status === "earned" || l.status === "scheduled"), (l) => l.amountMinor),
      scheduledMinor: total(live.filter((l) => l.status === "scheduled"), (l) => l.amountMinor),
      funds: input.fundsNow.map((f) => ({ fund: f.fund, name: f.name, balanceMinor: f.balanceMinor })),
      dueMinor: total(plans, (p) => p.dueMinor),
      overdueMinor: total(plans, (p) => p.overdueMinor),
      plans: plans.length,
      toComeMinor,
      paymentsWaiting,
      paymentsWaitingMinor,
      dealsWaiting: input.waiting.length,
      dealsWaitingMinor: total(input.waiting, (d) => d.amountMinor),
    },
    check: input.check,
    payouts,
    plans,
    receipts: receipts.sort((a, b) => a.at - b.at),
    deals: dealsClosed.sort((a, b) => a.closedOn - b.closedOn),
    fundMoves: fundMoves.sort((a, b) => a.at - b.at),
  };
}

/* ═══════════════════════════════════════════════════════════════ READING ══ */

export async function accountsReport(
  db: Db,
  input: { from: string; to: string; names: Record<FundKind, string>; now?: number },
): Promise<AccountsReport> {
  const dealsCollection = collection<DealRow & { status: string }>(db, COLLECTIONS.marketingDeals);
  const [settings, deals, waiting, ledger, runs, issues, fundRows, fundsNow, check] = await Promise.all([
    readMarketingSettings(db),
    dealsCollection
      .find(
        { status: "approved" },
        {
          projection: {
            listingTitle: 1, listingType: 1, ownership: 1, buyerName: 1, reporterName: 1, closerKind: 1, closerName: 1,
            amountMinor: 1, closedOn: 1, shares: 1, fundShares: 1, keptMinor: 1, plan: 1, payments: 1, planShares: 1, selfPurchase: 1,
          },
        },
      )
      .toArray(),
    dealsCollection.find({ status: "pending" }, { projection: { amountMinor: 1 } }).toArray(),
    collection<LedgerRow>(db, COLLECTIONS.marketingLedger)
      .find({}, { projection: { kind: 1, status: 1, amountMinor: 1, createdAt: 1 } })
      .toArray(),
    collection<PayRunRow>(db, COLLECTIONS.marketingPayRuns).find({}).sort({ month: -1 }).toArray(),
    collection<{ _id: string; status: string }>(db, COLLECTIONS.marketingIssues)
      .find({ status: "open" }, { projection: { _id: 1 } })
      .toArray(),
    collection<FundRow>(db, COLLECTIONS.fundLedger).find({}).toArray(),
    fundBalances(db, input.names),
    reconcile(db),
  ]);

  const titles = new Map(deals.map((deal) => [deal._id, deal.listingTitle ?? ""]));
  const missing = [...new Set(fundRows.map((row) => row.dealId).filter((id): id is string => !!id && !titles.has(id)))];
  if (missing.length > 0) {
    const others = await dealsCollection.find({ _id: { $in: missing } }, { projection: { listingTitle: 1 } }).toArray();
    for (const deal of others) titles.set(deal._id, deal.listingTitle ?? "");
  }

  return computeAccounts({
    from: input.from,
    to: input.to,
    now: input.now ?? Date.now(),
    currency: settings.currency,
    names: input.names,
    deals,
    waiting,
    ledger,
    runs,
    openIssueIds: new Set(issues.map((issue) => issue._id)),
    fundRows,
    dealTitles: titles,
    fundsNow,
    check,
  });
}

export function summaryOf(report: AccountsReport): AccountsSummary {
  const { receipts: _receipts, deals: _deals, fundMoves: _moves, ...summary } = report;
  void _receipts;
  void _deals;
  void _moves;
  return summary;
}

/* ═══════════════════════════════════════════════════════════════ WORKBOOK ══ */

const LAGOS: Intl.DateTimeFormatOptions = { timeZone: "Africa/Lagos" };

function longDate(at: number): string {
  return new Date(at).toLocaleDateString("en-GB", { ...LAGOS, day: "numeric", month: "long", year: "numeric" });
}

function stampOf(at: number): string {
  const time = new Date(at).toLocaleTimeString("en-GB", { ...LAGOS, hour: "2-digit", minute: "2-digit" });
  return `${longDate(at)}, ${time} Lagos time`;
}

const MONTH_COLUMNS: { key: keyof Omit<AccountsMonth, "month">; label: string; sum?: false }[] = [
  { key: "deals", label: "Deals closed" },
  { key: "agreedMinor", label: "Agreed value" },
  { key: "planAgreedMinor", label: "Of which on plans" },
  { key: "moneyInMinor", label: "Money in" },
  { key: "planReceivedMinor", label: "Of which plan payments" },
  { key: "commissionMinor", label: "Commission" },
  { key: "overridesMinor", label: "Overrides" },
  { key: "fundsMinor", label: "Funds' share" },
  { key: "keptMinor", label: "AV Homes kept" },
  { key: "earnedMinor", label: "Credited to partners" },
  { key: "clawbackMinor", label: "Clawed back" },
  { key: "paidOutMinor", label: "Paid to partners" },
  { key: "fundInMinor", label: "Into the funds" },
  { key: "fundOutMinor", label: "Paid from the funds" },
  { key: "owedEndMinor", label: "Owed to partners at month end", sum: false },
  { key: "fundsEndMinor", label: "Funds hold at month end", sum: false },
  { key: "dueEndMinor", label: "Due from buyers at month end", sum: false },
];

export function monthSheet(report: AccountsReport, title: readonly string[] = []): Sheet {
  const units = minorUnitsFor(report.currency);
  const columns: SheetColumn[] = [
    { label: "Month", kind: "text" },
    ...MONTH_COLUMNS.map((col): SheetColumn => ({
      label: col.key === "deals" ? col.label : `${col.label} (${report.currency})`,
      kind: col.key === "deals" ? "count" : "money",
      ...(col.sum === false ? { sum: false } : {}),
    })),
  ];
  return {
    name: "By month",
    title,
    columns,
    rows: report.months.map((m) => [
      fundMonthLabel(m.month),
      ...MONTH_COLUMNS.map((col) => (col.key === "deals" ? m.deals : m[col.key] / units)),
    ]),
    total: "Total",
    freezeFirstColumn: true,
  };
}

export function accountsSheets(report: AccountsReport): Sheet[] {
  const units = minorUnitsFor(report.currency);
  const n = (minor: number) => minor / units;
  const cur = report.currency;
  const period = `${fundMonthLabel(report.from)} to ${fundMonthLabel(report.to)}`;
  const heading = (what: string) => [`AV Homes: ${what}`, period, `Amounts in ${cur}. Generated ${stampOf(report.generatedAt)}.`];
  const t = report.totals;
  const p = report.partners;
  const b = report.buyers;
  const lastMonth = fundMonthLabel(report.to);

  const lines: StatementLine[] = [
    { style: "section", label: "Deals and money in" },
    { style: "line", label: `Deals closed (${t.deals})`, amount: n(t.agreedMinor), note: "Agreed value, in full, by the day each closed. Same as Analytics, Transactions." },
    { style: "line", label: "Of which on payment plans", amount: n(t.planAgreedMinor) },
    { style: "line", key: "in", label: "Money received from buyers", amount: n(t.moneyInMinor), note: "Paid in full on the day it closed; plan deposits and instalments on the day paid." },
    { style: "line", label: "Of which plan deposits and instalments", amount: n(t.planReceivedMinor) },
    { style: "blank" },
    { style: "section", label: "Where the money received went" },
    { style: "line", key: "commission", label: "Commission to the partner who closed it", amount: n(t.commissionMinor) },
    { style: "line", key: "overrides", label: "Overrides to their upline", amount: n(t.overridesMinor) },
    { style: "line", key: "funds", label: "The two funds", amount: n(t.fundsMinor) },
    { style: "line", key: "kept", label: "AV Homes kept", amount: n(t.keptMinor) },
    { style: "check", label: "Check: money received less the four lines above", sumOf: ["commission", "overrides", "funds", "kept"], equals: "in", note: "Should be 0.00" },
    { style: "blank" },
    { style: "section", label: "Owed to partners" },
    { style: "line", key: "pStart", label: `At the start of ${fundMonthLabel(report.from)}`, amount: n(p.startMinor) },
    { style: "line", key: "pEarned", label: "Credited (deals approved, plan payments verified)", amount: n(p.earnedMinor), note: "By the day it was credited, which can be after the money came in." },
    { style: "less", key: "pClaw", label: "Less: clawed back", amount: -n(p.clawbackMinor) },
    { style: "less", key: "pPaid", label: "Less: paid out", amount: -n(p.paidOutMinor) },
    { style: "total", key: "pEnd", label: `At the end of ${lastMonth}`, amount: n(p.endMinor), sumOf: ["pStart", "pEarned", "pClaw", "pPaid"] },
    { style: "blank" },
  ];
  for (const fund of report.funds) {
    const k = fund.fund;
    lines.push(
      { style: "section", label: fund.name },
      { style: "line", key: `${k}Start`, label: `At the start of ${fundMonthLabel(report.from)}`, amount: n(fund.startMinor) },
      { style: "line", key: `${k}In`, label: "Shares of deals in, net of shares handed back", amount: n(fund.inMinor) },
      { style: "less", key: `${k}Out`, label: "Less: paid out", amount: -n(fund.outMinor) },
      { style: "total", label: `At the end of ${lastMonth}`, amount: n(fund.endMinor), sumOf: [`${k}Start`, `${k}In`, `${k}Out`] },
      { style: "blank" },
    );
  }
  lines.push(
    { style: "section", label: "Due from buyers on payment plans" },
    { style: "line", key: "bStart", label: `At the start of ${fundMonthLabel(report.from)}`, amount: n(b.startMinor) },
    { style: "line", key: "bNew", label: "Plans agreed in the period", amount: n(b.newPlansMinor) },
    { style: "less", key: "bIn", label: "Less: deposits and instalments received", amount: -n(b.receivedMinor) },
    { style: "total", label: `At the end of ${lastMonth}`, amount: n(b.endMinor), sumOf: ["bStart", "bNew", "bIn"] },
    { style: "blank" },
    { style: "section", label: `Today, ${longDate(report.generatedAt)}` },
    { style: "line", label: "Owed to partners", amount: n(report.position.owedMinor), note: "Credited and not yet sent." },
    { style: "line", label: "Of which on a pay run", amount: n(report.position.scheduledMinor) },
    ...report.position.funds.map((f): StatementLine => ({ style: "line", label: `${f.name} holds`, amount: n(f.balanceMinor) })),
    { style: "line", label: `Due from buyers on ${report.position.plans} payment ${report.position.plans === 1 ? "plan" : "plans"}`, amount: n(report.position.dueMinor) },
    { style: "line", label: "Of which overdue", amount: n(report.position.overdueMinor) },
    { style: "line", label: "Commission and overrides still to come on plans", amount: n(report.position.toComeMinor), note: "Earned only as buyers pay." },
    { style: "line", label: `Plan payments waiting to be verified (${report.position.paymentsWaiting})`, amount: n(report.position.paymentsWaitingMinor) },
    { style: "line", label: `Deals waiting to be checked (${report.position.dealsWaiting})`, amount: n(report.position.dealsWaitingMinor), note: "Not owed until approved." },
    { style: "note", label: report.check.ok ? "Ledger check: the partners' ledger agrees with the pay runs." : `Ledger check found problems: ${report.check.problems.join(" ")}` },
  );

  const money = (label: string): SheetColumn => ({ label: `${label} (${cur})`, kind: "money" });
  const receiptLinks = (proof: readonly string[]): SheetCell =>
    proof[0] ? { link: proof[0], text: proof.length > 1 ? `Receipt 1 of ${proof.length}` : "Receipt" } : null;

  return [
    { name: "Statement", statement: true, title: heading("balance sheet"), lines },
    monthSheet(report, heading("balance sheet by month")),
    {
      name: "Money received",
      title: heading("money received from buyers"),
      columns: [
        { label: "Received", kind: "date" },
        { label: "Property", kind: "text" },
        { label: "Buyer", kind: "text" },
        { label: "Partner", kind: "text" },
        { label: "Type", kind: "text" },
        money("Amount"),
        money("Commission"),
        money("Overrides"),
        money("Funds' share"),
        money("AV Homes kept"),
      ],
      rows: report.receipts.map((r) => [
        r.at,
        r.property,
        r.buyer,
        r.selfPurchase ? `${r.partner} (own purchase)` : r.partner,
        RECEIPT_TYPE_LABEL[r.type],
        n(r.amountMinor),
        n(r.commissionMinor),
        n(r.overridesMinor),
        n(r.fundsMinor),
        n(r.keptMinor),
      ]),
      total: "Total",
    },
    {
      name: "Deals",
      title: heading("deals closed"),
      columns: [
        { label: "Closed", kind: "date" },
        { label: "Property", kind: "text" },
        { label: "Buyer", kind: "text" },
        { label: "Closed by", kind: "text" },
        { label: "Property of", kind: "text" },
        { label: "Sale or rent", kind: "text" },
        { label: "Paid", kind: "text" },
        money("Agreed value"),
        money("Paid so far"),
        money("Commission so far"),
        money("Overrides so far"),
        money("Funds' share so far"),
        money("AV Homes kept so far"),
      ],
      rows: report.deals.map((d) => [
        d.closedOn,
        d.property,
        d.buyer,
        d.selfPurchase ? `${d.closer} (own purchase)` : d.closer,
        d.ownership,
        d.kind,
        d.onPlan ? "Payment plan" : "In full",
        n(d.agreedMinor),
        n(d.paidMinor),
        n(d.commissionMinor),
        n(d.overridesMinor),
        n(d.fundsMinor),
        n(d.keptMinor),
      ]),
      total: "Total",
      freezeFirstColumn: true,
    },
    {
      name: "Partner payouts",
      title: heading("partner payouts"),
      columns: [
        { label: "Pay month", kind: "text" },
        { label: "Partner", kind: "text" },
        { label: "Code", kind: "text" },
        money("Amount"),
        { label: "Status", kind: "text" },
        { label: "Bank", kind: "text" },
        { label: "Account name", kind: "text" },
        { label: "Account", kind: "text" },
        { label: "Reference", kind: "text" },
        { label: "Marked paid", kind: "date" },
        { label: "Marked paid by", kind: "text" },
        { label: "Receipt", kind: "link" },
        { label: "Flags", kind: "text" },
      ],
      rows: report.payouts.map((r) => [
        fundMonthLabel(r.month),
        r.displayName,
        r.code,
        n(r.totalMinor),
        r.status === "paid" ? "Paid" : r.status === "held" ? "Held" : "Not sent",
        r.bankName,
        r.accountName,
        r.accountMasked,
        r.reference,
        r.paidAt,
        r.paidByName,
        receiptLinks(r.proof),
        r.flags.map((flag) => PAYOUT_FLAG_LABELS[flag]).join(", "),
      ]),
      total: "Total",
      freezeFirstColumn: true,
    },
    {
      name: "Fund movements",
      title: heading("fund movements"),
      columns: [
        { label: "Date", kind: "date" },
        { label: "Fund", kind: "text" },
        { label: "Movement", kind: "text" },
        { label: "Deal or paid to", kind: "text" },
        { label: "Reference", kind: "text" },
        { label: "Recorded by", kind: "text" },
        money("Amount"),
      ],
      rows: report.fundMoves.map((m) => [m.at, m.fundName, FUND_MOVE_LABEL[m.type], m.detail, m.reference, m.byName, n(m.amountMinor)]),
      total: "Net change",
    },
    {
      name: "Payment plans",
      title: [`AV Homes: payment plans still being paid`, `As at ${stampOf(report.generatedAt)}`, `Amounts in ${cur}.`],
      columns: [
        { label: "Property", kind: "text" },
        { label: "Buyer", kind: "text" },
        { label: "Partner", kind: "text" },
        { label: "Standing", kind: "text" },
        money("Agreed value"),
        money("Paid"),
        money("Logged, to verify"),
        money("Still due"),
        money("Overdue"),
        { label: "Next due", kind: "date" },
        money("Next amount"),
      ],
      rows: report.plans.map((plan) => [
        plan.property,
        plan.buyer,
        plan.selfPurchase ? `${plan.partner} (own purchase)` : plan.partner,
        PLAN_STATE_LABEL[plan.state],
        n(plan.agreedMinor),
        n(plan.paidMinor),
        n(plan.pendingMinor),
        n(plan.dueMinor),
        n(plan.overdueMinor),
        plan.nextDueOn,
        n(plan.nextMinor),
      ]),
      total: "Total",
    },
  ];
}

export function accountsCsv(report: AccountsReport): string {
  const sheet = monthSheet(report) as Extract<Sheet, { columns: unknown }>;
  const units = minorUnitsFor(report.currency);
  const totals: SheetCell[] = [
    "Total",
    ...MONTH_COLUMNS.map((col) => (col.sum === false ? null : col.key === "deals" ? report.totals.deals : report.totals[col.key as keyof AccountsFlows] / units)),
  ];
  return sheetCsv(sheet.columns, [...sheet.rows, totals]);
}

/* ════════════════════════════════════════════════════════════════ ROUTES ══ */

const PeriodShape = {
  from: z.string().regex(MONTH).optional(),
  to: z.string().regex(MONTH).optional(),
};

function periodOf(q: { from?: string; to?: string }): { from: string; to: string } {
  const now = new Date();
  const to = q.to ?? fundMonthOf(now.getTime());
  const from = q.from ?? fundMonthOf(new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime());
  if (from > to) throw new BadRequestError("from", [{ path: "from", message: "The start month is after the end month." }]);
  if (monthsBetween(from, to).length >= 60) {
    throw new BadRequestError("from", [{ path: "from", message: "Choose five years or less." }]);
  }
  return { from, to };
}

export function accountsRoutes(deps: { names: (db: Db) => Promise<Record<FundKind, string>> }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/accounts", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const { from, to } = periodOf(readQuery(c, z.object(PeriodShape).strict()));
    return c.json(summaryOf(await accountsReport(db, { from, to, names: await deps.names(db) })));
  });

  /** A POST, so every download of the books is written to the audit trail like the partner export. */
  routes.post("/admin/accounts/export", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const body = await readJson(c, z.object({ ...PeriodShape, format: z.enum(["xlsx", "csv"]).default("xlsx") }).strict());
    const { from, to } = periodOf(body);
    const report = await accountsReport(db, { from, to, names: await deps.names(db) });
    const name = `av-balance-sheet-${from}-to-${to}`;
    const file =
      body.format === "csv"
        ? Buffer.from(accountsCsv(report), "utf8")
        : workbook(accountsSheets(report), { title: `AV Homes balance sheet, ${fundMonthLabel(from)} to ${fundMonthLabel(to)}` });
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type":
          body.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}.${body.format}"`,
        "cache-control": "no-store",
      },
    });
  });

  return routes;
}
