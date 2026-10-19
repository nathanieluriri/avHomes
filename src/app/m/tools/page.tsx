"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useSyncExternalStore } from "react";
import { BookOpen, CalendarClock, ChevronRight, ExternalLink, FileText, Link2, Lock, PlayCircle, Shirt } from "lucide-react";
import {
  GUIDE_KIND_LABELS,
  formatPrice,
  gradeAllows,
  type Guide,
  type MerchItem,
  type MerchRequest,
  type PartnerTools,
  type Training,
} from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import { DownloadButton } from "@/components/marketer/DownloadButton";
import { IconCheckBadge, IconUpdates } from "@/components/marketer/icons3d";
import { Sheet } from "@/components/marketer/Sheet";
import { HeroArt, HeroHint } from "@/components/marketer/team/bits";
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  SectionLabel,
  Segmented,
  Skeleton,
  inputCls,
  type ChipTone,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";

type Tab = "guides" | "trainings" | "merch";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "guides", label: "Guides" },
  { value: "trainings", label: "Trainings" },
  { value: "merch", label: "Merch" },
];

const SALE = { listingType: "sale", rentPeriod: null } as const;

const REQUEST_CHIP: Record<MerchRequest["status"], { label: string; tone: ChipTone }> = {
  requested: { label: "Asked for", tone: "warn" },
  sent: { label: "On its way", tone: "good" },
  declined: { label: "Not sent", tone: "neutral" },
};

/** Tools: what AV Homes gives partners to sell with, and the merch they have earned. */
function onPopState(change: () => void) {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
}

/** `?tab=` from the address, so a push about merch opens on Merch, without a Suspense boundary. */
function useTabParam(): Tab | null {
  const asked = useSyncExternalStore(
    onPopState,
    () => new URLSearchParams(window.location.search).get("tab"),
    () => null,
  );
  return asked === "guides" || asked === "trainings" || asked === "merch" ? asked : null;
}

export default function ToolsPage() {
  const asked = useTabParam();
  const [picked, setTab] = useState<Tab | null>(null);
  const tab = picked ?? asked ?? "guides";

  return (
    <AppShell
      title="Tools"
      back="/m"
      tab="Learn and sell"
      hero={
        <>
          <HeroArt>
            <IconUpdates size={92} />
          </HeroArt>
          <HeroHint>Guides, trainings and merch from AV Homes.</HeroHint>
        </>
      }
    >
      <ToolsBody tab={tab} setTab={setTab} />
    </AppShell>
  );
}

