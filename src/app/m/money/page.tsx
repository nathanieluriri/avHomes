"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import {
  payMonth,
  payMonthLabel,
  previewEarning,
  type LedgerLine,
  type LedgerStatus,
} from "@avhomes/contracts";
import {
  AppShell,
  RowSkeleton,
  useMarketer,
  useReportBlock,
} from "@/components/marketer/AppShell";
import {
  IconBank,
  IconCheckBadge,
  IconDeals,
  IconMoney,
  IconPayDay,
  IconReport,
  IconShield,
  type IconProps,
} from "@/components/marketer/icons3d";
import { Amount, HeroFigure, NegativeAmount } from "@/components/marketer/money/Amount";
import { PaymentChip } from "@/components/marketer/money/PaymentChip";
import {
  ButtonLink,
  EmptyState,
  ErrorNote,
  RowGroup,
  SectionLabel,
  Skeleton,
  moneyParts,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { shortDate } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import {
  payDayLabel,
  type DealsResponse,
  type MoneyResponse,
  type PayHistoryRow,
} from "@/lib/marketer/api";
import { useIfApproved } from "@/lib/marketer/earnings";
import { maskMoney, useMoneyHidden } from "@/lib/marketer/prefs";

/**
 * Every naira this account has been promised.
 *
 * Payments and earnings stay two lists. Payments are what left AV Homes for a
 * bank; earnings are what each deal added. Merged into one feed they read as
 * double counting, which is the complaint this screen exists to prevent.
 */

interface MoneyRead {
  data: MoneyResponse | null;
  error: ApiError | null;
  reload: () => void;
}

const LINE_STATUS: Record<LedgerStatus, string> = {
  earned: "Waiting",
  scheduled: "On the way",
  paid: "Paid",
  void: "Cancelled",
};

function lineSource(line: LedgerLine): string {
  if (line.kind === "clawback") return "Taken back";
  if (line.kind === "adjust") return "From AV Homes";
  if (line.level === 1) return "Your deal";
  if (line.level === 2) return "Someone you invited";
  if (line.level === 3) return "Their team";
  return "";
}

const LINE_ICON: Record<LedgerLine["kind"], ComponentType<IconProps>> = {
  earn: IconCheckBadge,
  clawback: IconShield,
  adjust: IconMoney,
};

/** Earnings by the month they happened, newest month first. */
function groupLines(lines: readonly LedgerLine[]): { month: string; lines: LedgerLine[] }[] {
  const byMonth = new Map<string, LedgerLine[]>();
  for (const line of lines) {
    const month = payMonth(line.createdAt);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(line);
    else byMonth.set(month, [line]);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, group]) => ({ month, lines: group }));
}

