"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell, HeroIconButton, useReportBlock } from "@/components/marketer/AppShell";
import { Sheet } from "@/components/marketer/Sheet";
import { DealListRow, DealListRowSkeleton } from "@/components/marketer/deals/DealListRow";
import { IconCheckBadge, IconReport, IconTeam } from "@/components/marketer/icons3d";
import {
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNote,
  Note,
  PrimaryButton,
  RowGroup,
  Segmented,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import type { DealRowData, DealsResponse } from "@/lib/marketer/api";

type Scope = "mine" | "team";

const SCOPES = [
  { value: "mine" as const, label: "Mine" },
  { value: "team" as const, label: "My team" },
];

export default function DealsPage() {
  const [scope, setScope] = useState<Scope>("mine");
  const deals = useAsync(
    (signal) => api.get<DealsResponse>(`/marketing/deals?scope=${scope}`, signal),
    [scope],
    // Blanking a long list to skeletons on a tab tap would throw the reader back to the top.
    { keepPrevious: true },
  );

  const items = shown(scope, deals.data);

  return (
    <AppShell
      title="Your deals"
      hint="Tap a deal to see the proof and your money."
      back="/m"
      action={<ReportAction />}
      tab={
        <>
          Recent deals
          {items.length > 0 && (
            <Chip tone="neutral" className="m-num">
              {items.length}
            </Chip>
          )}
        </>
      }
    >
      <div className="px-4">
        <Segmented value={scope} options={SCOPES} onChange={setScope} label="Which deals" />

        <div className="mt-4">
          <DealsList scope={scope} deals={deals} items={items} />
        </div>

        <Suspense fallback={null}>
          <SentSheet />
        </Suspense>
      </div>
    </AppShell>
  );
}

/** Rendered by the shell inside its provider, so it can read whether reporting is open. */
function ReportAction() {
  if (useReportBlock()) return null;
  return (
    <HeroIconButton href="/m/deals/new" label="Report a deal">
      <Plus className="h-5 w-5" strokeWidth={2.2} aria-hidden />
    </HeroIconButton>
  );
}

/**
 * The team scope answers with every deal that pays this marketer, their own
 * included. "My team" means somebody else closed it, which is a level 2 or 3
 * share: a deal nobody approved yet has no shares, so it can only be their own.
 */
function shown(scope: Scope, data: DealsResponse | null): DealRowData[] {
  const items = data?.items ?? [];
  if (scope === "mine") return items;
  return items.filter((deal) => deal.myShare !== null && deal.myShare.level > 1);
}

function DealsList({
  scope,
  deals,
  items,
}: {
  scope: Scope;
  deals: ReturnType<typeof useAsync<DealsResponse>>;
  items: DealRowData[];
}) {
  const block = useReportBlock();

  if (deals.error) return <ErrorNote error={deals.error} onRetry={deals.reload} />;

  if (items.length === 0 && deals.loading) {
    return (
      <RowGroup>
        <DealListRowSkeleton />
        <DealListRowSkeleton />
        <DealListRowSkeleton />
      </RowGroup>
    );
  }

  if (items.length === 0 && scope === "mine") {
    return (
      <EmptyState
        art={<IconReport size={92} />}
        title="No deals yet"
        hint={
          block ??
          "Helped somebody buy or rent a home? Tell us here and send the proof. Once AV Homes approves it, the money is yours."
        }
        action={
          block ? undefined : (
            <ButtonLink href="/m/deals/new" size="lg">
              <Plus className="h-5 w-5" aria-hidden />
              Report a deal
            </ButtonLink>
          )
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        art={<IconTeam size={92} />}
        title="Nothing from your team yet"
        hint="When somebody you invited closes a deal, it shows up here with your share of it."
        action={
          <ButtonLink href="/m/team" size="lg" variant="secondary">
            See your team
          </ButtonLink>
        }
      />
    );
  }

  return (
    // The rows of the scope just left stay put, dimmed, until the new ones land.
    <ul
      aria-busy={deals.loading || undefined}
      className={`m-card divide-y divide-m-line overflow-hidden transition-opacity duration-150 ${
        deals.loading ? "opacity-60" : ""
      }`}
    >
      {items.map((deal) => (
        <li key={deal.id}>
          <DealListRow deal={deal} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The confirmation for a deal just sent, read off the URL.
 *
 * A query rather than router state because the form REPLACES itself with this
 * screen: back after sending must land on the deals, not inside the sent form.
 * Suspense sits around it because `useSearchParams` suspends during prerender.
 */
function SentSheet() {
  const params = useSearchParams();
  const router = useRouter();
  const flag = params.get("new");
  const [open, setOpen] = useState(flag !== null);

  const close = () => {
    setOpen(false);
    router.replace("/m/deals");
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="We got your deal"
      hint="AV Homes checks the proof you sent. It usually takes a day or two."
    >
      <div className="space-y-4">
        <div className="m-card flex items-center gap-3 px-4 py-3.5">
          <span aria-hidden className="shrink-0">
            <IconCheckBadge size={48} />
          </span>
          <p className="text-[14px] leading-relaxed text-m-muted">
            It shows as <span className="font-semibold text-m-text">Being checked</span> in your
            deals. Once it is approved, the money moves to Waiting for pay day.
          </p>
        </div>
        {flag === "claimed" && (
          <Note tone="warn">
            Somebody else reported this same home. That is allowed. AV Homes will look at both and
            decide who reported it first.
          </Note>
        )}
        <PrimaryButton onClick={close}>Got it</PrimaryButton>
      </div>
    </Sheet>
  );
}
