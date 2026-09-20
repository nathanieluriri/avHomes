"use client";

import { useState } from "react";
import { UserRoundSearch } from "lucide-react";
import type { PartnerApplication } from "@avhomes/identity";
import { api, ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { fullDate, relative } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import {
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

interface Response {
  applications: PartnerApplication[];
  open: number;
}

/**
 * People asking to list property with AV Homes.
 *
 * Undecided first, because that is the only part of this screen anybody acts on.
 * Approving shows the sign-in link, the way the team screen does, so somebody can
 * hand it over by hand when mail is not configured.
 */
export default function PartnerApplicationsPage() {
  const state = useAsync((signal) => api.get<Response>("/admin/applications", signal), []);
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);

  const applications = state.data?.applications ?? [];
  const open = applications.filter((row) => row.status === "open");

  return (
    <>
      <PageHeader
        icon={UserRoundSearch}
        title="Partner applications"
        subtitle="People outside AV Homes asking to list their own property."
        badge={
          state.data && state.data.open > 0 ? (
            <Badge tone="amber">{state.data.open} waiting</Badge>
          ) : undefined
        }
      />

      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {state.loading && applications.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          title="Nobody has applied yet"
          hint="The form is at /list-with-us. Link it from the site when you are ready for applications."
        />
      ) : (
        <div className="space-y-2">
          {applications.map((row) => (
            <ApplicationCard
              key={row.id}
              row={row}
              showUrl={url?.id === row.id ? url.url : null}
              onDecided={(link) => {
                if (link) setUrl({ id: row.id, url: link });
                state.reload();
              }}
            />
          ))}
        </div>
      )}

      {open.length === 0 && applications.length > 0 && (
        <p className="mt-4 text-[12px] text-slate-600">
          Nothing waiting. The decided ones stay here as a record.
        </p>
      )}
    </>
  );
}

function ApplicationCard({
  row,
  showUrl,
  onDecided,
}: {
  row: PartnerApplication;
  showUrl: string | null;
  onDecided: (url: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "refuse" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refusing, setRefusing] = useState(false);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "refuse");
    setError(null);
    try {
      const res = await api.post<{ url: string | null }>(
        `/admin/applications/${row.id}/decide`,
        { approve, reason: reason.trim() },
      );
      onDecided(res.url);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const decided = row.status !== "open";

  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="min-w-0 text-[14px] font-semibold text-plum-950">{row.name}</h2>
        {row.company && <span className="text-[12px] text-slate-600">{row.company}</span>}
        <Badge
          tone={row.status === "open" ? "amber" : row.status === "approved" ? "green" : "neutral"}
        >
          {row.status === "open"
            ? "Waiting"
            : row.status === "approved"
              ? "Approved"
              : "Not approved"}
        </Badge>
        <span className="ml-auto shrink-0 text-[11px] text-slate-550" title={fullDate(row.createdAt)}>
          {relative(row.createdAt)}
        </span>
      </div>

      <dl className="mt-2 space-y-1 text-[13px]">
        <div className="flex gap-2">
          <dt className="text-slate-600">Email</dt>
          <dd className="min-w-0 break-words text-plum-950">{row.email}</dd>
        </div>
        {row.phone && (
          <div className="flex gap-2">
            <dt className="text-slate-600">Phone</dt>
            <dd className="text-plum-950">{row.phone}</dd>
          </div>
        )}
        {row.portfolio && (
          <div className="flex gap-2">
            <dt className="text-slate-600">Has</dt>
            <dd className="text-plum-950">{row.portfolio}</dd>
          </div>
        )}
      </dl>

      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
        {row.about}
      </p>

      {error && (
        <div className="mt-2">
          <ErrorNote error={error} />
        </div>
      )}

      {/*
        The link, once. It appears after an approval and is not stored: the mail
        carries it too, and this is the copy for the day mail is not configured.
      */}
      {showUrl && (
        <div className="mt-3 rounded-xl bg-wine-50 p-3">
          <CardHead title="Their sign-in link" />
          <p className="c-num break-all text-[12px] text-wine-700">{showUrl}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-wine-700/80">
            They must use {row.email}. The link carries no credential, so forwarding
            it hands over nothing.
          </p>
        </div>
      )}

      {decided ? (
        <p className="mt-3 text-[12px] text-slate-550">
          {row.status === "approved" ? "Approved" : "Refused"} by {row.decidedByName}
          {row.decidedAt ? ` · ${relative(row.decidedAt)}` : ""}
          {row.reason ? ` · ${row.reason}` : ""}
        </p>
      ) : refusing ? (
        <div className="mt-3 space-y-2">
          <Field
            label="Why not"
            hint="They are told this. A no with no reason is a no somebody chases by phone."
          >
            <input
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="We are not taking on shortlets at the moment."
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setRefusing(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              onClick={() => void decide(false)}
              disabled={busy !== null}
            >
              {busy === "refuse" ? "Sending..." : "Send the refusal"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void decide(true)} disabled={busy !== null}>
            {busy === "approve" ? "Approving..." : "Approve and invite"}
          </Button>
          <Button variant="ghost" onClick={() => setRefusing(true)} disabled={busy !== null}>
            Not this time
          </Button>
        </div>
      )}
    </Card>
  );
}
