"use client";

import { useState } from "react";
import { Copy, MessagesSquare, Send } from "lucide-react";
import { isWhatsappGroupUrl, type WhatsappClickRow, type WhatsappPartnerRow, type WhatsappReport } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { relative, shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import { StatTile } from "@/components/admin/StatTile";
import { Badge, Button, Card, CardHead, ConfirmButton, ErrorNote, Field, PageHeader, inputClass } from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";

/**
 * The partners' WhatsApp group.
 *
 * Partners never see the group's invite link. Each gets their own /wa/<code>
 * link, which counts the open and redirects, so this page can say who joined,
 * whose link was forwarded and how far.
 */
export default function WhatsappGroupPage() {
  const { data, loading, error, reload } = useAsync(
    (signal) => api.get<WhatsappReport>("/admin/marketing/whatsapp", signal),
    [],
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState<WhatsappReport | null>(null);

  const shown = report ?? data;
  const url = draft ?? shown?.url ?? "";
  const valid = url.trim() === "" || isWhatsappGroupUrl(url);
  const live = shown ? isWhatsappGroupUrl(shown.url) : false;

  async function save() {
    setBusy(true);
    setActionError(null);
    setNotice("");
    try {
      const next = await api.put<WhatsappReport>("/admin/marketing/whatsapp", { url: url.trim() });
      setReport(next);
      setDraft(null);
      const sent = next.justInvited ?? 0;
      setNotice(
        !url.trim()
          ? "Removed. Partner links now go to the Partner With Us page."
          : sent > 0
            ? `Saved. Sent the invite to ${sent} partner${sent === 1 ? "" : "s"} who had not had it yet.`
            : "Saved. Every partner has already been sent the invite, so nobody was sent it again.",
      );
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    setActionError(null);
    setNotice("");
    try {
      const res = await api.post<{ partners: number; emailed: number }>("/admin/marketing/whatsapp/remind", {});
      setNotice(
        res.partners === 0
          ? "Every partner has already opened the group."
          : `Sent a push to ${res.partners} partner${res.partners === 1 ? "" : "s"} who have not joined, and emailed ${res.emailed}.`,
      );
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const t = shown?.totals;
  const sample = typeof window === "undefined" ? "/wa/AV-0001" : `${window.location.origin}/wa/AV-0001`;

  const partnerColumns: Column<WhatsappPartnerRow>[] = [
    {
      key: "partner",
      header: "Partner",
      primary: true,
      render: (row) => <IdCell title={row.name} meta={row.code} />,
    },
    {
      key: "invited",
      header: "Invited",
      mobile: "tablet",
      render: (row) => <span className="text-slate-600">{row.invitedAt ? shortDate(row.invitedAt) : "Not yet"}</span>,
    },
    {
      key: "joined",
      header: "Opened the group",
      mobile: "keep",
      badge: true,
      render: (row) =>
        row.joinedAt ? <Badge tone="green">{shortDate(row.joinedAt)}</Badge> : <Badge tone="neutral">Not yet</Badge>,
    },
    {
      key: "forwards",
      header: "Forwarded opens",
      tight: true,
      mobile: "keep",
      render: (row) => <span className="c-num font-semibold text-plum-950">{row.forwardClicks}</span>,
    },
    {
      key: "people",
      header: "People reached",
      tight: true,
      mobile: "tablet",
      render: (row) => <span className="c-num text-slate-600">{row.forwardPeople}</span>,
    },
    {
      key: "last",
      header: "Last open",
      mobile: "tablet",
      render: (row) => <span className="text-slate-600">{row.lastClickAt ? relative(row.lastClickAt) : "Never"}</span>,
    },
  ];

  const recentColumns: Column<WhatsappClickRow>[] = [
    {
      key: "who",
      header: "Link",
      primary: true,
      render: (row) => (
        <IdCell
          title={`${row.ownerName}'s link`}
          meta={row.kind === "self" ? "Opened by the partner" : row.openedByName ? `Opened by ${row.openedByName}` : "Forwarded, opened by someone else"}
        />
      ),
    },
    {
      key: "kind",
      header: "Kind",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (row) => <Badge tone={row.kind === "self" ? "green" : "wine"}>{row.kind === "self" ? "Joined" : "Forward"}</Badge>,
    },
    {
      key: "at",
      header: "When",
      mobile: "keep",
      render: (row) => <span className="text-slate-600">{relative(row.at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        icon={MessagesSquare}
        title="WhatsApp group"
        subtitle="Partners each get their own short link to the group. Every open is counted, so you can see who joined and whose link travelled."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHead title="The group" />
          <div className="space-y-3">
            <Field
              label="Group invite link"
              hint="From WhatsApp: Group info, Invite via link, Copy link. Partners never see this, only their own short link."
            >
              <input
                className={inputClass}
                inputMode="url"
                placeholder="https://chat.whatsapp.com/..."
                value={url}
                onChange={(event) => setDraft(event.target.value)}
                aria-invalid={!valid || undefined}
              />
            </Field>
            {!valid && (
              <p className="text-[13px] text-red-700">That is not a group invite link. It starts https://chat.whatsapp.com/</p>
            )}
            {actionError && <ErrorNote error={actionError} />}
            {notice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">{notice}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void save()} disabled={busy || !valid || draft === null}>
                {busy ? "Saving" : "Save link"}
              </Button>
              {live && (
                <ConfirmButton
                  confirmLabel="Yes, send it"
                  onConfirm={() => void remind()}
                  disabled={busy || (t ? t.partnersJoined >= t.partners : true)}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Remind partners who have not joined
                </ConfirmButton>
              )}
            </div>
            <p className="text-[12px] leading-relaxed text-slate-600">
              Saving the link sends the invite, by email and push, to every partner who has not had it yet. Partners who join
              later get it with their welcome. Nobody is sent it twice, and changing the link later sends nothing new: their
              short links simply open the new group. Until they open it, partners also see a pinned card on their app home screen. Each partner&apos;s link looks like{" "}
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-wine-700"
                onClick={() => void navigator.clipboard?.writeText(sample)}
              >
                {sample}
                <Copy className="h-3 w-3" aria-hidden="true" />
              </button>
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile label="Partners invited" value={t ? `${t.partnersInvited} of ${t.partners}` : "…"} scope="Sent the invite by email or push" />
          <StatTile label="Partners joined" value={t ? `${t.partnersJoined} of ${t.partners}` : "…"} scope="Opened their own link" />
          <StatTile label="Total opens" value={t ? String(t.clicks) : "…"} scope="Every partner link, all time" />
          <StatTile label="Forwarded opens" value={t ? String(t.forwardClicks) : "…"} scope="Opened by someone other than the link's partner" />
          <StatTile label="People reached" value={t ? String(t.people) : "…"} scope="Distinct browsers that opened a link" />
        </div>

        <Card padded={false}>
          <div className="px-4 pt-4 sm:px-5">
            <CardHead title="By partner" />
          </div>
          <DataTable
            caption="WhatsApp group by partner"
            columns={partnerColumns}
            rows={shown?.partners ?? []}
            rowKey={(row) => row.marketerId}
            loading={loading}
          />
        </Card>

        <Card padded={false}>
          <div className="px-4 pt-4 sm:px-5">
            <CardHead title="Recent opens" />
          </div>
          <DataTable
            caption="Recent opens"
            columns={recentColumns}
            rows={shown?.recent ?? []}
            rowKey={(row) => row.id}
            loading={loading}
          />
        </Card>
      </div>
    </>
  );
}
