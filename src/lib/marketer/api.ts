/**
 * What the marketer app reads back, typed once.
 *
 * Every shape here is the JSON a route in `packages/marketing/src/routes.ts`
 * answers with. They live in one file so a screen never re-describes a payload
 * it shares with another screen, which is how the console's four copies of one
 * date helper drifted apart.
 */

import type {
  CommissionRates,
  Deal,
  DealShare,
  LedgerLine,
  Marketer,
  MarketerAlert,
  MarketerBalance,
  MarketerBank,
  MarketingUpdate,
  PayIssue,
  TeamMember,
} from "@avhomes/contracts";

/** `GET /api/marketing/me`. The whole app's opening read. */
export interface MeResponse {
  marketer: Marketer;
  balance: MarketerBalance;
  /** People under you, level 1 first. */
  levels: [number, number, number];
  rates: { sale: CommissionRates; rent: CommissionRates };
  supportPhone: string;
  /** False when the bank name check is not configured on this site. */
  bankCheck: boolean;
  isAdmin: boolean;
  /** Alerts that need the marketer to act. The bell's number. */
  alertCount: number;
}

/** `GET /api/marketing/alerts`, act first. */
export interface AlertsResponse {
  items: MarketerAlert[];
}

/** `GET /api/marketing/updates`, the home carousel. */
export interface UpdatesResponse {
  items: MarketingUpdate[];
}

/** A deal row carries this reader's own share, which is not the deal's total. */
export type DealRowData = Deal & { myShare: DealShare | null };

export interface DealsResponse {
  items: DealRowData[];
  total: number;
}

export interface PreviewResponse {
  amountMinor: number;
  rate: number;
}

export interface UploadResponse {
  url: string;
}

export interface DealCreated {
  deal: Deal;
  /** Somebody else reported the same home. An admin decides between the two. */
  alsoClaimed: boolean;
}

/** One month of pay, from this marketer's side of a pay run. */
export interface PayHistoryRow {
  payRunId: string;
  month: string;
  totalMinor: number;
  currency: string;
  status: string;
  paidAt: number | null;
  proof: string[];
  reference: string;
  issueId: string | null;
  bankLabel: string;
}

export interface MoneyResponse {
  balance: MarketerBalance;
  lines: LedgerLine[];
  payments: PayHistoryRow[];
  bank: MarketerBank | null;
  issueWindowDays: number;
  month: string;
}

export interface TeamResponse {
  levels: [number, number, number];
  members: TeamMember[];
}

export interface IssuesResponse {
  items: PayIssue[];
}

export interface IssueResponse {
  issue: PayIssue;
}

/** `GET /api/public/marketing/join`. Drawn before anybody types. */
export interface JoinInfo {
  open: boolean;
  supportPhone: string;
  rates: CommissionRates;
  bankCheck: boolean;
  referrer: { code: string; displayName: string } | null;
}

export interface BankOption {
  code: string;
  name: string;
}

export interface BanksResponse {
  banks: BankOption[];
  /** False means the list is empty because the check is not configured. */
  checked: boolean;
}

export interface ResolvedAccount {
  accountName: string;
  checked: boolean;
}

export interface MarketerResponse {
  marketer: Marketer;
}

/** Up to two letters for the avatar. Falls back to the first letter of a code. */
export function initials(name: string, code = ""): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return code.replace(/[^A-Za-z0-9]/gu, "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** The clock, behind a name, so a screen can ask what time it is once. */
export function nowMs(): number {
  return Date.now();
}

/** "30 September", the day this month's money goes out. */
export function payDayLabel(at = Date.now()): string {
  const now = new Date(at);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return last.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/**
 * Today as an `<input type="date">` takes it, in the reader's own zone.
 *
 * NOT `toISOString().slice(0, 10)`, which is UTC: in Lagos that string is
 * yesterday for the first hour of every day, so a `max` built from it refuses a
 * deal closed this morning.
 */
export function todayInput(at = Date.now()): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Local midnight for a date input's value, which is what `closedOn` stores. */
export function dateInputToEpoch(value: string): number {
  if (value === "") return 0;
  const at = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(at) ? at : 0;
}

/** The greeting, by the reader's own clock. */
export function greeting(at = Date.now()): string {
  const hour = new Date(at).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Today", "Yesterday", then a date, so a list never mixes "6 days ago" with "10 Sept". */
export function whenLabel(at: number, now = Date.now()): string {
  const day = (value: number) => {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Where a link goes: a screen in this app, or somewhere the router must not handle. */
export function isAppPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}