export default function MoneyPage() {
  const money = useAsync((signal) => api.get<MoneyResponse>("/marketing/money", signal), []);

  return (
    <AppShell title="Your money" back="/m" hero={<MoneyHero money={money} />} tab="Totals">
      <MoneyBody money={money} />
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════ HERO ══ */

function MoneyHero({ money }: { money: MoneyRead }) {
  const [hidden] = useMoneyHidden();

  if (money.error) return null;
  if (!money.data) {
    return (
      <div aria-hidden className="mt-5 flex flex-col items-center">
        <Skeleton onWine className="h-4 w-40" />
        <Skeleton onWine className="mt-3 h-11 w-60" radius="12px" />
        <Skeleton onWine className="mt-3.5 h-4 w-52" />
        <Skeleton onWine className="mt-2 h-4 w-44" />
      </div>
    );
  }

  const { balance, bank } = money.data;
  const on = payDayLabel();
  const scheduled =
    balance.scheduledMinor > 0
      ? moneyParts(balance.scheduledMinor, balance.currency).sign +
        moneyParts(balance.scheduledMinor, balance.currency).whole
      : "";

  return (
    <HeroFigure
      label="Waiting for pay day"
      icon={<IconPayDay size={24} className="-my-1" />}
      // Money already in this month's pay run is still waiting as far as the marketer can tell.
      minor={balance.waitingMinor + balance.scheduledMinor}
      currency={balance.currency}
    >
      <p className="mt-3 max-w-[20rem] text-[14px] leading-relaxed text-white/85">
        {scheduled !== "" ? (
          <>
            {hidden ? maskMoney(scheduled) : scheduled} of it is on the way now. The rest goes out
            on <span className="font-semibold text-white">{on}</span>.
          </>
        ) : (
          <>
            Pay day is <span className="font-semibold text-white">{on}</span>.
          </>
        )}
      </p>
      {bank ? (
        <p className="m-glass mt-3 inline-flex h-8 max-w-full items-center gap-1.5 rounded-full pl-1.5 pr-3 text-[12.5px] font-semibold">
          <IconBank size={22} className="shrink-0" />
          <span className="truncate">
            {bank.bankName}, ending <span className="m-num">{bank.accountNumber.slice(-4)}</span>
          </span>
        </p>
      ) : (
        <ButtonLink href="/m/profile#bank" variant="hero" size="sm" className="mt-3">
          <IconBank size={22} className="shrink-0" />
          Add your bank account
        </ButtonLink>
      )}
    </HeroFigure>
  );
}

/* ═══════════════════════════════════════════════════════════════════ BODY ══ */

function MoneyBody({ money }: { money: MoneyRead }) {
  const block = useReportBlock();

  if (money.error) {
    return (
      <div className="px-4">
        <ErrorNote error={money.error} onRetry={money.reload} />
      </div>
    );
  }

  if (!money.data) {
    return (
      <div aria-hidden className="px-4">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((tile) => (
            <div key={tile} className="m-card px-2 pb-3 pt-2.5">
              <Skeleton className="h-9 w-9" radius="12px" />
              <Skeleton className="mt-2.5 h-3 w-14" />
              <Skeleton className="mt-2 h-4 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="mb-3 mt-7 h-5 w-24" />
        <RowGroup>
          <RowSkeleton />
          <RowSkeleton />
        </RowGroup>
      </div>
    );
  }

  const { lines, payments } = money.data;
  const months = groupLines(lines);

  return (
    <div className="px-4">
      <Totals data={money.data} />

      <section className="mt-7">
        <SectionLabel>Payments</SectionLabel>
        {payments.length === 0 ? (
          <EmptyState
            compact
            art={<IconPayDay size={52} />}
            title="Nothing sent yet"
            hint="We pay at the end of every month."
          />
        ) : (
          <ul className="m-card divide-y divide-m-line overflow-hidden">
            {payments.map((payment) => (
              <li key={payment.payRunId}>
                <PaymentRow payment={payment} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <SectionLabel>Earnings</SectionLabel>
        {months.length === 0 ? (
          <EmptyState
            art={<IconReport size={88} />}
            title="No earnings yet"
            hint={
              block ??
              "Report a home you helped sell or rent. Once AV Homes approves it, your share shows up here."
            }
            action={
              block ? undefined : (
                <ButtonLink href="/m/deals/new" size="lg">
                  Report a deal
                </ButtonLink>
              )
            }
          />
        ) : (
          <div className="space-y-5">
            {months.map((group) => (
              <div key={group.month}>
                <p className="mb-2 px-1 text-[13px] font-semibold text-m-muted">
                  {payMonthLabel(group.month)}
                </p>
                <ul className="m-card divide-y divide-m-line overflow-hidden">
                  {group.lines.map((line) => (
                    <li key={line.id}>
                      <LedgerRow line={line} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ TOTALS ══ */

/** "30 Sept": pay day, short enough for a tile. */
function payDayShort(at = Date.now()): string {
  const now = new Date(at);
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * The three figures, one size for all three: the size the longest one needs to
 * fit its tile at the reader's screen width.
 */
function tileFigureSize(wholes: readonly string[]): string {
  const widest = Math.max(
    ...wholes.map((whole) => {
      const digits = whole.replace(/\D/gu, "").length;
      return digits * 0.6 + (whole.length - digits) * 0.3 + 0.7;
    }),
  );
  return `min(1.0625rem, calc(((100vw - 3rem) / 3 - 1rem) / ${widest.toFixed(2)}))`;
}

function Totals({ data }: { data: MoneyResponse }) {
  const { me } = useMarketer();
  const { balance } = data;
  // The same hook as the home figure, so "Being checked" can never say two things.
  const checking = useIfApproved(balance, me?.rates ?? null);

  const waiting = balance.waitingMinor + balance.scheduledMinor;
  const whole = (minor: number) => moneyParts(minor, balance.currency).whole;
  const size = tileFigureSize([whole(waiting), whole(checking ?? 0), whole(balance.paidMinor)]);

  return (
    <div className="grid grid-cols-3 gap-2" style={{ "--m-tile": size } as CSSProperties}>
      <Tile Icon={IconPayDay} label="Waiting" caption={`On ${payDayShort()}`}>
        <Amount minor={waiting} currency={balance.currency} size="sm" className="text-(length:--m-tile)" />
      </Tile>
      <Tile Icon={IconDeals} label="Being checked" caption="If approved" href="/m/deals">
        {checking === null ? (
          <Skeleton className="h-4 w-16" />
        ) : (
          <Amount minor={checking} currency={balance.currency} size="sm" className="text-(length:--m-tile)" />
        )}
      </Tile>
      <Tile Icon={IconBank} label="Paid so far" caption="To your bank">
        <Amount
          minor={balance.paidMinor}
          currency={balance.currency}
          size="sm"
          className="text-(length:--m-tile)"
        />
      </Tile>
    </div>
  );
}

function Tile({
  Icon,
  label,
  caption,
  href,
  children,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  caption: string;
  href?: string;
  children: ReactNode;
}) {
  const body = (
    <>
      <span aria-hidden className="-ml-1 -mt-0.5 block">
        <Icon size={40} />
      </span>
      <span className="mt-1.5 block truncate text-[12px] font-semibold text-m-muted">{label}</span>
      <span className="mt-1 block whitespace-nowrap text-m-text">{children}</span>
      <span className="mt-1 block truncate text-[11px] text-m-faint">{caption}</span>
    </>
  );
  // 8px sides, so "Being checked" still fits a third of a 360px screen.
  const cls = "m-card block min-w-0 px-2 pb-3 pt-2.5";
  if (href) {
    return (
      <Link href={href} className={`${cls} m-press m-press-light`}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/* ═══════════════════════════════════════════════════════════════════ ROWS ══ */

/** "Sent 10 Sept", or when this month's money goes out while its pay day is still ahead. */
function paymentWhen(payment: PayHistoryRow): string {
  if (payment.paidAt) return `Sent ${shortDate(payment.paidAt)}`;
  const [year, month] = payment.month.split("-").map(Number);
  if (payment.status === "pending" && year && month) {
    const payDay = new Date(year, month, 0, 23, 59, 59).getTime();
    if (payDay > Date.now()) return `Goes out by ${shortDate(payDay)}`;
  }
  return "Not sent yet";
}

function PaymentRow({ payment }: { payment: PayHistoryRow }) {
  return (
    <Link
      href={`/m/money/${encodeURIComponent(payment.payRunId)}`}
      className="m-press m-press-light flex w-full items-center gap-3 px-4 py-3.5 text-left"
    >
      <span aria-hidden className="shrink-0">
        <IconMoney size={42} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-m-text">
          {payMonthLabel(payment.month)}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-m-muted">
          {paymentWhen(payment)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-m-text">
          <Amount minor={payment.totalMinor} currency={payment.currency} size="md" />
        </span>
        <span className="mt-1.5 flex justify-end">
          <PaymentChip status={payment.status} />
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-m-faint" aria-hidden />
    </Link>
  );
}

/* The title gets the whole width, because a home's name is what a marketer
   scans for; the money sits under it on the right. */
function LedgerRow({ line }: { line: LedgerLine }) {
  const Icon = LINE_ICON[line.kind];
  const voided = line.status === "void";
  const body = (
    <>
      <span aria-hidden className="-mt-0.5 shrink-0">
        <Icon size={42} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug text-m-text">
            {line.dealTitle || line.note || "A change by AV Homes"}
          </span>
          {line.dealId && (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-m-faint" aria-hidden />
          )}
        </span>
        {/* The words wrap rather than cut, so the status is never the part that goes missing. */}
        <span className="mt-1 flex items-end justify-between gap-3">
          <span className="min-w-0 text-[13px] leading-snug text-m-muted">
            {lineSource(line)} &middot;{" "}
            <span className="whitespace-nowrap">{LINE_STATUS[line.status]}</span>
          </span>
          <span className={`shrink-0 ${voided ? "text-m-faint line-through" : "text-m-text"}`}>
            {line.amountMinor < 0 ? (
              <NegativeAmount minor={line.amountMinor} currency={line.currency} />
            ) : (
              <Amount minor={line.amountMinor} currency={line.currency} size="md" />
            )}
          </span>
        </span>
      </span>
    </>
  );

  const cls = "flex w-full items-start gap-3 px-4 py-3.5 text-left";
  if (line.dealId) {
    return (
      <Link href={`/m/deals/${encodeURIComponent(line.dealId)}`} className={`${cls} m-press m-press-light`}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}
