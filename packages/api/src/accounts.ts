import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { BadRequestError, currentDb, readQuery, type AppEnv } from "@avhomes/core";
import {
  PAYOUT_FLAG_LABELS,
  fundMonthLabel,
  fundMonthOf,
  minorUnitsFor,
  type AccountsMonth,
  type AccountsReport,
  type FundKind,
  type MarketerBank,
  type PayoutFlag,
  type PayoutRecord,
} from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";
import { fundBalances } from "@avhomes/funds";
import { readMarketingSettings, reconcile, sheetCsv, workbook, type Sheet, type SheetCell } from "@avhomes/marketing";

interface DealRow {
  amountMinor: number;
  closedOn: number;
  shares?: { amountMinor: number }[];
  fundShares?: { amountMinor: number }[];
  keptMinor?: number;
}

interface LedgerRow {
  kind: string;
  status: string;
  amountMinor: number;
  createdAt: number;
}

interface FundRow {
  kind: string;
  amountMinor: number;
  paidAt: number | null;
  voidedAt: number | null;
  voidsId?: string | null;
  createdAt: number;
}

interface PayRunRow {
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

function zero(): Omit<AccountsMonth, "month"> {
  return {
    deals: 0,
    salesMinor: 0,
    commissionMinor: 0,
    fundsMinor: 0,
    keptMinor: 0,
    paidOutMinor: 0,
    clawbackMinor: 0,
    fundInMinor: 0,
    fundOutMinor: 0,
  };
}

function blank(month: string): AccountsMonth {
  return { month, ...zero() };
}

function flagsFor(item: PayRunRow["items"][number]): PayoutFlag[] {
  const flags: PayoutFlag[] = [];
  if (item.status === "paid" && item.proof.length === 0) flags.push("no-proof");
  if (item.status === "paid" && item.reference.trim() === "") flags.push("no-reference");
  if (!item.bank) flags.push("no-bank");
  else if (item.bank.verifiedAt === null) flags.push("unverified-bank");
  if (item.issueId) flags.push("disputed");
  return flags;
}

export async function accountsReport(
  db: Db,
  input: { from: string; to: string; names: Record<FundKind, string> },
): Promise<AccountsReport> {
  const months = monthsBetween(input.from, input.to);
  const start = monthStart(input.from);
  const end = monthStart(nextMonth(input.to));
  const byMonth = new Map(months.map((m) => [m, blank(m)]));
  const bucket = (at: number) => byMonth.get(fundMonthOf(at));

  const [settings, deals, clawbacks, owed, pending, fundRows, runs, funds, check] = await Promise.all([
    readMarketingSettings(db),
    collection<DealRow>(db, COLLECTIONS.marketingDeals)
      .find({ status: "approved", closedOn: { $gte: start, $lt: end } })
      .toArray(),
    collection<LedgerRow>(db, COLLECTIONS.marketingLedger)
      .find({ kind: "clawback", status: { $ne: "void" }, createdAt: { $gte: start, $lt: end } })
      .toArray(),
    collection<LedgerRow>(db, COLLECTIONS.marketingLedger)
      .aggregate<{ _id: string; total: number }>([
        { $match: { status: { $in: ["earned", "scheduled"] } } },
        { $group: { _id: "$status", total: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
    collection<DealRow>(db, COLLECTIONS.marketingDeals)
      .aggregate<{ total: number }>([
        { $match: { status: "pending" } },
        { $group: { _id: null, total: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
    collection<FundRow>(db, COLLECTIONS.fundLedger).find({}).toArray(),
    collection<PayRunRow>(db, COLLECTIONS.marketingPayRuns).find({}).sort({ month: -1 }).toArray(),
    fundBalances(db, input.names),
    reconcile(db),
  ]);

  for (const deal of deals) {
    const row = bucket(deal.closedOn);
    if (!row) continue;
    row.deals += 1;
    row.salesMinor += deal.amountMinor;
    row.commissionMinor += (deal.shares ?? []).reduce((sum, s) => sum + s.amountMinor, 0);
    row.fundsMinor += (deal.fundShares ?? []).reduce((sum, s) => sum + s.amountMinor, 0);
    row.keptMinor += deal.keptMinor ?? 0;
  }

  for (const line of clawbacks) {
    const row = bucket(line.createdAt);
    if (row) row.clawbackMinor += Math.abs(line.amountMinor);
  }

  // Matched to fundMonthly: a voided payout and the line voiding it both drop out.
  for (const entry of fundRows) {
    if (entry.voidsId || (entry.kind === "payout" && entry.voidedAt)) continue;
    if (entry.kind === "payout") {
      const row = bucket(entry.paidAt ?? entry.createdAt);
      if (row) row.fundOutMinor += -entry.amountMinor;
    } else {
      const row = bucket(entry.createdAt);
      if (row) row.fundInMinor += entry.amountMinor;
    }
  }

  const payouts: PayoutRecord[] = [];
  for (const run of runs) {
    for (const item of run.items) {
      if (item.paidAt !== null) {
        const row = bucket(item.paidAt);
        if (row) row.paidOutMinor += item.totalMinor;
      }
      if (run.month < input.from || run.month > input.to) continue;
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
        flags: flagsFor(item),
      });
    }
  }

  const rows = [...byMonth.values()];
  const totals = zero();
  for (const row of rows) {
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += row[key];
  }
  const by = new Map(owed.map((r) => [r._id, r.total]));

  return {
    currency: settings.currency,
    from: input.from,
    to: input.to,
    months: rows,
    totals,
    position: {
      commissionOwedMinor: (by.get("earned") ?? 0) + (by.get("scheduled") ?? 0),
      commissionScheduledMinor: by.get("scheduled") ?? 0,
      funds: funds.map((f) => ({ fund: f.fund, name: f.name, balanceMinor: f.balanceMinor })),
      pendingDealsMinor: pending[0]?.total ?? 0,
    },
    check,
    payouts,
  };
}

const MONTH_COLUMNS: { key: Exclude<keyof AccountsMonth, "month">; label: string }[] = [
  { key: "deals", label: "Deals" },
  { key: "salesMinor", label: "Sales" },
  { key: "commissionMinor", label: "Commission owed" },
  { key: "paidOutMinor", label: "Commission paid" },
  { key: "clawbackMinor", label: "Clawed back" },
  { key: "fundsMinor", label: "Share to the funds" },
  { key: "fundInMinor", label: "Fund inflows" },
  { key: "fundOutMinor", label: "Fund payments" },
  { key: "keptMinor", label: "AV Homes kept" },
];

export function accountsSheets(report: AccountsReport): Sheet[] {
  const units = minorUnitsFor(report.currency);
  const major = (minor: number) => minor / units;
  const cur = report.currency;
  const t = report.totals;

  const summaryRows: SheetCell[][] = [
    ["Period", `${fundMonthLabel(report.from)} to ${fundMonthLabel(report.to)}`, null],
    ["Money in", `Deals closed: ${t.deals}`, null],
    ["Money in", "Sales and rentals", major(t.salesMinor)],
    ["Commission", "Owed on deals closed", major(t.commissionMinor)],
    ["Commission", "Paid out", major(t.paidOutMinor)],
    ["Commission", "Clawed back", major(t.clawbackMinor)],
    ["Funds", "Share of deals", major(t.fundsMinor)],
    ["Funds", "Inflows", major(t.fundInMinor)],
    ["Funds", "Payments out", major(t.fundOutMinor)],
    ["AV Homes", "Kept", major(t.keptMinor)],
    ["Today", "Commission owed", major(report.position.commissionOwedMinor)],
    ["Today", "Of which on a pay run", major(report.position.commissionScheduledMinor)],
    ...report.position.funds.map((f): SheetCell[] => ["Today", `${f.name} balance`, major(f.balanceMinor)]),
    ["Today", "Deals still being checked", major(report.position.pendingDealsMinor)],
    ["Ledger check", report.check.ok ? "Balanced" : report.check.problems.join(" "), null],
  ];

  return [
    {
      name: "Summary",
      columns: [
        { label: "Section", kind: "text", width: 16 },
        { label: "Item", kind: "text", width: 40 },
        { label: `Amount (${cur})`, kind: "money", width: 22 },
      ],
      rows: summaryRows,
    },
    {
      name: "By month",
      columns: [
        { label: "Month", kind: "text", width: 16 },
        ...MONTH_COLUMNS.map((col) => ({
          label: col.key === "deals" ? col.label : `${col.label} (${cur})`,
          kind: col.key === "deals" ? ("count" as const) : ("money" as const),
          width: col.key === "deals" ? 9 : 20,
        })),
      ],
      rows: report.months.map((m) => [
        fundMonthLabel(m.month),
        ...MONTH_COLUMNS.map((col) => (col.key === "deals" ? m.deals : major(m[col.key]))),
      ]),
      total: ["Total", ...MONTH_COLUMNS.map((col) => (col.key === "deals" ? t.deals : major(t[col.key])))],
    },
    {
      name: "Payouts",
      columns: [
        { label: "Pay month", kind: "text", width: 16 },
        { label: "Partner", kind: "text", width: 26 },
        { label: "Code", kind: "text", width: 12 },
        { label: `Amount (${cur})`, kind: "money", width: 18 },
        { label: "Status", kind: "text", width: 10 },
        { label: "Bank", kind: "text", width: 22 },
        { label: "Account name", kind: "text", width: 26 },
        { label: "Account", kind: "text", width: 12 },
        { label: "Reference", kind: "text", width: 20 },
        { label: "Marked paid", kind: "date", width: 14 },
        { label: "Marked paid by", kind: "text", width: 20 },
        { label: "Receipts", kind: "count", width: 10 },
        { label: "Flags", kind: "text", width: 40 },
        { label: "Receipt links", kind: "text", width: 60 },
      ],
      rows: report.payouts.map((p) => [
        fundMonthLabel(p.month),
        p.displayName,
        p.code,
        major(p.totalMinor),
        p.status === "paid" ? "Paid" : p.status === "held" ? "Held" : "Pending",
        p.bankName,
        p.accountName,
        p.accountMasked,
        p.reference,
        p.paidAt,
        p.paidByName,
        p.proof.length,
        p.flags.map((f) => PAYOUT_FLAG_LABELS[f]).join(", "),
        p.proof.join(" "),
      ]),
      total: ["Total", null, null, major(report.payouts.reduce((sum, p) => sum + p.totalMinor, 0))],
    },
  ];
}

export function accountsRoutes(deps: { names: (db: Db) => Promise<Record<FundKind, string>> }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  function period(c: Parameters<typeof readQuery>[0]): { from: string; to: string; format: "xlsx" | "csv" } {
    const q = readQuery(
      c,
      z
        .object({
          from: z.string().regex(MONTH).optional(),
          to: z.string().regex(MONTH).optional(),
          format: z.enum(["xlsx", "csv"]).default("xlsx"),
        })
        .strict(),
    );
    const now = new Date();
    const to = q.to ?? fundMonthOf(now.getTime());
    const from = q.from ?? fundMonthOf(new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime());
    if (from > to) throw new BadRequestError("from", [{ path: "from", message: "The start month is after the end month." }]);
    if (monthsBetween(from, to).length >= 60) {
      throw new BadRequestError("from", [{ path: "from", message: "Choose five years or less." }]);
    }
    return { from, to, format: q.format };
  }

  routes.get("/admin/accounts", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const { from, to } = period(c);
    return c.json(await accountsReport(db, { from, to, names: await deps.names(db) }));
  });

  /** The balance sheet as a styled workbook (summary, by month, payouts), or the monthly sheet as CSV. */
  routes.get("/admin/accounts/export", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const { from, to, format } = period(c);
    const report = await accountsReport(db, { from, to, names: await deps.names(db) });
    const name = `av-balance-sheet-${from}-to-${to}`;
    const sheets = accountsSheets(report);
    const body =
      format === "csv"
        ? Buffer.from(sheetCsv(sheets[1]!.columns, [...sheets[1]!.rows, [...(sheets[1]!.total ?? [])]]), "utf8")
        : workbook(sheets);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type":
          format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}.${format}"`,
        "cache-control": "no-store",
      },
    });
  });

  return routes;
}
