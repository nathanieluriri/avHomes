"use client";

import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Check, Copy, Phone } from "lucide-react";
import { payMonthLabel, type PayIssue } from "@avhomes/contracts";
import { AppShell, useMarketer } from "@/components/marketer/AppShell";
import { Sheet } from "@/components/marketer/Sheet";
import { PhotoGallery } from "@/components/marketer/deals/PhotoGallery";
import { toApiError } from "@/components/marketer/deals/ProofPicker";
import { IconBank, IconHelp, IconMoney } from "@/components/marketer/icons3d";
import { Amount, HeroFigure } from "@/components/marketer/money/Amount";
import { IssueThread } from "@/components/marketer/money/IssueThread";
import { PaymentChip } from "@/components/marketer/money/PaymentChip";
import { useHash, useSpotlight } from "@/components/marketer/team/share";
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  RowGroup,
  SectionLabel,
  Skeleton,
  inputCls,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { fullDate, shortDate } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import {
  nowMs,
  type IssueResponse,
  type IssuesResponse,
  type MoneyResponse,
  type PayHistoryRow,
} from "@/lib/marketer/api";

/**
 * One month's payment, and the one thing a marketer must be able to do about
 * it: say the money never arrived, then follow the answer.
 *
 * Both the "money was sent" and the "AV Homes replied" alerts land here, so the
 * screen opens on whichever matters: the conversation when there is one, where
 * the money went when there is not.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last day of a pay run's month, which is when its money goes out. */
function runPayDay(month: string): Date | null {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return null;
  return new Date(year, mon, 0, 23, 59, 59);
}

/** "Guaranty Trust Bank 6789" as the API writes it, split back into a name and the last four. */
function bankParts(label: string): { name: string; last4: string } {
  const match = /^(.*\S)\s+(\d{4})$/u.exec(label.trim());
  return match ? { name: match[1] ?? label, last4: match[2] ?? "" } : { name: label, last4: "" };
}

function ThreadTab({ issue }: { issue: PayIssue }) {
  const last = issue.messages.at(-1);
  return (
    <>
      Your report
      {issue.status === "resolved" ? (
        <Chip tone="good">Sorted</Chip>
      ) : last?.bySide === "admin" ? (
        <Chip tone="act">New reply</Chip>
      ) : (
        <Chip tone="heads-up">Open</Chip>
      )}
    </>
  );
}

