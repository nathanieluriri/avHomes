"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import {
  PARTNER_LIMIT_KEYS,
  PARTNER_LIMIT_LABEL,
  PARTNER_STATUS_LABEL,
  type PartnerRow,
  type PartnerSettings,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { Badge, ButtonLink, Card, EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/admin/ui";

interface Response {
  items: PartnerRow[];
  settings: PartnerSettings;
}

/** Every partner company, and what each is using of its limits. */
export default function PartnersPage() {
  const state = useAsync((signal) => api.get<Response>("/admin/partners", signal), []);
  const rows = state.data?.items ?? [];

  return (
    <>
      <PageHeader
        icon={Building2}
        title="Partners"
        subtitle="Companies listing their own property with AV Homes."
      />
      {state.error && (
        <div className="mb-4">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}
      {state.loading && rows.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No partners yet"
          hint="Approving an application makes the first one."
          action={<ButtonLink href="/admin/partners/applications">Applications</ButtonLink>}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link key={row.partner.id} href={`/admin/partners/${row.partner.id}`} className="block">
              <Card>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="min-w-0 text-[14px] font-semibold text-plum-950">{row.partner.name}</h2>
                  <Badge tone={row.partner.status === "active" ? "green" : "red"}>
                    {PARTNER_STATUS_LABEL[row.partner.status]}
                  </Badge>
                  <span className="ml-auto text-[12px] text-slate-600">
                    {row.accounts} {row.accounts === 1 ? "account" : "accounts"}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-slate-600">
                  {PARTNER_LIMIT_KEYS.map(
                    (key) => `${PARTNER_LIMIT_LABEL[key]}: ${row.usage[key]} of ${row.limits[key]}`,
                  ).join(" · ")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
