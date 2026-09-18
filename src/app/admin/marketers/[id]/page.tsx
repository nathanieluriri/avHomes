"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, UsersRound } from "lucide-react";
import {
  DEAL_STATUS_LABEL,
  formatMoney,
  formatPhone,
  payMonthLabel,
  type Deal,
  type LedgerLine,
  type Marketer,
  type MarketerBalance,
  type MarketerStatus,
  type TeamMember,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, fullDate, shortDate } from "@/lib/admin/format";
import {
  DEAL_TONE,
  LEDGER_KIND_LABEL,
  LEDGER_STATUS_LABEL,
  LEDGER_TONE,
  MARKETER_ADMIN_LABEL,
  MARKETER_TONE,
  PAY_ITEM_LABEL,
  PAY_ITEM_TONE,
  toApiError,
  type PayHistoryRow,
  type UplineMember,
} from "@/lib/admin/marketing";
import {
  Badge,
  Card,
  CardHead,
  ConfirmButton,
  DRow,
  DefinitionList,
  EmptyState,
  ErrorNote,
  Field,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
  type Tone,
} from "@/components/admin/ui";

/**
 * One marketer: who they are, who is above them, who is under them, and every
 * naira that has moved because of them.
 *
 * Money is in the aside because it is the answer to the question that brings
 * anybody here, and because the three status controls sit under it: what
 * somebody is owed is exactly the thing you want in front of you before pausing
 * or banning them.
 */

interface MarketerDetail {
  marketer: Marketer;
  balance: MarketerBalance;
  /** How many people sit at level 1, 2 and 3 below them. */
  levels: [number, number, number];
  members: TeamMember[];
  /** Nearest first, at most two. A null entry is an account that has gone. */
  upline: (UplineMember | null)[];
  deals: Deal[];
  lines: LedgerLine[];
  payments: PayHistoryRow[];
}

export default function MarketerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<MarketerDetail>(
    (signal) => api.get<MarketerDetail>(`/admin/marketing/marketers/${id}`, signal),
    [id],
  );

  /* Both branches keep the header, so the way back survives a failure and the
     rise never animates an empty sheet. */
  if (loading) {
    return (
      <>
        <PageHeader
          icon={UsersRound}
          backTo="/admin/marketers"
          backLabel="Marketers"
          title="A marketer"
        />
        <div aria-busy="true">
          <span className="sr-only">Loading this marketer</span>
          <PageColumns
            asideFirstOnMobile
            aside={
              <div className="space-y-4">
                <Skeleton className="h-40 rounded-2xl" />
                <Skeleton className="h-48 rounded-2xl" />
              </div>
            }
          >
            <div className="space-y-4">
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
          </PageColumns>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          icon={UsersRound}
          backTo="/admin/marketers"
          backLabel="Marketers"
          title="A marketer"
        />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }

  if (!data) return null;

  // Keyed, so moving between people builds fresh reason state rather than
  // carrying one person's typed reason onto the next person's ban.
  return <MarketerScreen key={data.marketer.id} initial={data} />;
}

