"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { isLeadOpen, type LeadRow } from "@avhomes/contracts";
import { AppShell, HeroIconButton, useReportBlock } from "@/components/marketer/AppShell";
import { LeadRowLink, LeadRowSkeleton } from "@/components/marketer/buyers/LeadBits";
import { IconHandshake, IconTeam } from "@/components/marketer/icons3d";
import {
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNote,
  Note,
  RowGroup,
  Segmented,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import type { LeadsResponse } from "@/lib/marketer/api";

/**
 * People this marketer handed to AV Homes.
 *
 * Deals are what they closed themselves. This is what they passed on, which is
 * a different promise: somebody else does the work and they still get paid.
 * Separate screens because the two lists answer different questions and mixing
 * them would make "where is my money" harder rather than easier.
 */

type Scope = "open" | "bought" | "closed";

const SCOPES = [
  { value: "open" as const, label: "Open" },
  { value: "bought" as const, label: "Bought" },
  { value: "closed" as const, label: "Closed" },
];

export default function BuyersPage() {
  const [scope, setScope] = useState<Scope>("open");
  const leads = useAsync((signal) => api.get<LeadsResponse>("/marketing/leads", signal), []);

  const all = leads.data?.items ?? [];
  const items = all.filter((lead) => bucket(lead) === scope);

  return (
    <AppShell
      title="Your buyers"
      hint="People you sent us. Tap one to see where it has got to."
      back="/m"
      action={<LogAction />}
      tab={
        <>
          Potential buyers
          {items.length > 0 && (
            <Chip tone="neutral" className="m-num">
              {items.length}
            </Chip>
          )}
        </>
      }
    >
      <div className="px-4">
        <Segmented value={scope} options={SCOPES} onChange={setScope} label="Which buyers" />

        <div className="mt-4">
          {leads.error ? (
            <ErrorNote error={leads.error} onRetry={leads.reload} />
          ) : all.length === 0 && leads.loading ? (
            <RowGroup>
              <LeadRowSkeleton />
              <LeadRowSkeleton />
              <LeadRowSkeleton />
            </RowGroup>
          ) : items.length === 0 ? (
            <Empty scope={scope} any={all.length > 0} />
          ) : (
            <RowGroup>
              {items.map((lead) => (
                <LeadRowLink key={lead.id} lead={lead} />
              ))}
            </RowGroup>
          )}
        </div>

        {scope === "open" && items.length > 0 && (
          <Note tone="info">
            AV Homes calls every buyer you send. You will see each step here, with the reason for it.
          </Note>
        )}
      </div>
    </AppShell>
  );
}

function bucket(lead: LeadRow): Scope {
  if (lead.state === "won") return "bought";
  return isLeadOpen(lead.state) ? "open" : "closed";
}

/** Hidden for a paused or closed account, the same rule the report orb follows. */
function LogAction() {
  if (useReportBlock()) return null;
  return (
    <HeroIconButton href="/m/buyers/new" label="Log a buyer">
      <Plus className="h-5 w-5" strokeWidth={2.2} aria-hidden />
    </HeroIconButton>
  );
}

function Empty({ scope, any }: { scope: Scope; any: boolean }) {
  const block = useReportBlock();

  if (scope === "bought") {
    return (
      <EmptyState
        art={<IconHandshake size={112} />}
        title="Nobody has bought yet"
        hint="When one of your buyers closes, it lands here with what you earned on it."
      />
    );
  }
  if (scope === "closed") {
    return (
      <EmptyState
        art={<IconTeam size={112} />}
        title="Nothing closed"
        hint="Buyers that did not work out end up here, with the reason they stopped."
      />
    );
  }
  return (
    <EmptyState
      art={<IconHandshake size={124} />}
      title={any ? "No open buyers" : "Know somebody who wants to buy?"}
      hint={
        block ??
        "Send them to us. We call them, set up the viewing and close it, and you are paid the same commission as a deal you closed yourself."
      }
      action={
        block ? undefined : (
          <ButtonLink href="/m/buyers/new" variant="primary">
            Log a buyer
          </ButtonLink>
        )
      }
    />
  );
}
