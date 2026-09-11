"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, GraduationCap, Monitor, Play, RotateCcw } from "lucide-react";
import { isRole, type Role, type TutorialProgress, type TutorialProgressList } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useIsNarrow, useIsTouch, useSession } from "@/lib/admin/hooks";
import { TUTORIALS, clock, putWithRetry, spokenDuration, tryHrefOf, tutorialsFor, type Tutorial } from "@/lib/admin/tutorials";
import { NAV_ITEMS } from "@/components/admin/nav";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from "@/components/admin/ui";
import { TutorialPlayer } from "./TutorialPlayer";

/**
 * One card per job the reader's role can do: a short silent video, then "Try
 * it now", which opens the real screen with the spotlight walking beside them.
 *
 * A checklist rather than a gallery. Each card says where the reader is (not
 * started, watched, done), and exactly one card on the page carries the filled
 * button: the next job not yet done.
 */

type Stage = "new" | "watched" | "done";
type Opener = "poster" | "again" | "primary";

const PROGRESS = "/admin/tutorials/progress";

// The last role seen here, so the cards can be drawn before this screen's own session read answers.
const ROLE_KEY = "avh-tutorials-role";

function readRole(): Role | null {
  try {
    const value = localStorage.getItem(ROLE_KEY);
    return value && isRole(value) ? value : null;
  } catch {
    return null;
  }
}

function writeRole(role: Role) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // Private mode: skeletons stand in for the cards next visit.
  }
}

function stageOf(progress: TutorialProgress | undefined): Stage {
  if (progress?.completedAt != null) return "done";
  if (progress?.watchedAt != null) return "watched";
  return "new";
}

