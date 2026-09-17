"use client";

import { useState } from "react";
import { Banknote, Check, Copy, Download, LifeBuoy, TriangleAlert } from "lucide-react";
import {
  formatMoney,
  payMonth,
  payMonthLabel,
  plainMajor,
  type MarketingSettings,
  type PayRun,
  type PayRunItem,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime } from "@/lib/admin/format";
import {
  PAY_ITEM_LABEL,
  PAY_ITEM_TONE,
  PAY_RUN_LABEL,
  PAY_RUN_TONE,
  downloadCsv,
  toApiError,
  toCsv,
  type MarketingCounts,
} from "@/lib/admin/marketing";
import ImagePicker from "@/components/admin/ImagePicker";
import { BottomSheet } from "@/components/admin/BottomSheet";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  PageHeader,
  Skeleton,
  inputClass,
  inputClassCompact,
} from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";

/**
 * Pay day: one month, one list, one transfer per person.
 *
 * The list is made once and then worked down. Nothing on this screen moves
 * money; it records that somebody already moved it from the bank's own app,
 * which is why the reference and the proof shot are what a row is marked paid
 * WITH rather than a tick on its own.
 */

interface PayRunList {
  items: PayRun[];
  counts: MarketingCounts;
  settings: MarketingSettings;
}

interface RunDetail {
  run: PayRun;
  /** The ledger against the pay runs. Not ok means something wrote money elsewhere. */
  check: { ok: boolean; problems: string[] };
}

export default function PayPage() {
  const list = useAsync<PayRunList>(
    (signal) => api.get<PayRunList>("/admin/marketing/pay-runs", signal),
    [],
    // Held while it is read again after a change, so the header never blinks back to "Make this month's list".
    { keepPrevious: true },
  );

  const [picked, setPicked] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  // Runs come back newest month first, so the top one is the month being worked.
  const runId = picked ?? list.data?.items[0]?.id ?? null;

  const detail = useAsync<RunDetail | null>(
    (signal) =>
      runId
        ? api.get<RunDetail>(`/admin/marketing/pay-runs/${runId}`, signal)
        : Promise.resolve(null),
    [runId],
  );

  /* Read once for the life of the screen. Calling it during render makes the
     month a value that can change between two renders of the same view. */
  const [thisMonth] = useState(() => payMonth(Date.now()));
  const counts = list.data?.counts;
  const runs = list.data?.items ?? [];
  const currentRun = runs.find((run) => run.month === thisMonth) ?? null;

  async function makeList() {
    setMaking(true);
    setActionError(null);
    try {
      const res = await api.post<{ run: PayRun }>("/admin/marketing/pay-runs", {
        month: thisMonth,
      });
      setPicked(res.run.id);
      list.reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setMaking(false);
    }
  }

  const owed = counts ? formatMoney(counts.owedMinor, list.data?.settings.currency) : "";

  return (
    <>
      <PageHeader
        icon={Banknote}
        title="Pay day"
        subtitle={
          counts
            ? `${payMonthLabel(thisMonth)}. ${owed} is waiting to be paid out.`
            : "This month's transfers, and who is still owed."
        }
        actions={
          <>
            <ButtonLink href="/admin/marketers/problems" variant="ghost">
              <LifeBuoy className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Problems
              {counts && counts.issuesOpen > 0 ? ` (${counts.issuesOpen})` : ""}
            </ButtonLink>
            {/* Offered when this month has no list at all, and again while the
                list is still a draft: rebuilding a draft picks up anything
                approved since it was made, which the repo allows on purpose. */}
            {(!currentRun || currentRun.status === "draft") && (
              <Button onClick={() => void makeList()} disabled={making}>
                {making
                  ? "Working"
                  : currentRun
                    ? "Rebuild this month's list"
                    : "Make this month's list"}
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorNote error={actionError} />
        </div>
      )}
      {list.error && (
        <div className="mb-4">
          <ErrorNote error={list.error} onRetry={list.reload} />
        </div>
      )}

      {runs.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-[12px] text-slate-600" htmlFor="pay-run-month">
            Month
          </label>
          <select
            id="pay-run-month"
            className={inputClassCompact}
            value={runId ?? ""}
            onChange={(event) => setPicked(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {payMonthLabel(run.month)} · {PAY_RUN_LABEL[run.status]}
              </option>
            ))}
          </select>
        </div>
      )}

      {detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}
      {(list.loading || detail.loading) && !detail.data && <Skeleton className="h-64 rounded-2xl" />}

      {!list.loading && runs.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="No pay list yet"
          hint={
            counts && counts.owedMinor > 0
              ? "Make this month's list and it will gather everything approved up to the cut off day."
              : "Nothing has been approved yet, so there is nothing to pay. Approve a deal and the money lands here."
          }
        />
      )}

      {detail.data && (
        <RunPanel
          key={detail.data.run.id}
          initial={detail.data.run}
          check={detail.data.check}
          onChanged={() => list.reload()}
        />
      )}
    </>
  );
}