export default function PaymentPage() {
  const { payRunId } = useParams<{ payRunId: string }>();
  const money = useAsync((signal) => api.get<MoneyResponse>("/marketing/money", signal), []);
  const issues = useAsync((signal) => api.get<IssuesResponse>("/marketing/issues", signal), []);
  // A report, reply or close answers with the report as it now stands.
  const [latest, setLatest] = useState<PayIssue | null>(null);
  const [justReported, setJustReported] = useState(false);

  const payment = money.data?.payments.find((row) => row.payRunId === payRunId) ?? null;
  const fetched = issues.data?.items.find((row) => row.payRunId === payRunId) ?? null;
  const issue = latest && latest.payRunId === payRunId ? latest : fetched;
  // Held back until both reads land, so the thread never pushes the screen down after it drew.
  const ready = money.data !== null && (issues.data !== null || issues.error !== null);

  const tab = money.error ? (
    "Payment"
  ) : !ready ? (
    <Skeleton className="h-5 w-32" />
  ) : !payment ? (
    "Not found"
  ) : issue ? (
    <ThreadTab issue={issue} />
  ) : payment.paidAt === null ? (
    "Where it goes"
  ) : (
    "Where it went"
  );

  return (
    <AppShell
      back="/m/money"
      title={payment ? payMonthLabel(payment.month) : ready || money.error ? "Payment" : undefined}
      hero={<PaymentHero payment={payment} loading={!ready && !money.error} />}
      tab={tab}
    >
      <div className="px-4">
        {money.error ? (
          <ErrorNote error={money.error} onRetry={money.reload} />
        ) : !ready || !money.data ? (
          <BodySkeleton />
        ) : !payment ? (
          <EmptyState
            art={<IconMoney size={88} />}
            title="We cannot find that payment"
            hint="It is not on your account. Your payments are all on the money screen."
            action={
              <ButtonLink href="/m/money" size="lg" variant="secondary">
                See your money
              </ButtonLink>
            }
          />
        ) : (
          <PaymentBody
            payment={payment}
            issue={issue}
            issuesError={issues.error}
            onRetryIssues={issues.reload}
            windowDays={money.data.issueWindowDays}
            justReported={justReported}
            onIssue={(next, reported) => {
              setLatest(next);
              if (reported) setJustReported(true);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════ HERO ══ */

function PaymentHero({ payment, loading }: { payment: PayHistoryRow | null; loading: boolean }) {
  if (loading) {
    return (
      <div aria-hidden className="mt-5 flex flex-col items-center">
        <Skeleton onWine className="h-4 w-28" />
        <Skeleton onWine className="mt-3 h-11 w-56" radius="12px" />
        <Skeleton onWine className="mt-3.5 h-6 w-48" radius="999px" />
      </div>
    );
  }
  if (!payment) return null;

  const label =
    payment.status === "paid" ? "We sent you" : payment.status === "held" ? "Held back" : "Coming to you";
  const payDay = runPayDay(payment.month);
  const when = payment.paidAt
    ? `Sent on ${fullDate(payment.paidAt)}`
    : payment.status === "pending" && payDay && payDay.getTime() > nowMs()
      ? `Goes out by ${fullDate(payDay.getTime())}`
      : "Not sent yet";

  return (
    <HeroFigure
      label={label}
      icon={<IconMoney size={24} className="-my-1" />}
      minor={payment.totalMinor}
      currency={payment.currency}
    >
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <PaymentChip status={payment.status} />
        <span className="text-[14px] text-white/85">{when}</span>
      </div>
    </HeroFigure>
  );
}

function BodySkeleton() {
  return (
    <div aria-hidden className="space-y-7">
      <RowGroup>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-11 w-11" radius="14px" />
          <div className="flex-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="flex justify-between px-4 py-3.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </RowGroup>
      <Skeleton className="h-24 w-24" radius="14px" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ BODY ══ */

function PaymentBody({
  payment,
  issue,
  issuesError,
  onRetryIssues,
  windowDays,
  justReported,
  onIssue,
}: {
  payment: PayHistoryRow;
  issue: PayIssue | null;
  issuesError: ApiError | null;
  onRetryIssues: () => void;
  windowDays: number;
  justReported: boolean;
  onIssue: (next: PayIssue, reported: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const paid = payment.status === "paid" && payment.paidAt !== null;
  // The "AV Homes replied" alert links to #thread: bring the conversation up and ring it once.
  const hash = useHash();
  const threadSpot = useSpotlight(hash === "#thread" ? "thread" : null, "start");

  return (
    <div className="space-y-7">
      {issuesError && !issue && (
        <ErrorNote error={issuesError} onRetry={onRetryIssues} />
      )}

      {issue && (
        <section aria-label="Your report">
          {/* The id sits with the margin, so the shell's own jump to #thread and this ring land in one
              place: the tab label in view under the bar that pins on scroll. */}
          <div id="thread" ref={threadSpot} className="scroll-mt-[7.5rem] rounded-[1.25rem]">
            <IssueThread
              issue={issue}
              onChanged={(next) => onIssue(next, false)}
              focusOnMount={justReported}
            />
          </div>
        </section>
      )}

      <section aria-label={issue ? undefined : "Where it went"}>
        {issue && <SectionLabel>Where it went</SectionLabel>}
        <WhereItWent payment={payment} />
      </section>

      {/* Above the slip: it is the one thing to do here, so it should not need a scroll. */}
      {!issue && (
        <NextStep payment={payment} windowDays={windowDays} onReport={() => setAsking(true)} />
      )}

      {payment.proof.length > 0 && (
        <section>
          <SectionLabel>Transfer slip</SectionLabel>
          <PhotoGallery urls={payment.proof} name="Transfer slip" />
        </section>
      )}

      {paid && (
        <ReportSheet
          open={asking}
          payment={payment}
          onClose={() => setAsking(false)}
          onSent={(next) => {
            setAsking(false);
            onIssue(next, true);
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
          }}
        />
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[3.25rem] items-center justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-[14px] text-m-muted">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1 text-right text-[15px] font-semibold text-m-text">
        {children}
      </span>
    </div>
  );
}

function WhereItWent({ payment }: { payment: PayHistoryRow }) {
  const bank = bankParts(payment.bankLabel);
  const sent = payment.paidAt !== null;

  return (
    <RowGroup>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span aria-hidden className="shrink-0">
          <IconBank size={44} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-m-muted">{sent ? "Sent to" : "Goes to"}</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-m-text">
            {bank.name || "The bank on your account"}
          </p>
          {bank.last4 !== "" && (
            <p className="mt-0.5 text-[13px] text-m-muted">
              Account ending <span className="m-num font-semibold text-m-text">{bank.last4}</span>
            </p>
          )}
        </div>
      </div>
      {payment.paidAt !== null && <Fact label="Date sent">{fullDate(payment.paidAt)}</Fact>}
      <Fact label="Amount">
        <Amount minor={payment.totalMinor} currency={payment.currency} size="md" />
      </Fact>
      {payment.reference !== "" && (
        <Fact label="Reference">
          <span className="m-num truncate">{payment.reference}</span>
          <CopyButton text={payment.reference} />
        </Fact>
      )}
    </RowGroup>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard here. The reference is on screen to read out.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy the reference"
        className="m-press m-tap -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-m-muted active:bg-m-raised"
      >
        {copied ? (
          <Check className="h-4 w-4 text-(color:--m-good-fg)" strokeWidth={2.4} aria-hidden />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Reference copied" : ""}
      </span>
    </>
  );
}

/** What the marketer can do next about a payment with no report on it. */
function NextStep({
  payment,
  windowDays,
  onReport,
}: {
  payment: PayHistoryRow;
  windowDays: number;
  onReport: () => void;
}) {
  const { me } = useMarketer();
  const phone = me?.supportPhone ?? "";

  if (payment.status === "held") {
    return (
      <Note tone="warn">
        AV Homes held this payment back. The money is in Waiting for pay day again and goes out on a
        later pay day.
      </Note>
    );
  }
  if (payment.paidAt === null) {
    return <Note>This has not been sent yet. You will get an alert the moment it goes out.</Note>;
  }

  // Whole days still inside the window, rounded down, so the count never promises a day the server refuses.
  const remainingMs = windowDays * DAY_MS - (nowMs() - payment.paidAt);
  const left = Math.floor(remainingMs / DAY_MS);
  if (remainingMs < 0) {
    return (
      <div className="m-card p-4">
        <p className="text-[14px] leading-relaxed text-m-muted">
          The {windowDays} days for telling us about this payment have passed. If something is
          still wrong, call AV Homes.
        </p>
        {phone !== "" && (
          <ButtonLink
            href={`tel:${phone.replace(/\s/gu, "")}`}
            external
            variant="secondary"
            size="md"
            className="mt-3"
          >
            <Phone className="h-4 w-4" aria-hidden />
            Call AV Homes
          </ButtonLink>
        )}
      </div>
    );
  }

  return (
    <div className="m-card p-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="-ml-1 shrink-0">
          <IconHelp size={50} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold leading-snug text-m-text">
            Didn&apos;t get this money?
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-m-muted">
            Check your bank first. If it is not there, tell us and we will look into the transfer.{" "}
            {left === 0 ? "Today is the last day to tell us." : `You have ${left} ${left === 1 ? "day" : "days"} left to tell us.`}
          </p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="lg"
        full
        className="mt-4"
        aria-haspopup="dialog"
        onClick={onReport}
      >
        Tell AV Homes
      </Button>
    </div>
  );
}

function ReportSheet({
  open,
  payment,
  onClose,
  onSent,
}: {
  open: boolean;
  payment: PayHistoryRow;
  onClose: () => void;
  onSent: (issue: PayIssue) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const bank = bankParts(payment.bankLabel);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<IssueResponse>("/marketing/issues", {
        payRunId: payment.payRunId,
        text: text.trim(),
      });
      setText("");
      onSent(result.issue);
    } catch (err) {
      setError(toApiError(err));
    }
    setBusy(false);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Didn't get this money?"
      hint="Tell us what you see in your bank. We check the transfer and answer you on this screen."
    >
      <div className="space-y-4">
        <div className="m-card flex items-center gap-3 px-3.5 py-3">
          <span aria-hidden className="shrink-0">
            <IconMoney size={40} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-m-text">
              <Amount minor={payment.totalMinor} currency={payment.currency} size="md" />
            </p>
            <p className="mt-1 text-[13px] leading-snug text-m-muted">
              {bank.name}
              {bank.last4 !== "" ? ` ending ${bank.last4}` : ""}
              {payment.paidAt !== null && (
                <span className="whitespace-nowrap">, sent {shortDate(payment.paidAt)}</span>
              )}
            </p>
          </div>
        </div>
        <Field label="What happened" hint="Not required, but it helps us check faster.">
          <textarea
            value={text}
            rows={4}
            maxLength={600}
            onChange={(event) => setText(event.target.value)}
            placeholder="Nothing came into my account on that date."
            className={`${inputCls} resize-none`}
          />
        </Field>
        {error && <ErrorNote error={error} onRetry={() => void send()} />}
        <PrimaryButton busy={busy} onClick={() => void send()}>
          {busy ? "Sending" : "Send to AV Homes"}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}
