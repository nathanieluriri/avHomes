"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ExternalLink, Link2Off, Send } from "lucide-react";
import {
  WHATSAPP_CHANGE_REASON_LABELS,
  isWhatsappGroupUrl,
  type WhatsappReport,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import { WhatsappHeader } from "@/components/admin/whatsapp/WhatsappTabs";
import { Badge, ButtonLink, Card, CardHead, ConfirmButton, ErrorNote, Skeleton } from "@/components/admin/ui";
import { ActivityLine } from "@/components/admin/whatsapp/ActivityLine";

/**
 * The one question this page answers: is the group working, and who still needs a nudge.
 * Setting the link, the full partner list and the activity log each have their own tab.
 */
export default function WhatsappOverviewPage() {
  const { data, error, reload } = useAsync(
    (signal) => api.get<WhatsappReport>("/admin/marketing/whatsapp", signal),
    [],
  );

  return (
    <>
      <WhatsappHeader subtitle="Where partners hear about new listings, site visits and pay day first." />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Skeleton className="h-64" />}
      {data && (isWhatsappGroupUrl(data.url) ? <Live report={data} onChanged={reload} /> : <NotSet report={data} />)}
    </>
  );
}

function NotSet({ report }: { report: WhatsappReport }) {
  return (
    <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mist-100 text-slate-600">
        <Link2Off className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-plum-950">There is no group yet</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          Add the group&apos;s invite link and all {report.totals.partners} active partner
          {report.totals.partners === 1 ? "" : "s"} are sent their own link to it straight away. Until then, partner links open
          the Partner With Us page.
        </p>
      </div>
      <ButtonLink href="/admin/marketers/whatsapp/link">Add the group link</ButtonLink>
    </Card>
  );
}

function Live({ report, onChanged }: { report: WhatsappReport; onChanged: () => void }) {
  const t = report.totals;
  const waiting = t.partnersInvited - t.partnersJoined;
  const last = report.lastChange;
  const forwarders = report.partners.filter((p) => p.forwardClicks > 0).slice(0, 3);
  const reached = report.partners.reduce((sum, p) => sum + p.forwardPeople, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="green">Live</Badge>
              <span className="text-[13px] text-slate-600">Partners&apos; links open this group</span>
            </div>
            <p className="mt-2 truncate font-mono text-[13px] text-plum-950">{report.url}</p>
            <p className="mt-1 text-[12px] text-slate-600">
              {last
                ? `Changed ${shortDate(last.at)} by ${last.byName}. ${WHATSAPP_CHANGE_REASON_LABELS[last.reason]}.`
                : "Set before changes were recorded."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={report.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-wine-700 hover:bg-wine-50"
            >
              Open group <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <ButtonLink href="/admin/marketers/whatsapp/link" variant="ghost">
              Change link
            </ButtonLink>
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHead title="How far the invite has got" />
        <Funnel partners={t.partners} invited={t.partnersInvited} joined={t.partnersJoined} />
        {waiting > 0 ? (
          <Nudge waiting={waiting} onDone={onChanged} />
        ) : t.partners > 0 && t.partnersJoined === t.partners ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900">
            Every partner has opened the group.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHead title="How far it has travelled" />
        <p className="text-[13px] leading-relaxed text-slate-600">
          Partners&apos; links were forwarded and opened{" "}
          <span className="font-semibold text-plum-950">{t.forwardClicks}</span> time{t.forwardClicks === 1 ? "" : "s"}, by{" "}
          <span className="font-semibold text-plum-950">{reached}</span> {reached === 1 ? "person" : "other people"}.
        </p>
        {forwarders.length > 0 ? (
          <ol className="mt-3 divide-y divide-mist-100">
            {forwarders.map((p, i) => (
              <li key={p.marketerId} className="flex items-center gap-3 py-2">
                <span className="w-4 text-[12px] font-semibold text-slate-500">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-plum-950">{p.name}</span>
                <span className="text-[12px] text-slate-600">
                  {p.forwardClicks} open{p.forwardClicks === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">Nobody has forwarded their link yet.</p>
        )}
        <Link href="/admin/marketers/whatsapp/partners" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-wine-700">
          Every partner <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Card>

      <Card className="lg:col-span-3">
        <CardHead
          title="Latest activity"
          action={
            <Link href="/admin/marketers/whatsapp/activity" className="inline-flex items-center gap-1 text-[13px] font-semibold text-wine-700">
              All activity <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        />
        {report.recent.length === 0 ? (
          <p className="text-[13px] text-slate-500">Nobody has opened a partner link yet.</p>
        ) : (
          <ul className="divide-y divide-mist-100">
            {report.recent.slice(0, 5).map((row) => (
              <ActivityLine key={row.id} row={row} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Funnel({ partners, invited, joined }: { partners: number; invited: number; joined: number }) {
  const steps = [
    { label: "Partners", value: partners, hint: "Everyone who can be invited" },
    { label: "Invited", value: invited, hint: "Sent their link by email or push" },
    { label: "Joined", value: joined, hint: "Opened the group from their link" },
  ];
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3">
      {steps.map((step) => {
        const share = partners > 0 ? Math.round((step.value / partners) * 100) : 0;
        return (
          <li key={step.label} className="min-w-0 rounded-xl bg-mist-50 p-2.5 sm:p-3">
            <p className="truncate text-[12px] font-semibold text-slate-600">{step.label}</p>
            <p className="c-num mt-1 text-[22px] font-semibold text-plum-950">
              {step.value}
              {step.label !== "Partners" && partners > 0 && (
                <span className="ml-1 block text-[12px] font-medium text-slate-500 sm:ml-1.5 sm:inline sm:text-[13px]">{share}%</span>
              )}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist-200" aria-hidden="true">
              <div className="h-full rounded-full bg-wine-600" style={{ width: `${partners > 0 ? share : 0}%` }} />
            </div>
            <p className="mt-2 hidden text-[11.5px] text-slate-500 sm:block">{step.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Nudge({ waiting, onDone }: { waiting: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  async function remind() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ partners: number; emailed: number }>("/admin/marketing/whatsapp/remind", {});
      setDone(`Reminder sent to ${res.partners} partner${res.partners === 1 ? "" : "s"}.`);
      onDone();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-[13px] text-amber-900">
        <span className="font-semibold">{waiting} partner{waiting === 1 ? " has" : "s have"}</span> been invited but not opened the
        group yet.{" "}
        <Link href="/admin/marketers/whatsapp/partners?filter=waiting" className="font-semibold underline">
          See who
        </Link>
      </p>
      {done ? (
        <span className="text-[13px] font-semibold text-emerald-800">{done}</span>
      ) : (
        <ConfirmButton variant="primary" size="sm" confirmLabel={`Send to ${waiting}`} onConfirm={() => void remind()} disabled={busy}>
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "Sending" : "Send a reminder"}
        </ConfirmButton>
      )}
      {error && <ErrorNote error={error} />}
    </div>
  );
}