function RunPanel({
  initial,
  check,
  onChanged,
}: {
  initial: PayRun;
  check: RunDetail["check"];
  /** Re-reads the runs, so the header's list button and the month picker follow this run's status. */
  onChanged: () => void;
}) {
  const [run, setRun] = useState<PayRun>(initial);
  const [sheet, setSheet] = useState<{ mode: "pay" | "hold"; item: PayRunItem } | null>(null);
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const closed = run.status === "closed";
  const waiting = run.items.filter((item) => item.status === "pending").length;

  function open(mode: "pay" | "hold", item: PayRunItem) {
    setReference(item.reference);
    setProof(item.proof);
    setNote(item.note);
    setError(null);
    setSheet({ mode, item });
  }

  async function submit() {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const path = `/admin/marketing/pay-runs/${run.id}/${sheet.mode}`;
      const body =
        sheet.mode === "pay"
          ? { marketerId: sheet.item.marketerId, reference, proof }
          : { marketerId: sheet.item.marketerId, note };
      const res = await api.post<{ run: PayRun }>(path, body);
      setRun(res.run);
      setSheet(null);
      // The first payment starts the run, and a started run can no longer be rebuilt.
      onChanged();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ run: PayRun }>(`/admin/marketing/pay-runs/${run.id}/close`, {});
      setRun(res.run);
      onChanged();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /*
   * The CSV is built from the rows on screen, not fetched.
   *
   * These columns are the four a bulk transfer upload asks for, in the order a
   * bank's own template puts them. Amounts are in whole naira rather than kobo:
   * every upload form on this side of the world takes the major unit, and a
   * file that means kobo but is read as naira is a hundredfold mistake.
   */
  function exportCsv() {
    const rows: string[][] = [
      ["Account number", "Bank", "Name", `Amount (${run.currency})`],
      ...run.items.map((item) => [
        item.bank?.accountNumber ?? "",
        item.bank?.bankName ?? "",
        item.bank?.accountName || item.displayName,
        plainMajor(item.totalMinor, run.currency),
      ]),
    ];
    downloadCsv(`avhomes-pay-${run.month}.csv`, toCsv(rows));
  }

  function actionsFor(item: PayRunItem) {
    if (closed) return null;
    return (
      <span className="flex items-center gap-1.5">
        {item.status !== "paid" && (
          <Button size="sm" onClick={() => open("pay", item)}>
            Mark as paid
          </Button>
        )}
        {item.status === "pending" && (
          <Button size="sm" variant="ghost" onClick={() => open("hold", item)}>
            Hold
          </Button>
        )}
      </span>
    );
  }

  const columns: Column<PayRunItem>[] = [
    {
      key: "person",
      header: "Marketer",
      primary: true,
      thumb: false,
      render: (item) => <IdCell title={item.displayName} meta={item.code} />,
    },
    {
      key: "bank",
      header: "Bank account",
      mobile: "keep",
      render: (item) =>
        item.bank ? (
          <span className="flex items-center gap-1.5">
            <span className="min-w-0">
              <span className="c-num block truncate text-plum-950">
                {item.bank.accountNumber}
              </span>
              <span className="block truncate text-[12px] text-slate-600">
                {item.bank.bankName}
                {item.bank.accountName ? ` · ${item.bank.accountName}` : ""}
              </span>
            </span>
            <CopyButton value={item.bank.accountNumber} name={item.displayName} />
          </span>
        ) : (
          <Badge tone="red">No bank account</Badge>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      mobile: "keep",
      render: (item) => formatMoney(item.totalMinor, run.currency),
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (item) => (
        <Badge tone={PAY_ITEM_TONE[item.status]}>{PAY_ITEM_LABEL[item.status]}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      tight: true,
      // No `mobile`, so the card drops this column and takes `rowAction` instead.
      render: (item) => actionsFor(item),
    },
  ];

  return (
    <>
      {error && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}

      {/* The ledger disagreeing with the pay runs is the one failure this
          feature must never hide, so it is stated at the top of the screen
          rather than logged. */}
      {!check.ok && (
        <Card className="mb-4 border border-red-200 bg-red-50">
          <CardHead title="The numbers do not add up" icon={TriangleAlert} />
          <p className="mb-2 text-[13px] text-red-900">
            Something wrote money outside this screen. Do not pay anybody until
            this is explained.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[12px] text-red-800">
            {check.problems.map((problem) => (
              <li key={problem} className="[overflow-wrap:anywhere]">
                {problem}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-plum-950">
                {payMonthLabel(run.month)}
              </h2>
              <Badge tone={PAY_RUN_TONE[run.status]}>{PAY_RUN_LABEL[run.status]}</Badge>
            </div>
            <p className="mt-1 text-[12px] text-slate-600">
              {formatMoney(run.paidMinor, run.currency)} sent of{" "}
              {formatMoney(run.totalMinor, run.currency)} across {run.items.length}{" "}
              {run.items.length === 1 ? "person" : "people"}
              {run.closedAt !== null ? `. Closed ${dateTime(run.closedAt)}` : ""}.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="ghost" onClick={exportCsv} disabled={run.items.length === 0}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Download CSV
            </Button>
            {!closed && (
              <ConfirmButton
                variant="ghost"
                confirmLabel="Yes, close this run"
                disabled={busy || waiting > 0 || run.items.length === 0}
                onConfirm={() => void close()}
              >
                {waiting > 0 ? `${waiting} still to pay` : "Close this run"}
              </ConfirmButton>
            )}
          </div>
        </div>
      </Card>

      <DataTable
        caption={`Payments for ${payMonthLabel(run.month)}`}
        columns={columns}
        rows={run.items}
        rowKey={(item) => item.marketerId}
        rowAction={(item) => actionsFor(item)}
        empty={
          <EmptyState
            bare
            icon={Banknote}
            title="Nobody is on this list"
            hint="Everyone came out at zero or below the minimum payout, so their money carries into next month."
          />
        }
      />

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(next) => {
          if (!next) setSheet(null);
        }}
        title={sheet?.mode === "hold" ? "Hold this payment" : "Mark as paid"}
        description={
          sheet
            ? `${sheet.item.displayName} (${sheet.item.code}) · ${formatMoney(sheet.item.totalMinor, run.currency)}`
            : undefined
        }
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSheet(null)} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void submit()} disabled={busy}>
              {busy ? "Saving" : sheet?.mode === "hold" ? "Hold payment" : "Record the payment"}
            </Button>
          </div>
        }
      >
        {sheet?.mode === "hold" ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-slate-600">
              Holding takes this person out of the run. Their money goes back to
              waiting and joins next month&apos;s list.
            </p>
            <Field label="Why" hint="Kept on the row, so the next person to look knows.">
              <input
                className={inputClass}
                value={note}
                placeholder="Bank account name does not match"
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-slate-600">
              Send the transfer from the bank first, then record it here. The
              marketer sees the reference and the receipt on their own screen.
            </p>
            {sheet?.item.bank && (
              <p className="rounded-xl bg-mist-50 px-3 py-2 text-[13px] text-plum-950">
                <span className="c-num font-semibold">{sheet.item.bank.accountNumber}</span>
                <span className="block text-[12px] text-slate-600">
                  {sheet.item.bank.bankName}
                  {sheet.item.bank.accountName ? ` · ${sheet.item.bank.accountName}` : ""}
                </span>
              </p>
            )}
            <Field label="Bank reference" hint="Whatever the transfer receipt calls it.">
              <input
                className={inputClass}
                value={reference}
                placeholder="FT26091234567"
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
            {/* `as="group"`, not a label: ImagePicker owns a hidden file input,
                and a bare label forwards a tap on its own whitespace to it. */}
            <Field label="Receipt" hint="Optional. A screenshot of the transfer." as="group">
              <ImagePicker value={proof} onChange={setProof} max={1} coverLabel="Receipt" />
            </Field>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

/** The account number, on the clipboard, because the next stop is a bank app. */
function CopyButton({ value, name }: { value: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? "Copied" : `Copy ${name}'s account number`}
      icon={copied ? Check : Copy}
      size="dense"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    />
  );
}