function screenLabel(tutorial: Tutorial): string {
  return NAV_ITEMS.find((item) => item.href === tutorial.tryHref)?.label ?? "the screen";
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function upsert(items: TutorialProgress[], item: TutorialProgress): TutorialProgress[] {
  return [...items.filter((row) => row.tutorialId !== item.tutorialId), item];
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

/**
 * What the server has, plus a watch still on its way there.
 *
 * A pending write shows at once and survives a refetch; when it finally fails
 * it is dropped, so the card goes back to what is stored and says why. The list
 * is read again whenever the window regains focus, which is how a walkthrough
 * finished in another tab, or on another screen, shows up here.
 */
function useProgress(onSettle: (id: string) => void) {
  const [list, setList] = useState<TutorialProgressList | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState<Record<string, TutorialProgress>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  // Writes that landed while there is no list to put them in, because the first read failed.
  const [saved, setSaved] = useState<Record<string, TutorialProgress>>({});

  const tick = useRef(0);
  const lastRead = useRef(0);
  // Writes that landed after a read started, which that read's answer may predate.
  const confirmed = useRef(new Map<string, { item: TutorialProgress; at: number }>());
  const inflight = useRef(new Map<string, Promise<boolean>>());
  const alive = useRef(true);

  const read = useCallback(() => {
    const started = ++tick.current;
    lastRead.current = Date.now();
    api
      .get<TutorialProgressList>(PROGRESS)
      .then((fresh) => {
        if (!alive.current) return;
        let items = fresh.items;
        for (const [, { item, at }] of confirmed.current) if (at > started) items = upsert(items, item);
        setList({ ...fresh, items });
        setError(null);
      })
      .catch((err: unknown) => {
        if (alive.current) setError(asApiError(err));
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    read();
    // Focus and visibility both fire on a return to the tab; one read answers both.
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRead.current > 1000) read();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      alive.current = false;
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [read]);

  const progressOf = (id: string): TutorialProgress | undefined =>
    pending[id] ?? list?.items.find((item) => item.tutorialId === id) ?? saved[id];

  /** Resolves true once the watch is stored (or already was), false when it gave up. */
  function markWatched(tutorial: Tutorial): Promise<boolean> {
    const id = tutorial.id;
    const running = inflight.current.get(id);
    if (running) return running;
    const current = progressOf(id);
    if (current?.watchedAt != null) return Promise.resolve(true);
    setPending((all) => ({
      ...all,
      [id]: { tutorialId: id, watchedAt: Date.now(), completedAt: current?.completedAt ?? null },
    }));
    const write = putWithRetry<{ item: TutorialProgress }>(`${PROGRESS}/${id}`, { watched: true })
      .then(({ item }) => {
        confirmed.current.set(id, { item, at: ++tick.current });
        onSettle(id);
        setList((prev) => prev && { ...prev, items: upsert(prev.items, item) });
        setSaved((all) => ({ ...all, [id]: item }));
        setFailed((all) => without(all, id));
        return true;
      })
      .catch(() => {
        onSettle(id);
        setFailed((all) => ({ ...all, [id]: true }));
        return false;
      })
      .finally(() => {
        inflight.current.delete(id);
        setPending((all) => without(all, id));
      });
    inflight.current.set(id, write);
    return write;
  }

  return {
    /** Null until the first read answers, and after it only if it failed. */
    list,
    /** Only a failed FIRST read is reported; a failed refetch keeps the last answer. */
    error: list === null ? error : null,
    reload: read,
    progressOf,
    known: (id: string) => list !== null || id in pending || id in saved,
    failed,
    saving: (id: string) => id in pending,
    markWatched,
  };
}

export default function TutorialsPage() {
  const router = useRouter();
  const { session } = useSession();

  const cards = useRef(new Map<string, HTMLElement>());
  const opener = useRef<{ id: string; from: Opener } | null>(null);
  const navigating = useRef(false);
  // A card whose focused control a settling save is about to replace.
  const refocus = useRef<string | null>(null);

  const progress = useProgress((id) => {
    if (cards.current.get(id)?.contains(document.activeElement)) refocus.current = id;
  });

  const [playing, setPlaying] = useState<Tutorial | null>(null);
  const [brokenPosters, setBrokenPosters] = useState<Record<string, true>>({});
  // Mounted only after the console shell's session read, so this never runs during the server render.
  const [cachedRole] = useState(readRole);

  // The same two questions the gated studios ask, so no card offers a walk into a gate.
  const narrow = useIsNarrow();
  const touch = useIsTouch();
  const canTry = (tutorial: Tutorial) => !(tutorial.desktopOnly && (narrow || touch));

  const user = session.status === "signed-in" ? session.user : null;
  const role = user?.role ?? cachedRole;
  const visible = role ? tutorialsFor(role) : [];

  useEffect(() => {
    if (user) writeRole(user.role);
  }, [user]);

  // The control that had focus is gone; its card's last action takes it, never the page body.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    const card = cards.current.get(id);
    const active = document.activeElement;
    if (card?.contains(active) || (active && active !== document.body)) {
      refocus.current = null;
      return;
    }
    refocus.current = null;
    [...(card?.querySelectorAll<HTMLElement>("[data-actions] a, [data-actions] button") ?? [])].pop()?.focus();
  });
  const settled = progress.list !== null || progress.error !== null;

  const stages = visible.map((tutorial) => stageOf(progress.progressOf(tutorial.id)));
  const done = stages.filter((stage) => stage === "done").length;
  const watched = stages.filter((stage) => stage === "watched").length;

  // The one filled button: the first job, in catalogue order, with a step this device can take.
  const nextUp =
    progress.list === null
      ? null
      : (visible.find((tutorial, index) => {
          const stage = stages[index];
          return stage === "new" || (stage === "watched" && canTry(tutorial));
        })?.id ?? null);

  function play(tutorial: Tutorial, from: Opener) {
    opener.current = { id: tutorial.id, from };
    navigating.current = false;
    setPlaying(tutorial);
  }

  /** Back to the control that opened the player. "primary" is the card's last action, which a watch may have changed. */
  function restoreFocus() {
    if (navigating.current || !opener.current) return;
    const { id, from } = opener.current;
    const card = cards.current.get(id);
    if (!card) return;
    const target =
      from === "primary"
        ? [...card.querySelectorAll<HTMLElement>("[data-actions] a, [data-actions] button")].pop()
        : card.querySelector<HTMLElement>(`[data-opener="${from}"]`);
    target?.focus();
  }

  return (
    <>
      <PageHeader
        title="Tutorials"
        icon={GraduationCap}
        subtitle="A short video for each job, then a guided try on the real screen."
        actions={
          // Nothing is claimed when progress failed to load; the error says why below.
          progress.error ? undefined : (
            <Summary done={done} watched={watched} total={visible.length} ready={role !== null && progress.list !== null} />
          )
        }
      />

      {progress.error && (
        <div className="mb-4">
          <ErrorNote error={progress.error} onRetry={progress.reload} />
        </div>
      )}

      {!role ? (
        <ul className="flex flex-col gap-3" aria-busy="true">
          {TUTORIALS.map((tutorial) => (
            <li key={tutorial.id}>
              <CardSkeleton tutorial={tutorial} canTry={canTry(tutorial)} />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No tutorials for your role yet"
          hint="Tutorials cover the screens your role can open, and none of them are yours so far."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((tutorial, index) => (
            <li
              key={tutorial.id}
              ref={(node) => {
                if (node) cards.current.set(tutorial.id, node);
                else cards.current.delete(tutorial.id);
              }}
            >
              <TutorialCard
                tutorial={tutorial}
                stage={settled || progress.known(tutorial.id) ? stages[index] ?? "new" : null}
                showStatus={progress.known(tutorial.id)}
                next={tutorial.id === nextUp}
                canTry={canTry(tutorial)}
                touch={touch}
                saveFailed={tutorial.id in progress.failed}
                saving={progress.saving(tutorial.id)}
                posterBroken={tutorial.id in brokenPosters}
                onPosterError={() => setBrokenPosters((all) => ({ ...all, [tutorial.id]: true }))}
                onRetrySave={() => void progress.markWatched(tutorial)}
                onPlay={(from) => play(tutorial, from)}
              />
            </li>
          ))}
        </ul>
      )}

      <TutorialPlayer
        tutorial={playing}
        screenLabel={playing ? screenLabel(playing) : ""}
        canTry={playing ? canTry(playing) : false}
        done={playing !== null && stageOf(progress.progressOf(playing.id)) === "done"}
        touch={touch}
        posterBroken={playing !== null && playing.id in brokenPosters}
        onWatched={progress.markWatched}
        onTry={(tutorial) => {
          navigating.current = true;
          setPlaying(null);
          router.push(tryHrefOf(tutorial));
        }}
        onClose={() => setPlaying(null)}
        onClosed={restoreFocus}
      />
    </>
  );
}

function Summary({ done, watched, total, ready }: { done: number; watched: number; total: number; ready: boolean }) {
  if (!ready) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-48 sm:items-end" aria-hidden="true">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-28" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    );
  }
  if (total === 0) return null;

  const all = done === total;
  const said = all ? "All done" : `${done} of ${total} done${watched > 0 ? `, ${watched} watched` : ""}`;
  return (
    <div className="flex w-full flex-col gap-2 sm:w-48 sm:items-end">
      <p className="flex h-5 items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-600">
        {all && <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />}
        {all ? (
          <span className="font-semibold text-plum-950">All done</span>
        ) : (
          <span>
            <span className="c-num font-semibold text-plum-950">
              {done} of {total}
            </span>{" "}
            done
            {watched > 0 && (
              <>
                , <span className="c-num">{watched}</span> watched
              </>
            )}
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Tutorials done"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={said}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-mist-200"
      >
        <div
          className={`h-full motion-safe:transition-[width] motion-safe:duration-500 ${all ? "bg-emerald-600" : "bg-wine-600"}`}
          style={{ width: `${(done / total) * 100}%` }}
        />
        <div
          className="h-full bg-wine-300 motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${(watched / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

const STAGE: Record<Stage, { label: string; tone: "neutral" | "wine" | "green" }> = {
  new: { label: "Not started", tone: "neutral" },
  watched: { label: "Watched", tone: "wine" },
  done: { label: "Done", tone: "green" },
};

/* The grid keeps one shape at every width: the poster left, the words beside
   it, the actions under the words (or, from lg, at the far right). */
const CARD_GRID =
  "grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-4 sm:p-4 lg:grid-cols-[13rem_minmax(0,1fr)_auto] lg:items-center lg:gap-x-5";

function TutorialCard({
  tutorial,
  stage,
  showStatus,
  next,
  canTry,
  touch,
  saveFailed,
  saving,
  posterBroken,
  onPosterError,
  onRetrySave,
  onPlay,
}: {
  tutorial: Tutorial;
  /** Null while progress loads. */
  stage: Stage | null;
  /** False when progress failed to load, so no status is claimed. */
  showStatus: boolean;
  /** The page's next step, and the only card with a filled button. */
  next: boolean;
  canTry: boolean;
  /** A phone or tablet, so the gate is the device rather than the window. */
  touch: boolean;
  /** A watch that never reached the server; the stage has already rolled back. */
  saveFailed: boolean;
  /** A watch on its way to the server, which a retry is waiting on. */
  saving: boolean;
  posterBroken: boolean;
  onPosterError: () => void;
  onRetrySave: () => void;
  onPlay: (from: Opener) => void;
}) {
  const href = tryHrefOf(tutorial);
  // Ties each action to its card for a screen reader, which would otherwise hear "Watch" four times.
  const named = (label: string) => (
    <>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{`${label}: ${tutorial.title}`}</span>
    </>
  );

  const watchAgain = (
    <button
      type="button"
      data-opener="again"
      onClick={() => onPlay("again")}
      className="c-tap inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 sm:h-8 sm:px-2.5"
    >
      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
      {named("Watch again")}
    </button>
  );

  let actions;
  if (stage === null) {
    actions = <Skeleton className="h-11 w-full rounded-lg sm:h-8 sm:w-24" />;
  } else if (stage === "new") {
    actions = (
      <Button variant={next ? "primary" : "ghost"} onClick={() => onPlay("primary")}>
        <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
        {named("Watch")}
      </Button>
    );
  } else {
    actions = (
      <>
        {watchAgain}
        {canTry &&
          (stage === "done" ? (
            <ButtonLink href={href} variant="ghost">
              {named("Try it again")}
            </ButtonLink>
          ) : (
            <ButtonLink href={href} variant={next ? "primary" : "ghost"}>
              {named("Try it now")}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
            </ButtonLink>
          ))}
      </>
    );
  }

  return (
    <Card padded={false} className={CARD_GRID}>
      <button
        type="button"
        data-opener="poster"
        onClick={() => onPlay("poster")}
        aria-label={`Play ${tutorial.title}, ${spokenDuration(tutorial.durationSeconds)}`}
        className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-plum-950 sm:row-span-2 sm:rounded-xl lg:row-span-1"
      >
        {posterBroken ? (
          <span className="absolute inset-0 grid place-items-center bg-plum-900">
            <GraduationCap className="h-6 w-6 text-white/35 sm:h-8 sm:w-8" aria-hidden="true" />
          </span>
        ) : (
          <Image
            src={tutorial.poster}
            alt=""
            fill
            sizes="(min-width: 64rem) 13rem, (min-width: 40rem) 11rem, 7rem"
            onError={onPosterError}
            className="object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute inset-0 bg-plum-950/0 transition-colors group-hover:bg-plum-950/15" />
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 py-0.5 pl-0.5 pr-1.5 text-[10px] font-semibold text-plum-950 shadow-pop transition-colors group-hover:bg-white sm:bottom-2 sm:left-2 sm:gap-1.5 sm:py-1 sm:pl-1 sm:pr-2.5 sm:text-[11px]">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-wine-600 text-white transition-colors group-hover:bg-wine-700 sm:h-5 sm:w-5">
            <Play className="ml-px h-2 w-2 sm:h-2.5 sm:w-2.5" fill="currentColor" aria-hidden="true" />
          </span>
          <span className="c-num">{clock(tutorial.durationSeconds)}</span>
        </span>
      </button>

      <div className="min-w-0">
        {(stage === null || showStatus) && (
          <div className="mb-1.5 flex h-5 items-center">
            {stage === null ? (
              <Skeleton className="h-4 w-20 rounded-full" />
            ) : (
              <Badge tone={STAGE[stage].tone}>
                {stage === "done" && <Check className="-ml-0.5 mr-1 h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                {STAGE[stage].label}
              </Badge>
            )}
          </div>
        )}
        <h2 className="text-[14px] font-semibold leading-snug text-plum-950 sm:text-[15px]">
          {tutorial.title}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{tutorial.problem}</p>
        {!canTry && <DeviceNote touch={touch} again={stage === "done"} />}
        <div aria-live="polite">
          {saveFailed && (
            <p className="mt-1.5 text-[12px] font-medium text-red-700">
              {saving ? "Saving that you watched this." : "Could not save that you watched this."}{" "}
              {/* Stays mounted while it retries, so focus on it is never dropped. */}
              <button
                type="button"
                onClick={saving ? undefined : onRetrySave}
                aria-disabled={saving || undefined}
                aria-label={saving ? `Saving that you watched ${tutorial.title}` : `Try again to save that you watched ${tutorial.title}`}
                className={`c-tap font-semibold underline underline-offset-2 ${saving ? "cursor-progress opacity-60" : "hover:text-red-800"}`}
              >
                {saving ? "Trying again" : "Try again"}
              </button>
            </p>
          )}
        </div>
      </div>

      <div
        data-actions
        className="col-span-2 flex items-center gap-2 [&>*]:flex-1 sm:col-span-1 sm:col-start-2 sm:[&>*]:flex-none lg:col-start-3 lg:justify-end"
      >
        {actions}
      </div>
    </Card>
  );
}

/** Where the walkthrough can be taken instead. The row stays once done, so a card never changes height. */
function DeviceNote({ touch, again }: { touch: boolean; again: boolean }) {
  const where = touch ? "on a computer" : "in a wider window";
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
      <Monitor className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-hidden="true" />
      {again ? `Try it again ${where}` : `Try it ${where}`}
    </p>
  );
}

/* The real card's words set in shimmer, so each skeleton wraps exactly as its
   card will and nothing below it moves when the cards arrive. */
const GHOST = "c-skeleton rounded text-transparent [box-decoration-break:clone] [-webkit-box-decoration-break:clone]";

function CardSkeleton({ tutorial, canTry }: { tutorial: Tutorial; canTry: boolean }) {
  return (
    <div className={`rounded-2xl bg-white shadow-card ${CARD_GRID}`} aria-hidden="true">
      <Skeleton className="aspect-video w-full rounded-lg sm:row-span-2 sm:rounded-xl lg:row-span-1" />
      <div className="min-w-0">
        <div className="mb-1.5 flex h-5 items-center">
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <h2 className="text-[14px] font-semibold leading-snug sm:text-[15px]">
          <span className={GHOST}>{tutorial.title}</span>
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed">
          <span className={GHOST}>{tutorial.problem}</span>
        </p>
        {!canTry && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium">
            <span className={GHOST}>Try it on a computer</span>
          </p>
        )}
      </div>
      <div className="col-span-2 sm:col-span-1 sm:col-start-2 lg:col-start-3">
        <Skeleton className="h-11 w-full rounded-lg sm:h-8 sm:w-24" />
      </div>
    </div>
  );
}
