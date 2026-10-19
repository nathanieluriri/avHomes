"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  DEAL_STATUS_LABEL,
  LEAD_STATE_LABEL,
  PLAN_STATE_LABEL,
  formatMoney,
  planStanding,
  type Deal,
  type Lead,
} from "@avhomes/contracts";
import { AppShell, useMarketer } from "@/components/marketer/AppShell";
import { ButtonLink, EmptyState, ErrorNote, Note, PrimaryButton, SectionLabel, Skeleton } from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";

interface Purchases {
  interests: Lead[];
  deals: Deal[];
}

function onPopState(change: () => void) {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
}

function useWanted(): { id: string; title: string } | null {
  const raw = useSyncExternalStore(
    onPopState,
    () => window.location.search,
    () => "",
  );
  const params = new URLSearchParams(raw);
  const id = params.get("listing");
  return id ? { id, title: params.get("title") ?? "" } : null;
}

export default function PurchasesPage() {
  return (
    <AppShell title="My purchases" hint="Property you are buying from AV Homes yourself." back="/m" tab="Your purchases">
      <Purchases />
    </AppShell>
  );
}

function Purchases() {
  const { me } = useMarketer();
  const wanted = useWanted();
  const read = useAsync((signal) => api.get<Purchases>("/marketing/purchases", signal), []);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<ApiError | null>(null);

  const already = wanted && read.data?.interests.some((lead) => lead.listingId === wanted.id);

  async function register() {
    if (!wanted || !me) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/marketing/leads", {
        self: true,
        buyerName: me.marketer.displayName,
        buyerPhone: me.marketer.phone,
        buyerEmail: me.marketer.email,
        listingId: wanted.id,
        listingTitle: wanted.title.slice(0, 300),
        brief: "I want to buy this myself.",
      });
      read.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  const data = read.data;
  const empty = data && data.interests.length === 0 && data.deals.length === 0;

  return (
      <div className="space-y-6 px-4 pb-24">
        {wanted && !already && (
          <div className="m-card space-y-3 p-4">
            <p className="text-[16px] font-bold text-m-text">Buy {wanted.title || "this property"} yourself</p>
            <p className="text-[13px] text-m-muted">
              Tell AV Homes you want it. Once you have paid, outright or a deposit on a payment plan, send the proof from here.
            </p>
            {error && <ErrorNote error={error} onRetry={() => void register()} />}
            <PrimaryButton busy={busy} onClick={() => void register()}>
              {busy ? "Sending" : "I want to buy this myself"}
            </PrimaryButton>
          </div>
        )}

        {read.error && <ErrorNote error={read.error} onRetry={read.reload} />}
        {!data && !read.error && <Skeleton className="h-32 w-full" />}
        {empty && !wanted && (
          <EmptyState
            title="Nothing yet"
            hint="Find a home under Listings and tap Buy it myself."
            action={
              <ButtonLink href="/m/listings" variant="secondary" size="lg">
                See listings
              </ButtonLink>
            }
          />
        )}

        {data && data.interests.length > 0 && (
          <section>
            <SectionLabel>Interest you registered</SectionLabel>
            <ul className="space-y-2">
              {data.interests.map((lead) => (
                <li key={lead.id} className="m-card space-y-2 p-4">
                  <p className="text-[15px] font-semibold text-m-text">{lead.listingTitle || "A property"}</p>
                  <p className="text-[13px] text-m-muted">{LEAD_STATE_LABEL[lead.state]}</p>
                  {lead.listingId && !data.deals.some((d) => d.leadId === lead.id || d.listingId === lead.listingId) && (
                    <ButtonLink
                      href={`/m/deals/new?listing=${encodeURIComponent(lead.listingId)}&self=1&lead=${encodeURIComponent(lead.id)}`}
                      variant="secondary"
                      full
                    >
                      I have paid: send the proof
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && data.deals.length > 0 && (
          <section>
            <SectionLabel>Buying or bought</SectionLabel>
            <ul className="space-y-2">
              {data.deals.map((deal) => {
                const owned = deal.status === "approved" && deal.paidMinor >= deal.amountMinor;
                const standing = deal.plan ? planStanding(deal.amountMinor, deal.plan, deal.payments, now) : null;
                return (
                  <li key={deal.id}>
                    <Link href={`/m/deals/${deal.id}`} className="m-card m-press m-press-light block p-4">
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block text-[15px] font-semibold text-m-text">{deal.listingTitle}</span>
                          <span className="block text-[13px] text-m-muted">
                            {formatMoney(deal.paidMinor, deal.currency)} paid of {formatMoney(deal.amountMinor, deal.currency)} ·{" "}
                            {deal.status === "approved" && standing ? PLAN_STATE_LABEL[standing.state] : DEAL_STATUS_LABEL[deal.status]}
                          </span>
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-m-faint" aria-hidden />
                      </span>
                      {owned && (
                        <div className="mt-2">
                          <Note tone="good">Congratulations, you are now the proud owner of {deal.listingTitle}.</Note>
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
  );
}
