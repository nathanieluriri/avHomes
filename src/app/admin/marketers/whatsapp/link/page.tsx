"use client";

import { useState } from "react";
import { ArrowRight, Copy, ExternalLink, History, Link2 } from "lucide-react";
import {
  WHATSAPP_CHANGE_REASONS,
  WHATSAPP_CHANGE_REASON_LABELS,
  WHATSAPP_NOTE_MAX,
  isWhatsappGroupUrl,
  type WhatsappChangeReason,
  type WhatsappLinkChange,
  type WhatsappReport,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import { WhatsappHeader, partnerLink } from "@/components/admin/whatsapp/WhatsappTabs";
import { Badge, Button, Card, CardHead, ConfirmButton, ErrorNote, Field, Skeleton, inputClass } from "@/components/admin/ui";

/** The reasons offered when replacing a live link. "first-link" and "removed" are picked for the admin. */
const CHANGE_REASONS = WHATSAPP_CHANGE_REASONS.filter((r) => r !== "first-link" && r !== "removed");

export default function WhatsappLinkPage() {
  const report = useAsync((signal) => api.get<WhatsappReport>("/admin/marketing/whatsapp", signal), []);
  const history = useAsync(
    (signal) => api.get<{ items: WhatsappLinkChange[] }>("/admin/marketing/whatsapp/history", signal),
    [],
  );
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  function saved(message: string) {
    setEditing(false);
    setNotice(message);
    report.reload();
    history.reload();
  }

  const live = report.data ? isWhatsappGroupUrl(report.data.url) : false;

  return (
    <>
      <WhatsappHeader subtitle="The group partners' short links open. Every change is kept below with who made it and why." />
      {report.error && <ErrorNote error={report.error} onRetry={report.reload} />}
      {!report.data && !report.error && <Skeleton className="h-48" />}

      {report.data && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {notice && (
              <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900">
                {notice}
              </p>
            )}

            {live && !editing ? (
              <CurrentLink report={report.data} onChange={() => setEditing(true)} onRemoved={saved} />
            ) : (
              <ChangeForm
                current={report.data.url}
                partners={report.data.totals.partners}
                uninvited={report.data.totals.partners - report.data.totals.partnersInvited}
                onCancel={live ? () => setEditing(false) : undefined}
                onSaved={saved}
              />
            )}
          </div>

          <Card>
            <CardHead title="History" icon={History} />
            {history.error && <ErrorNote error={history.error} onRetry={history.reload} />}
            {history.data && history.data.items.length === 0 && (
              <p className="text-[13px] text-slate-500">
                {live ? "The current link was set before changes were recorded." : "No changes yet."}
              </p>
            )}
            <ol className="relative space-y-4 border-l border-mist-200 pl-4">
              {history.data?.items.map((change, index) => (
                <HistoryEntry key={change.id} change={change} current={index === 0 && live} />
              ))}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}

function CurrentLink({
  report,
  onChange,
  onRemoved,
}: {
  report: WhatsappReport;
  onChange: () => void;
  onRemoved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.put("/admin/marketing/whatsapp", { url: "", reason: "removed", note: "" });
      onRemoved("The group is down. Partner links now open the Partner With Us page.");
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead title="Current link" icon={Link2} action={<Badge tone="green">Live</Badge>} />
      <p className="break-all rounded-xl bg-mist-50 px-3 py-2.5 font-mono text-[13px] text-plum-950">{report.url}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
        Partners never see this link. Each has their own, such as{" "}
        <span className="font-mono text-plum-950">{partnerLink("AV-0001")}</span>, which counts the open and then sends them
        here.
      </p>
      {error && (
        <div className="mt-3">
          <ErrorNote error={error} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={onChange}>Change link</Button>
        <a
          href={report.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-wine-700 hover:bg-wine-50"
        >
          Open group <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(report.url)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-mist-100"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
        </button>
        <span className="ml-auto">
          <ConfirmButton variant="ghost" confirmLabel="Yes, take it down" onConfirm={() => void remove()} disabled={busy}>
            Take the group down
          </ConfirmButton>
        </span>
      </div>
    </Card>
  );
}

function ChangeForm({
  current,
  partners,
  uninvited,
  onCancel,
  onSaved,
}: {
  current: string;
  partners: number;
  uninvited: number;
  onCancel?: () => void;
  onSaved: (message: string) => void;
}) {
  const first = !isWhatsappGroupUrl(current);
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState<WhatsappChangeReason>(first ? "first-link" : "link-reset");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const trimmed = url.trim();
  const badUrl = trimmed !== "" && !isWhatsappGroupUrl(trimmed);
  const same = trimmed === current;
  const needsNote = reason === "other" && note.trim().length < 3;
  const ready = isWhatsappGroupUrl(trimmed) && !same && !needsNote;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.put<WhatsappReport>("/admin/marketing/whatsapp", { url: trimmed, reason, note: note.trim() });
      const sent = res.justInvited ?? 0;
      onSaved(
        first
          ? `The group is live. ${sent} partner${sent === 1 ? " was" : "s were"} sent their link.`
          : `Link changed. Partners' links open the new group now${sent > 0 ? `, and ${sent} partner${sent === 1 ? " who had" : "s who had"} not been invited ${sent === 1 ? "was" : "were"} sent theirs` : ""}.`,
      );
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead title={first ? "Add the group link" : "Change the link"} icon={Link2} />
      <div className="space-y-4">
        <Field
          label={first ? "Group invite link" : "New invite link"}
          hint="In WhatsApp: open the group, tap its name, Invite via link, Copy link."
        >
          <input
            className={inputClass}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://chat.whatsapp.com/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={badUrl || same || undefined}
          />
        </Field>
        {badUrl && <p className="-mt-2 text-[13px] text-red-700">That is not a group invite link. It starts https://chat.whatsapp.com/</p>}
        {same && trimmed !== "" && <p className="-mt-2 text-[13px] text-red-700">That is already the group link.</p>}

        {!first && (
          <Field label="Why is it changing?" as="group">
            <div className="grid gap-2">
              {CHANGE_REASONS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition-colors ${
                    reason === value ? "border-wine-500 bg-wine-50/50 font-semibold text-plum-950" : "border-mist-200 text-slate-700 hover:bg-mist-50"
                  }`}
                >
                  <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                  {WHATSAPP_CHANGE_REASON_LABELS[value]}
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field label="Note" hint={reason === "other" ? "Required. A line for whoever reads the history later." : "Optional. Anything the next person should know."}>
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            maxLength={WHATSAPP_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={first ? "Main partners group, run by the sales team." : "The old link was posted on a public Facebook page."}
          />
        </Field>

        <div className="rounded-xl bg-mist-50 p-3 text-[13px] leading-relaxed text-slate-700">
          <p className="font-semibold text-plum-950">What happens when you save</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {first ? (
              <li>
                All {partners} active partner{partners === 1 ? " is" : "s are"} sent their own link to the group, by email and by push.
              </li>
            ) : (
              <>
                <li>Every partner&apos;s short link opens the new group straight away. Nothing is sent again to partners already invited.</li>
                {uninvited > 0 && (
                  <li>
                    {uninvited} partner{uninvited === 1 ? " who has" : "s who have"} not been invited yet {uninvited === 1 ? "is" : "are"} sent their link.
                  </li>
                )}
              </>
            )}
            <li>Partners who join later get their link with their welcome email.</li>
          </ul>
        </div>

        {error && <ErrorNote error={error} />}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={busy || !ready}>
            {busy ? "Saving" : first ? "Save and invite partners" : "Save new link"}
            {!busy && <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function HistoryEntry({ change, current }: { change: WhatsappLinkChange; current: boolean }) {
  const removed = change.url === "";
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${current ? "bg-emerald-500" : removed ? "bg-red-400" : "bg-mist-300"}`}
      />
      <p className="text-[13px] font-semibold text-plum-950">{WHATSAPP_CHANGE_REASON_LABELS[change.reason]}</p>
      <p className="text-[12px] text-slate-500">
        {dateTime(change.at)} by {change.byName}
        {current && " · current"}
      </p>
      {change.note && <p className="mt-1 text-[13px] leading-relaxed text-slate-700">&ldquo;{change.note}&rdquo;</p>}
      <dl className="mt-1.5 space-y-0.5 text-[12px] text-slate-600">
        {!removed && (
          <div className="flex gap-1.5">
            <dt className="shrink-0">To</dt>
            <dd className="min-w-0 truncate font-mono text-plum-950" title={change.url}>
              {change.url.replace("https://chat.whatsapp.com/", "…/")}
            </dd>
          </div>
        )}
        {change.previousUrl && (
          <div className="flex gap-1.5">
            <dt className="shrink-0">From</dt>
            <dd className="min-w-0 truncate font-mono" title={change.previousUrl}>
              {change.previousUrl.replace("https://chat.whatsapp.com/", "…/")}
            </dd>
          </div>
        )}
        {change.invited > 0 && (
          <div>
            Invited {change.invited} partner{change.invited === 1 ? "" : "s"}
          </div>
        )}
      </dl>
    </li>
  );
}
