"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Eye, EyeOff } from "lucide-react";
import {
  MARKETER_STATUS_LABEL,
  joinLink,
  type MarketerAlert,
  type MarketerStatus,
} from "@avhomes/contracts";
import {
  AppShell,
  Avatar,
  reportBlockedReason,
  useMarketer,
  useReportBlock,
} from "@/components/marketer/AppShell";
import { Sheet } from "@/components/marketer/Sheet";
import { UpdatesEmpty, UpdatesRail, UpdatesSkeleton } from "@/components/marketer/Updates";
import { AlertCard, AlertCardSkeleton, sortAlerts } from "@/components/marketer/alerts";
import {
  IconCheckBadge,
  IconDeals,
  IconInvite,
  IconListings,
  IconMoney,
  IconTeam,
} from "@/components/marketer/icons3d";
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorNote,
  HiddenMoney,
  IconTile,
  Money,
  SectionLabel,
  SectionLink,
  Skeleton,
  moneyParts,
  type ChipTone,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import {
  greeting,
  initials,
  payDayLabel,
  type AlertsResponse,
  type MeResponse,
  type UpdatesResponse,
} from "@/lib/marketer/api";
import { useIfApproved } from "@/lib/marketer/earnings";
import { useMoneyHidden, usePref } from "@/lib/marketer/prefs";

/**
 * Home: what you are owed, what is new, and what needs you. In that order,
 * because a marketer opens this screen on a bus and the first glance has to
 * answer the money question.
 *
 * Every control on the first screen does its own job: the bell and the gear,
 * the figure and its eye, the code's copy, Share my link and Money history in
 * the hero, and the orb alone for Report a deal.
 */

type Figure = "waiting" | "checking" | "paid";

const FIGURE_KEYS: readonly Figure[] = ["waiting", "checking", "paid"];

const FIGURE_LABEL: Record<Figure, string> = {
  waiting: "Waiting for pay day",
  checking: "Being checked",
  paid: "Paid so far",
};

const STATUS_TONE: Record<MarketerStatus, ChipTone> = {
  active: "good",
  paused: "warn",
  banned: "bad",
};

/** How many alerts the home strip shows before it offers the full list. */
const HOME_ALERTS = 3;

/**
 * The figure's size, from its whole number of characters, so a long balance
 * fits a 360px screen beside the eye and a short one is not set absurdly large.
 */
function figureSize(whole: string): string {
  return `min(2.75rem, calc((100vw - 6.75rem) / ${(whole.length * 0.6 + 1.1).toFixed(2)}))`;
}