function ToolsBody({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const { data, error, reload } = useAsync((signal) => api.get<PartnerTools>("/marketing/tools", signal), []);

  return (
    <div className="space-y-5 px-4">
      <Segmented value={tab} options={TABS} onChange={setTab} label="Which tools" />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {data && tab === "guides" && <Guides guides={data.guides} />}
      {data && tab === "trainings" && <Trainings trainings={data.trainings} />}
      {data && tab === "merch" && <Merch tools={data} onAsked={reload} />}
    </div>
  );
}

const GUIDE_ICON = { article: BookOpen, link: Link2, file: FileText, video: PlayCircle } as const;

function Guides({ guides }: { guides: Guide[] }) {
  const [reading, setReading] = useState<Guide | null>(null);
  if (guides.length === 0) {
    return <EmptyState compact title="No guides yet" hint="AV Homes adds guides here. Check back soon." />;
  }
  return (
    <>
      <ul className="space-y-3">
        {guides.map((guide) => {
          const Icon = GUIDE_ICON[guide.kind];
          const body = (
            <>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-m-raised text-m-text ring-1 ring-m-line">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-snug text-m-text">{guide.title}</span>
                {guide.summary && <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">{guide.summary}</span>}
                <span className="mt-1.5 block text-[12px] font-semibold text-m-faint">{GUIDE_KIND_LABELS[guide.kind]}</span>
              </span>
            </>
          );
          if (guide.kind === "article") {
            return (
              <li key={guide.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setReading(guide)}
                  className="m-card m-press m-press-light flex w-full items-center gap-3.5 p-3.5 text-left"
                >
                  {body}
                  <ChevronRight className="h-5 w-5 shrink-0 text-m-faint" aria-hidden />
                </button>
              </li>
            );
          }
          return (
            <li key={guide.id} className="m-card p-3.5">
              <div className="flex items-start gap-3.5">{body}</div>
              <div className="mt-3 flex gap-2">
                {guide.kind !== "link" && <DownloadButton url={guide.url} name={guide.title} size="sm" />}
                <a href={guide.url} target="_blank" rel="noreferrer" className="m-btn m-btn--quiet m-tap h-9 gap-2 px-3.5 text-[13px]">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {guide.kind === "video" ? "Watch" : "Open"}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <Sheet open={reading !== null} onClose={() => setReading(null)} title={reading?.title ?? ""} hint={reading?.summary || undefined}>
        <div className="space-y-3 pb-2">
          {reading?.body
            .split(/\n{2,}/u)
            .map((para, i) => (
              <p key={i} className="whitespace-pre-line text-[15px] leading-relaxed text-m-text">
                {para}
              </p>
            ))}
        </div>
      </Sheet>
    </>
  );
}

function liveLine(at: number): string {
  return new Date(at).toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Trainings({ trainings }: { trainings: Training[] }) {
  if (trainings.length === 0) {
    return <EmptyState compact title="No trainings yet" hint="Recorded lessons and live sessions show here." />;
  }
  return <TrainingList trainings={trainings} />;
}

function TrainingList({ trainings }: { trainings: Training[] }) {
  const [now] = useState(() => Date.now());
  return (
    <ul className="space-y-3">
      {trainings.map((t) => {
        const live = t.liveAt !== null;
        const past = live && t.liveAt! < now - 3 * 60 * 60 * 1000;
        return (
          <li key={t.id} className="m-card p-3.5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-m-raised text-m-text ring-1 ring-m-line">
                {live ? <CalendarClock className="h-5 w-5" aria-hidden /> : <PlayCircle className="h-5 w-5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-snug text-m-text">{t.title}</span>
                {t.summary && <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">{t.summary}</span>}
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  {live ? (
                    <Chip tone={past ? "neutral" : "wine"}>{past ? "Finished" : `Live ${liveLine(t.liveAt!)}`}</Chip>
                  ) : (
                    <Chip>Watch any time</Chip>
                  )}
                  {t.minutes > 0 && <span className="text-[12px] font-semibold text-m-faint">{t.minutes} min</span>}
                </span>
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <a href={t.url} target="_blank" rel="noreferrer" className="m-btn m-btn--primary m-tap h-9 gap-2 px-3.5 text-[13px]">
                {live && !past ? "Join" : "Watch"}
              </a>
              {!live && <DownloadButton url={t.url} name={t.title} size="sm" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Merch({ tools, onAsked }: { tools: PartnerTools; onAsked: () => void }) {
  const [asking, setAsking] = useState<MerchItem | null>(null);
  const mine = tools.grades.find((g) => g.id === tools.gradeId) ?? null;
  const next = tools.grades.find((g) => g.minDeals > tools.approvedDeals) ?? null;
  const toGo = next ? next.minDeals - tools.approvedDeals : 0;
  const lastAsk = new Map(tools.requests.map((r) => [r.itemId, r] as const));

  return (
    <>
      <Card className="m-card--lg">
        <div className="flex items-center gap-3.5">
          <span aria-hidden className="shrink-0">
            <IconCheckBadge size={52} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-m-muted">Your merch grade</p>
            <p className="text-[20px] font-bold text-m-text">{mine?.name ?? "Not reached yet"}</p>
            <p className="mt-0.5 text-[13px] text-m-muted">
              {tools.approvedDeals} approved deal{tools.approvedDeals === 1 ? "" : "s"}
              {next ? `. ${toGo} more to reach ${next.name}.` : ". You have the top grade."}
            </p>
          </div>
        </div>
        {next && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-m-raised" aria-hidden>
            <div
              className="h-full rounded-full bg-[#c24a6b]"
              style={{ width: `${Math.min(100, Math.round((tools.approvedDeals / Math.max(1, next.minDeals)) * 100))}%` }}
            />
          </div>
        )}
      </Card>

      {tools.grades.map((grade) => {
        const items = tools.merch.filter((m) => m.gradeId === grade.id);
        const open = gradeAllows(tools.grades, tools.gradeId, grade.id);
        return (
          <section key={grade.id}>
            <SectionLabel>
              {grade.name}
              {!open && ` · ${grade.minDeals} approved deals`}
            </SectionLabel>
            {grade.includes && <p className="-mt-1 mb-2 px-1 text-[13px] text-m-muted">{grade.includes}</p>}
            {items.length === 0 ? (
              <p className="px-1 text-[13px] text-m-faint">Nothing in this grade yet.</p>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => {
                  const ask = lastAsk.get(item.id);
                  const out = item.stock !== null && item.stock <= 0;
                  return (
                    <li key={item.id} className="m-card flex items-center gap-3.5 p-3">
                      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-m-raised ring-1 ring-m-line">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Shirt className="h-7 w-7 text-m-faint" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold leading-snug text-m-text">{item.name}</span>
                        {item.summary && <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">{item.summary}</span>}
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-semibold text-m-faint">
                            {item.priceMinor > 0 ? formatPrice(item.priceMinor, SALE) : "Free"}
                          </span>
                          {ask && <Chip tone={REQUEST_CHIP[ask.status].tone}>{REQUEST_CHIP[ask.status].label}</Chip>}
                          {out && <Chip>Out of stock</Chip>}
                        </span>
                      </span>
                      {open ? (
                        <button
                          type="button"
                          disabled={out || ask?.status === "requested"}
                          onClick={() => setAsking(item)}
                          className="m-btn m-btn--secondary m-tap h-9 shrink-0 px-3.5 text-[13px] disabled:opacity-50"
                        >
                          Ask for it
                        </button>
                      ) : (
                        <Lock className="mr-1 h-5 w-5 shrink-0 text-m-faint" aria-label={`Unlocks at ${grade.name}`} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <AskSheet
        key={asking?.id ?? "none"}
        item={asking}
        onClose={() => setAsking(null)}
        onDone={() => {
          setAsking(null);
          onAsked();
        }}
      />
    </>
  );
}

function AskSheet({ item, onClose, onDone }: { item: MerchItem | null; onClose: () => void; onDone: () => void }) {
  const [size, setSize] = useState(item?.sizes[0] ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/marketing/merch-requests", { itemId: item.id, size, note: note.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={item !== null} onClose={onClose} title={item ? `Ask for ${item.name}` : ""} hint="AV Homes sends it to you and lets you know when it is on its way.">
      {item && (
        <div className="space-y-4">
          {error && <ErrorNote error={error} />}
          {item.sizes.length > 0 && (
            <Field label="Size">
              <select className={inputCls} value={size} onChange={(e) => setSize(e.target.value)}>
                {item.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Anything we should know" hint="Optional, such as where to send it.">
            <textarea className={`${inputCls} resize-none`} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {item.priceMinor > 0 && <Note>This item costs {formatPrice(item.priceMinor, SALE)}. AV Homes will tell you how to pay.</Note>}
          <PrimaryButton onClick={() => void send()} busy={busy}>
            Send my request
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  );
}
