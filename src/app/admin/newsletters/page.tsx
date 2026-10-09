"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Mail, Plus } from "lucide-react";
import type { MarketingSettings, Newsletter, NewsletterStatus, Page, Property } from "@avhomes/contracts";
import { NEWSLETTER_TEMPLATES, type NewsletterTemplate } from "@/lib/admin/newsletter-templates";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { MailNotConfiguredAlert } from "@/components/admin/MailStatus";
import { Badge, Button, EmptyState, ErrorNote, PageHeader, Skeleton, type Tone } from "@/components/admin/ui";

const TONE: Record<NewsletterStatus, Tone> = { draft: "amber", sending: "wine", sent: "green" };
const LABEL: Record<NewsletterStatus, string> = { draft: "Draft", sending: "Sending", sent: "Sent" };

export default function NewslettersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsync<{ items: Newsletter[] }>(
    (signal) => api.get<{ items: Newsletter[] }>("/admin/newsletters", signal),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const [choosing, setChoosing] = useState(false);

  /* The listings and pay day are read now, so a template opens with this week's homes in it. */
  async function create(template: NewsletterTemplate | null) {
    setBusy(true);
    setCreateError(null);
    try {
      let body = {};
      if (template) {
        const [listings, settings] = await Promise.all([
          api.get<Page<Property>>("/admin/properties?status=live&sort=newest&limit=4").catch(() => null),
          api.get<{ settings: MarketingSettings }>("/admin/marketing/settings").catch(() => null),
        ]);
        body = template.build({
          listings: listings?.items ?? [],
          origin: window.location.origin,
          payCutoffDay: settings?.settings.payCutoffDay ?? 25,
          now: new Date(),
        });
      }
      const res = await api.post<{ newsletter: Newsletter }>("/admin/newsletters", body);
      router.push(`/admin/newsletters/${res.newsletter.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Newsletters"
        icon={Mail}
        subtitle="Write once, send to everyone on the subscriber list."
        actions={
          <Button onClick={() => setChoosing(true)} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {busy ? "Creating" : "New newsletter"}
          </Button>
        }
      />
      <MailNotConfiguredAlert />
      <BottomSheet
        open={choosing}
        onOpenChange={(next) => !busy && setChoosing(next)}
        title="Start a newsletter"
        description="Templates fill in your newest live listings. Everything stays editable."
      >
        <ul className="grid gap-2">
          {[...NEWSLETTER_TEMPLATES, null].map((template) => (
            <li key={template?.id ?? "blank"}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void create(template)}
                className="flex w-full items-start gap-3 rounded-xl border border-mist-200 bg-white p-3 text-left transition-colors hover:border-wine-500 disabled:opacity-60"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-wine-50 text-wine-700">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-plum-950">{template?.name ?? "Blank"}</span>
                  <span className="block text-xs text-slate-600">{template?.description ?? "An empty page."}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
      {createError && (
        <div className="mb-3">
          <ErrorNote error={createError} />
        </div>
      )}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && data.items.length === 0 && (
        <EmptyState title="No newsletters yet" hint="Start one, send yourself a test, then send it to your subscribers." />
      )}
      <ul className="flex flex-col gap-2">
        {data?.items.map((n) => (
          <li key={n.id}>
            <Link
              href={`/admin/newsletters/${n.id}`}
              className="flex flex-col gap-1 rounded-xl border border-mist-200 bg-white px-4 py-3 transition-colors hover:border-wine-500 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-plum-950">{n.subject || "Untitled newsletter"}</span>
                <span className="block text-xs text-slate-600">
                  {n.status === "sent" && n.sentAt
                    ? `Sent ${shortDate(n.sentAt)} to ${n.sentCount}${n.failedCount ? `, ${n.failedCount} failed` : ""}`
                    : `Edited ${shortDate(n.updatedAt)} by ${n.createdByName}`}
                </span>
              </span>
              <Badge tone={TONE[n.status]}>{LABEL[n.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