async function shareLink(code: string) {
  const link = joinLink(window.location.origin, code);
  const text = "Join AV Homes with me and earn money on every home you help sell or rent.";
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Join AV Homes", text, url: link });
      return;
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  window.open(
    `https://wa.me/?text=${encodeURIComponent(`${text} Start here: ${link}`)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

interface AlertsRead {
  items: MarketerAlert[] | null;
  error: ApiError | null;
  reload: () => void;
}

export default function MarketerHome() {
  // Read here rather than in the body, so the bell counts the same list the body shows.
  const alerts = useAsync((signal) => api.get<AlertsResponse>("/marketing/alerts", signal), []);
  const items = alerts.data ? sortAlerts(alerts.data.items) : null;
  const toDo = items ? items.filter((alert) => alert.tone === "act").length : undefined;

  return (
    <AppShell variant="home" hero={<HomeHero />} tab="Updates" nav="home" alertCount={toDo}>
      <HomeBody alerts={{ items, error: alerts.error, reload: alerts.reload }} />
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════ HERO ══ */

function HomeHero() {
  const { me, error, reload } = useMarketer();

  if (error) {
    return (
      <div className="mt-5">
        <h1 className="sr-only">Home</h1>
        <ErrorNote error={error} onRetry={reload} />
      </div>
    );
  }
  if (!me) return <HeroSkeleton />;
  return <HeroReady me={me} />;
}

function HeroReady({ me }: { me: MeResponse }) {
  const [figure, setFigure] = usePref<Figure>("avh-m-figure", "waiting", FIGURE_KEYS);
  const [hidden, setHidden] = useMoneyHidden();
  const [picking, setPicking] = useState(false);

  const { marketer, balance, rates } = me;
  const first = marketer.displayName.trim().split(/\s+/u)[0] || marketer.displayName;
  const block = reportBlockedReason(me);
  const payDay = payDayLabel();
  // The per deal read waits until this figure is on screen or in the picker.
  const ifApproved = useIfApproved(balance, rates, figure === "checking" || picking);

  const amounts: Record<Figure, number | null> = {
    // Money already in this month's pay run is still waiting as far as the marketer can tell.
    waiting: balance.waitingMinor + balance.scheduledMinor,
    checking: ifApproved,
    paid: balance.paidMinor,
  };
  const captions: Record<Figure, ReactNode> = {
    waiting: (
      <>
        Pay day is <span className="font-semibold text-white">{payDay}</span>
      </>
    ),
    checking: <span className="font-semibold text-white">If approved</span>,
    paid: "Sent to your bank",
  };
  const hints: Record<Figure, string> = {
    waiting: `We send it to your bank on ${payDay}.`,
    checking: "Your share of the deals we are still checking, if we approve them.",
    paid: "Sent to your bank so far.",
  };

  const amount = amounts[figure];
  const size = figureSize(moneyParts(amount ?? 0, balance.currency, true).whole);

  return (
    <>
      <h1 className="sr-only">Home</h1>

      <div className="mt-3 flex items-center gap-3">
        <Avatar text={initials(marketer.displayName, marketer.code)} className="h-11 w-11" />
        <div className="min-w-0">
          <p className="text-[13px] leading-tight text-white/75">{greeting()}</p>
          <p className="mt-0.5 truncate text-[19px] font-bold leading-tight tracking-[-0.015em]">
            {first}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center text-center">
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-haspopup="dialog"
          aria-label={`Showing ${FIGURE_LABEL[figure]}. Change`}
          className="m-glass m-press m-tap inline-flex h-[34px] items-center gap-1 rounded-full pl-3.5 pr-2.5 text-[13px] font-semibold"
        >
          {FIGURE_LABEL[figure]}
          <ChevronDown className="h-4 w-4 opacity-80" aria-hidden />
        </button>

        {/* The left pad matches the eye button, so the figure itself reads as centred. */}
        <div className="mt-3 flex min-h-11 max-w-full items-center justify-center gap-1 pl-10">
          {amount === null ? (
            <Skeleton onWine className="h-10 w-52" radius="12px" />
          ) : (
            <p className="min-w-0" style={{ "--m-figure": size } as CSSProperties}>
              {/* One Money for the life of the hero, so hiding and showing never re-counts. */}
              <span className={`m-figure ${hidden ? "m-figure--hidden" : ""}`}>
                <Money minor={amount} currency={balance.currency} size="hero" kobo animate />
                {hidden && (
                  <>
                    <span aria-hidden className="m-figure__dots">
                      {[0, 1, 2, 3, 4, 5].map((dot) => (
                        <span key={dot} />
                      ))}
                    </span>
                    <span className="sr-only">Amount hidden</span>
                  </>
                )}
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show amounts" : "Hide amounts"}
            aria-pressed={hidden}
            className="m-press m-tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/85 active:bg-white/15"
          >
            {hidden ? (
              <Eye className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            ) : (
              <EyeOff className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            )}
          </button>
        </div>

        <p className="mt-1.5 text-[13px] leading-snug text-white/80">{captions[figure]}</p>

        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="text-[12px] font-medium text-white/85">Invite code</span>
          <span className="m-num text-[14px] font-semibold tracking-[0.06em] text-white">
            {marketer.code}
          </span>
          <CopyCode code={marketer.code} />
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/30" />
          <Chip tone={STATUS_TONE[marketer.status]} dot>
            {MARKETER_STATUS_LABEL[marketer.status]}
          </Chip>
        </div>

        {block && <p className="mt-2.5 text-[13px] leading-snug text-white/90">{block}</p>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          variant="hero"
          size="lg"
          className="gap-1.5 px-2"
          onClick={() => void shareLink(marketer.code)}
        >
          <IconInvite size={34} className="-my-1 shrink-0" />
          Share my link
        </Button>
        <ButtonLink href="/m/money" variant="hero" size="lg" className="gap-1.5 px-2">
          <IconMoney size={34} className="-my-1 shrink-0" />
          Money history
        </ButtonLink>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Show on home">
        <div role="radiogroup" aria-label="Show on home" className="space-y-2.5">
          {FIGURE_KEYS.map((key) => {
            const on = key === figure;
            const value = amounts[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setFigure(key);
                  setPicking(false);
                }}
                className={`m-press flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left ring-1 ${
                  on ? "bg-m-raised ring-[#c24a6b]" : "bg-m-card ring-m-line active:bg-m-raised"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-[15px] font-semibold text-m-text">{FIGURE_LABEL[key]}</span>
                    <span className="text-m-text">
                      {hidden ? (
                        <HiddenMoney className="m-money--md" />
                      ) : value === null ? (
                        <Skeleton className="h-4 w-20" />
                      ) : (
                        <Money minor={value} currency={balance.currency} />
                      )}
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-m-muted">{hints[key]}</span>
                </span>
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                    on ? "bg-[#c24a6b] text-white" : "ring-2 ring-m-faint"
                  }`}
                >
                  {on && <Check className="h-4 w-4" strokeWidth={2.6} />}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard in this browser. The code is on screen to read out.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy your invite code"
        className="m-press m-tap inline-flex h-7 items-center gap-1 rounded-full px-1.5 text-[12px] font-semibold text-white/90 active:bg-white/15"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-[#7ee2b8]" strokeWidth={2.4} aria-hidden />
            Copied
          </>
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Invite code copied" : ""}
      </span>
    </>
  );
}

function HeroSkeleton() {
  return (
    <div aria-hidden>
      <div className="mt-3 flex items-center gap-3">
        <Skeleton onWine className="h-11 w-11" radius="999px" />
        <div>
          <Skeleton onWine className="h-3 w-24" />
          <Skeleton onWine className="mt-2 h-5 w-32" />
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center">
        <Skeleton onWine className="h-[34px] w-44" radius="999px" />
        <Skeleton onWine className="mt-3 h-11 w-60" radius="12px" />
        <Skeleton onWine className="mt-2 h-3.5 w-40" />
        <Skeleton onWine className="mt-3.5 h-6 w-56" radius="999px" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Skeleton onWine className="h-[52px]" radius="16px" />
        <Skeleton onWine className="h-[52px]" radius="16px" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ BODY ══ */

function HomeBody({ alerts }: { alerts: AlertsRead }) {
  const updates = useAsync((signal) => api.get<UpdatesResponse>("/marketing/updates", signal), []);
  const block = useReportBlock();

  const items = alerts.items ?? [];
  const toDo = items.filter((alert) => alert.tone === "act").length;
  // Named for what it holds: good news alone is not something that needs you.
  const title = toDo > 0 ? "Needs you" : "For you";

  return (
    <>
      <section aria-label="Updates">
        {updates.error ? (
          <div className="px-4">
            <ErrorNote error={updates.error} onRetry={updates.reload} />
          </div>
        ) : !updates.data ? (
          <UpdatesSkeleton />
        ) : updates.data.items.length === 0 ? (
          <UpdatesEmpty />
        ) : (
          <UpdatesRail items={updates.data.items} canReport={block === null} />
        )}
      </section>

      <section className="mt-4" aria-busy={alerts.items === null && !alerts.error}>
        <div className="px-4">
          {alerts.items === null && !alerts.error ? (
            <div aria-hidden className="mb-3 flex min-h-6 items-center">
              <Skeleton className="h-5 w-28" />
            </div>
          ) : (
            <SectionLabel
              action={
                items.length > HOME_ALERTS ? <SectionLink href="/m/alerts">See all</SectionLink> : null
              }
            >
              {title}
              {toDo > 0 && <Chip tone="act">{toDo} to do</Chip>}
            </SectionLabel>
          )}
        </div>
        {alerts.error ? (
          <div className="px-4">
            <ErrorNote error={alerts.error} onRetry={alerts.reload} />
          </div>
        ) : alerts.items === null ? (
          <div className="m-rail m-rail--cards" aria-hidden>
            <div>
              <AlertCardSkeleton />
            </div>
            <div>
              <AlertCardSkeleton />
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4">
            <EmptyState
              compact
              art={<IconCheckBadge size={52} />}
              title="You are all caught up"
              hint="Anything that needs you shows up here."
            />
          </div>
        ) : (
          <ul className="m-rail m-rail--cards" aria-label={title}>
            {items.slice(0, HOME_ALERTS).map((alert) => (
              <li key={alert.id}>
                <AlertCard alert={alert} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Three places not already on the first screen. Report a deal is the orb's alone. */}
      <section className="mt-5 px-4">
        <SectionLabel>Quick access</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <IconTile href="/m/deals" icon={<IconDeals size={46} />} label="My deals" />
          <IconTile href="/m/listings" icon={<IconListings size={46} />} label="Listings" />
          <IconTile href="/m/team" icon={<IconTeam size={46} />} label="My team" />
        </div>
      </section>
    </>
  );
}