function MarketerScreen({ initial }: { initial: MarketerDetail }) {
  const [marketer, setMarketer] = useState<Marketer>(initial.marketer);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const { balance, levels, members, upline, deals, lines, payments } = initial;

  async function move(status: MarketerStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ marketer: Marketer }>(
        `/admin/marketing/marketers/${marketer.id}/status`,
        { status, reason },
      );
      setMarketer(res.marketer);
      setReason("");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const aside = (
    <aside className="space-y-4">
      <Card>
        <CardHead title="Their money" />
        <DefinitionList>
          <DRow label="Waiting to be paid">
            {formatMoney(balance.waitingMinor, balance.currency)}
          </DRow>
          <DRow label="In a pay list">
            {formatMoney(balance.scheduledMinor, balance.currency)}
          </DRow>
          <DRow label="Paid so far">{formatMoney(balance.paidMinor, balance.currency)}</DRow>
        </DefinitionList>
        {/* Named as a deal value, not as money. It is what the deals under
            review are worth, which is not what this person would earn on them. */}
        {balance.pendingMinor > 0 && (
          <p className="mt-3 border-t border-mist-100 pt-2 text-[12px] leading-relaxed text-slate-600">
            {formatMoney(balance.pendingMinor, balance.currency)} of deals are still being
            checked. Nothing is owed on those yet.
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="Bank account" />
        {marketer.bank ? (
          <>
            <DefinitionList>
              <DRow label="Bank">{marketer.bank.bankName}</DRow>
              <DRow label="Account number">
                <span className="c-num">{marketer.bank.accountNumber}</span>
              </DRow>
              <DRow label="Name at the bank">
                {marketer.bank.accountName || "The bank did not answer"}
              </DRow>
              <DRow label="Checked">
                {marketer.bank.verifiedAt !== null
                  ? dateTime(marketer.bank.verifiedAt)
                  : "Never"}
              </DRow>
            </DefinitionList>
            {marketer.bank.verifiedAt === null ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                Nobody has confirmed this account with the bank. The name here is
                what they typed, not what the bank returned.
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                The bank returned this name for that number.
              </p>
            )}
          </>
        ) : (
          <EmptyState
            bare
            title="No bank account"
            hint="A pay run will still list them, with nowhere to send it. They add one from the app."
          />
        )}
      </Card>

      <Card>
        <CardHead title="Account status" />
        <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
          A paused marketer keeps their team and their money and cannot report a
          new deal. Banning is the ending: <span className="font-semibold">everyone
          they invited moves to the founder account</span>, and their own share of
          any future deal goes to AV Homes instead.
        </p>

        <Field label="Reason" hint="They read this on their own screen. Keep it plain.">
          <input
            className={inputClass}
            value={reason}
            placeholder="Reported a deal that never happened"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        <div className="mt-3 flex flex-col gap-2">
          {marketer.status !== "active" && (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Yes, bring them back"
              disabled={busy}
              onConfirm={() => void move("active")}
            >
              Reactivate
            </ConfirmButton>
          )}
          {marketer.status === "active" && (
            <ConfirmButton
              variant="ghost"
              confirmLabel="Yes, pause them"
              disabled={busy || reason.trim() === ""}
              onConfirm={() => void move("paused")}
            >
              Pause
            </ConfirmButton>
          )}
          {marketer.status !== "banned" && (
            <ConfirmButton
              confirmLabel="Yes, ban and move their team"
              disabled={busy || reason.trim() === ""}
              onConfirm={() => void move("banned")}
            >
              Ban
            </ConfirmButton>
          )}
        </div>

        {marketer.statusReason && (
          <p className="mt-3 border-t border-mist-100 pt-2 text-[12px] leading-relaxed text-slate-600">
            Last reason given: {marketer.statusReason}
          </p>
        )}
      </Card>
    </aside>
  );

  return (
    <>
      <PageHeader
        icon={UsersRound}
        backTo="/admin/marketers"
        backLabel="Marketers"
        title={marketer.displayName || "No name"}
        badge={
          <Badge tone={MARKETER_TONE[marketer.status]}>
            {MARKETER_ADMIN_LABEL[marketer.status]}
          </Badge>
        }
        subtitle={`${marketer.code} · joined ${fullDate(marketer.joinedAt)}`}
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}

      <PageColumns asideFirstOnMobile aside={aside}>
        <div className="space-y-4">
          <Card>
            <CardHead title="Profile" />
            <DefinitionList>
              <DRow label="Email">{marketer.email || "Not given"}</DRow>
              <DRow label="Phone">{formatPhone(marketer.phone) || "Not given"}</DRow>
              <DRow label="State">{marketer.state || "Not given"}</DRow>
              <DRow label="Code">{marketer.code}</DRow>
              <DRow label="Console account">{marketer.isAdmin ? "Yes" : "No"}</DRow>
            </DefinitionList>
          </Card>

          <Card>
            <CardHead title="Who is above them" />
            {upline.filter(Boolean).length === 0 ? (
              <EmptyState
                bare
                title="Nobody"
                hint="They joined without a referral code, or they are the founder account."
              />
            ) : (
              <ul className="space-y-2">
                {upline.map((person, index) =>
                  person ? (
                    <li key={person.id}>
                      <Link
                        href={`/admin/marketers/${person.id}`}
                        className="flex items-center gap-3 rounded-xl border border-mist-200 p-3 transition-colors hover:bg-mist-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-plum-950">
                            {person.name}
                          </span>
                          <span className="block truncate text-[12px] text-slate-600">
                            {person.code} · earns level {index + 2} on their deals
                          </span>
                        </span>
                        <Badge tone={MARKETER_TONE[person.status]}>
                          {MARKETER_ADMIN_LABEL[person.status]}
                        </Badge>
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Their team" />
            <div className="grid grid-cols-3 gap-2">
              {levels.map((count, index) => (
                <div key={index} className="rounded-xl bg-mist-50 px-3 py-2.5 text-center">
                  <p className="c-num text-lg font-bold text-plum-950">{count}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Level {index + 1}
                  </p>
                </div>
              ))}
            </div>

            {members.length > 0 && (
              <ul className="mt-3 space-y-2">
                {members.map((member) => (
                  <li key={member.id}>
                    <Link
                      href={`/admin/marketers/${member.id}`}
                      className="flex items-center gap-3 rounded-xl border border-mist-200 p-3 transition-colors hover:bg-mist-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-plum-950">
                          {member.displayName}
                        </span>
                        <span className="block truncate text-[12px] text-slate-600">
                          Level {member.level} · {member.code} · {member.dealCount}{" "}
                          {member.dealCount === 1 ? "deal" : "deals"}
                          {member.underName ? ` · under ${member.underName}` : ""}
                        </span>
                      </span>
                      <Badge tone={MARKETER_TONE[member.status]}>
                        {MARKETER_ADMIN_LABEL[member.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Deals they reported" />
            {deals.length === 0 ? (
              <EmptyState bare title="None yet" hint="Nothing has come in from this person." />
            ) : (
              <ul className="space-y-2">
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <Link
                      href={`/admin/marketers/deals/${deal.id}`}
                      className="flex items-center gap-3 rounded-xl border border-mist-200 p-3 transition-colors hover:bg-mist-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-plum-950">
                          {deal.listingTitle || "Untitled listing"}
                        </span>
                        <span className="block truncate text-[12px] text-slate-600">
                          {formatMoney(deal.amountMinor, deal.currency)} ·{" "}
                          {shortDate(deal.createdAt)}
                        </span>
                      </span>
                      <Badge tone={DEAL_TONE[deal.status]}>
                        {DEAL_STATUS_LABEL[deal.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Money lines" />
            <p className="mb-3 -mt-1 text-[12px] leading-relaxed text-slate-600">
              Lines are added, never edited. A deal that fell through after
              payment shows up as a take-back rather than a deletion.
            </p>
            {lines.length === 0 ? (
              <EmptyState bare title="Nothing earned yet" hint="An approved deal writes the first line." />
            ) : (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center gap-3 rounded-xl border border-mist-200 p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-plum-950">
                        {line.dealTitle || LEDGER_KIND_LABEL[line.kind]}
                      </span>
                      <span className="block truncate text-[12px] text-slate-600">
                        {LEDGER_KIND_LABEL[line.kind]}
                        {line.level > 0 ? ` · level ${line.level}` : ""} ·{" "}
                        {shortDate(line.createdAt)}
                        {line.note ? ` · ${line.note}` : ""}
                      </span>
                    </span>
                    <span
                      className={`c-num shrink-0 text-[13px] font-semibold ${
                        line.amountMinor < 0 ? "text-red-700" : "text-plum-950"
                      }`}
                    >
                      {formatMoney(line.amountMinor, line.currency)}
                    </span>
                    <Badge tone={LEDGER_TONE[line.status]}>
                      {LEDGER_STATUS_LABEL[line.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Payments" />
            {payments.length === 0 ? (
              <EmptyState bare title="Never been paid" hint="They have not appeared in a closed pay run yet." />
            ) : (
              <ul className="space-y-2">
                {payments.map((payment) => (
                  <li
                    key={payment.payRunId}
                    className="flex items-center gap-3 rounded-xl border border-mist-200 p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-plum-950">
                        {payMonthLabel(payment.month)}
                      </span>
                      <span className="block truncate text-[12px] text-slate-600">
                        {formatMoney(payment.totalMinor, payment.currency)}
                        {payment.bankLabel ? ` · ${payment.bankLabel}` : ""}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                        {payment.paidAt !== null ? ` · ${shortDate(payment.paidAt)}` : ""}
                      </span>
                    </span>
                    {payment.issueId !== null && (
                      <Link
                        href="/admin/marketers/problems"
                        className="shrink-0 text-[12px] font-semibold text-wine-700 underline underline-offset-2"
                      >
                        Disputed
                      </Link>
                    )}
                    <Badge tone={payItemTone(payment.status)}>
                      {payItemLabel(payment.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PageColumns>
    </>
  );
}

/* The pay history rows carry a plain string rather than the union, because they
   are assembled from a run's items rather than read back through the type. */
function payItemLabel(status: string): string {
  return status in PAY_ITEM_LABEL
    ? PAY_ITEM_LABEL[status as keyof typeof PAY_ITEM_LABEL]
    : status;
}

function payItemTone(status: string): Tone {
  return status in PAY_ITEM_TONE ? PAY_ITEM_TONE[status as keyof typeof PAY_ITEM_TONE] : "neutral";
}
