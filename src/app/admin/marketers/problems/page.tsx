"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, LifeBuoy } from "lucide-react";
import {
  formatMoney,
  payMonthLabel,
  type IssueStatus,
  type PayIssue,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { messageTime, relative } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import ImagePicker from "@/components/admin/ImagePicker";
import { signalSpotlight } from "@/components/admin/spotlight/signal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * Payment problems: a marketer says the money never arrived.
 *
 * A thread rather than a ticket, because the answer is almost always a receipt
 * and an account number read back to each other. The panel opens IN PLACE
 * instead of in a sheet: the reply box carries an image picker, which opens a
 * sheet of its own, and a sheet inside a sheet on a phone is a trap.
 */

const TABS: readonly { value: IssueStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Sorted" },
];

export default function ProblemsPage() {
  const [tab, setTab] = useState<IssueStatus>("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync<{ items: PayIssue[] }>(
    (signal) => api.get<{ items: PayIssue[] }>(`/admin/marketing/issues?status=${tab}`, signal),
    [tab],
    { keepPrevious: true },
  );

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        icon={LifeBuoy}
        backTo="/admin/marketers/pay"
        backLabel="Pay day"
        title="Payment problems"
        subtitle="Transfers a marketer says never landed. Each one is a conversation until it is sorted."
      />

      <div className="mb-3 flex gap-1" role="group" aria-label="Filter problems">
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={tab === option.value}
            data-spotlight={option.value === "open" && tab !== "open" ? "problems-find-open" : undefined}
            onClick={() => {
              setTab(option.value);
              setOpenId(null);
            }}
            className={`c-tap h-8 rounded-lg px-3 text-[13px] font-medium transition-colors ${
              tab === option.value
                ? "bg-plum-950 text-white"
                : "text-slate-600 hover:bg-mist-200/60"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40 rounded-2xl" />}

      {data && items.length === 0 && (
        // Tells the walkthrough there is nothing open to practise on.
        <div data-spotlight={tab === "open" && !loading ? "problems-none" : undefined}>
          <EmptyState
            icon={LifeBuoy}
            title={tab === "open" ? "Nothing is disputed" : "Nothing sorted yet"}
            hint={
              tab === "open"
                ? "Every payment this month is accounted for. A marketer raises one of these from their own app."
                : "Problems you have closed will be kept here."
            }
          />
        </div>
      )}

      <div className="space-y-3">
        {items.map((issue, index) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            tutorial={tab === "open" && !loading && index === 0}
            open={openId === issue.id}
            onToggle={() => setOpenId((current) => (current === issue.id ? null : issue.id))}
            onChanged={reload}
          />
        ))}
      </div>
    </>
  );
}

function IssueCard({
  issue: initial,
  tutorial,
  open,
  onToggle,
  onChanged,
}: {
  issue: PayIssue;
  /** The card the sort-a-payment-problem walkthrough opens. */
  tutorial: boolean;
  open: boolean;
  onToggle: () => void;
  /** Re-reads the list, so a sorted problem leaves the Open tab. */
  onChanged: () => void;
}) {
  const [issue, setIssue] = useState<PayIssue>(initial);
  const [text, setText] = useState("");
  const [proof, setProof] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send(kind: "reply" | "resolve") {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ issue: PayIssue }>(
        `/admin/marketing/issues/${issue.id}/${kind}`,
        kind === "reply" ? { text, proof } : { text },
      );
      setIssue(res.issue);
      setText("");
      setProof([]);
      if (kind === "reply") signalSpotlight("problem-replied");
      if (kind === "resolve") onChanged();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const last = issue.messages[issue.messages.length - 1];

  return (
    <Card padded={false}>
      {/* The whole summary row toggles. It is the only control on the closed
          card, so making the chevron the target would be a 16px hit area for
          something the entire row is already drawn as. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-spotlight={tutorial ? "problem-open" : undefined}
        className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[13px] font-semibold text-plum-950">
              {issue.marketerName}
            </span>
            <span className="text-[12px] text-slate-600">{issue.code}</span>
            <Badge tone={issue.status === "open" ? "amber" : "green"}>
              {issue.status === "open" ? "Open" : "Sorted"}
            </Badge>
          </span>
          <span className="mt-1 block truncate text-[12px] text-slate-600">
            {payMonthLabel(issue.month)} · {formatMoney(issue.amountMinor, issue.currency)} ·
            raised {relative(issue.createdAt)}
            {last ? ` · last word from ${last.bySide === "admin" ? "us" : "them"}` : ""}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-550 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-mist-100 p-4 sm:p-5">
          {error && (
            <div className="mb-3">
              <ErrorNote error={error} />
            </div>
          )}

          <ul className="space-y-3" aria-label="The conversation so far" data-spotlight="problem-thread">
            {issue.messages.map((message, index) => (
              <li
                key={`${message.at}-${index}`}
                className={`rounded-2xl px-3.5 py-2.5 ${
                  message.bySide === "admin"
                    ? "bg-wine-600 text-white"
                    : "bg-mist-100 text-plum-950"
                }`}
              >
                <p className="text-[13px] leading-relaxed [overflow-wrap:anywhere]">
                  {message.text}
                </p>
                {message.proof.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {message.proof.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
                          <img
                            src={url}
                            alt=""
                            className="h-16 w-16 rounded-lg border border-white/30 bg-mist-100 object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <p
                  className={`mt-1 text-[11px] ${
                    message.bySide === "admin" ? "text-wine-100" : "text-slate-550"
                  }`}
                >
                  {message.byName} · {messageTime(message.at)}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-3 border-t border-mist-100 pt-4">
            <Field label="Reply" hint="They read this in the app, on their phone." spotlight="problem-reply">
              <textarea
                className={inputClass}
                rows={3}
                value={text}
                placeholder="The transfer went out on the 3rd, reference FT26091234567. Check with your bank."
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
            {/* `as="group"`, not a label: ImagePicker owns a hidden file input,
                and a bare label forwards a tap on its own whitespace to it. */}
            <Field label="Receipt" hint="Optional. Proof the money left." as="group" spotlight="problem-receipt">
              <ImagePicker value={proof} onChange={setProof} max={1} coverLabel="Receipt" />
            </Field>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => void send("reply")}
                disabled={busy || text.trim() === ""}
                spotlight="problem-send"
              >
                {busy ? "Sending" : "Send reply"}
              </Button>
              {issue.status === "open" && (
                <Button
                  variant="ghost"
                  onClick={() => void send("resolve")}
                  disabled={busy}
                  spotlight="problem-sort"
                >
                  Mark as sorted
                </Button>
              )}
              <Link
                href={`/admin/marketers/${issue.marketerId}`}
                className="c-tap inline-flex h-11 items-center justify-center rounded-lg px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 sm:ml-auto sm:h-8"
              >
                Open their account
              </Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
