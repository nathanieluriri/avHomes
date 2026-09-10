"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { ALERT_SEVERITIES, type AlertSeverity, type SiteAlert } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { AlertRow } from "@/components/admin/Alerts";
import { EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/admin/ui";

/**
 * Everything the site is currently getting wrong, in one list.
 *
 * The dashboard shows two of these and links here for the rest, so this page is
 * the one that has to be complete rather than the one that has to be short. It
 * groups by severity because the reader's real question is not "how many" but
 * "what do I have to do before this site is worth sending anyone to".
 *
 * Nothing here is dismissible. Every row names a screen that clears it.
 */

interface HealthResponse {
  alerts: SiteAlert[];
}

const HEADINGS: Record<AlertSeverity, { title: string; blurb: string }> = {
  blocker: {
    title: "Stopping the site working",
    blurb: "A visitor hits these today. Until they are cleared, nothing else on this page matters.",
  },
  warning: {
    title: "Making the site look unfinished",
    blurb: "The site works, but a visitor can tell something is missing.",
  },
  advisory: {
    title: "Worth doing next",
    blurb: "Nothing is broken. These are what turn a working site into one people trust.",
  },
};

export default function AlertsPage() {
  const { data, error, loading, reload } = useAsync<HealthResponse>(
    (signal) => api.get<HealthResponse>("/admin/health", signal),
    [],
  );

  const alerts = data?.alerts ?? [];
  const blockers = alerts.filter((a) => a.severity === "blocker").length;

  return (
    <>
      <PageHeader
        title="Alerts"
        icon={TriangleAlert}
        subtitle={
          data
            ? alerts.length === 0
              ? "Nothing needs you. Every check the console runs is currently clear."
              : blockers > 0
                ? `${alerts.length} open, ${blockers} of them stopping the site working.`
                : `${alerts.length} open. None of them are stopping the site working.`
            : "What the public site is getting wrong."
        }
      />

      {error && <ErrorNote error={error} onRetry={reload} />}

      {loading && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      )}

      {data && alerts.length === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title="Everything is clear"
          hint="No missing contact details, no empty sections, and nothing waiting on you. This page fills itself back in the moment something slips."
        />
      )}

      {data && alerts.length > 0 && (
        <div className="flex flex-col gap-8">
          {ALERT_SEVERITIES.map((severity) => {
            const group = alerts.filter((a) => a.severity === severity);
            if (group.length === 0) return null;
            return (
              <section key={severity} aria-labelledby={`alerts-${severity}`}>
                <h2
                  id={`alerts-${severity}`}
                  className="text-[15px] font-semibold text-plum-950"
                >
                  {HEADINGS[severity].title}
                </h2>
                <p className="mt-1 max-w-prose text-[13px] text-slate-600">
                  {HEADINGS[severity].blurb}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {group.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
