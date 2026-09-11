"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "radix-ui";
import { ArrowRight, Loader2, Maximize2, Monitor, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button, IconButton } from "@/components/admin/ui";
import { useMediaQuery } from "@/lib/admin/hooks";
import { clock, spokenDuration, stepAt, type Tutorial } from "@/lib/admin/tutorials";

/**
 * The video, as a centred dialog from `sm` up and a bottom sheet below it, with
 * the same overlay and classes as `BottomSheet`. Radix owns the focus trap and
 * Escape; the page decides where focus goes back to.
 *
 * Its own controls rather than the browser's: Chrome's native bar keeps
 * keyboard focus inside the video, where Escape never reaches the dialog, and
 * it offers a mute button on a video with no sound.
 *
 * The steps beside the video (under it below `lg`) are the captions as text.
 * On a phone the burned-in captions are a few pixels tall, so the list is the
 * narration there, and it is what remains when the video will not load.
 */

interface Clip {
  id: string;
  time: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  failed: boolean;
}

// A manual scroll of the step list holds off following the video for this long.
const FOLLOW_GRACE_MS = 2500;

// No data at all for this long after a stall. A slow connection still trickling data resets it on every `progress`.
const STALL_MS = 10_000;

const CONTROL =
  "c-tap grid h-11 w-11 shrink-0 place-items-center rounded-lg text-plum-950 transition-colors hover:bg-mist-100 disabled:text-mist-300 disabled:hover:bg-transparent sm:h-8 sm:w-8";

export function TutorialPlayer({
  tutorial,
  screenLabel,
  canTry,
  done,
  touch,
  posterBroken,
  onWatched,
  onTry,
  onClose,
  onClosed,
}: {
  tutorial: Tutorial | null;
  /** The rail label of the task screen, for the line that says where Try it now goes. */
  screenLabel: string;
  canTry: boolean;
  /** Completed before, so the action reads as a repeat. */
  done: boolean;
  /** Decides whether the gate is the device or only the window. */
  touch: boolean;
  /** The card's poster already failed, so the video does not ask for it again. */
  posterBroken: boolean;
  /** Resolves true once the watch is stored, false when its retries gave up. */
  onWatched: (tutorial: Tutorial) => Promise<boolean>;
  onTry: (tutorial: Tutorial) => void;
  onClose: () => void;
  /** Runs where Radix would restore focus. The page puts it back on the card. */
  onClosed: () => void;
}) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const videoRef = useRef<HTMLVideoElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const marked = useRef(false);
  // Until when the reader's own scroll of the step list outranks following the video.
  const manualUntil = useRef(0);
  const tryingFor = useRef<string | null>(null);
  // Whether the reader expects motion, so a stall while paused is not reported.
  const wanted = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refocus = useRef(false);

  const metaId = useId();
  const stepsId = useId();
  const stepsHeadingId = useId();
  const errorId = useId();

  const id = tutorial?.id ?? "";
  const [clip, setClip] = useState<Clip>({ id, time: 0, duration: 0, paused: true, ended: false, failed: false });
  // "saving" while Try it now waits for the watch to be stored, "failed" when it was not.
  const [trying, setTrying] = useState<{ id: string; state: "idle" | "saving" | "failed" }>({ id, state: "idle" });
  // Reset during render when another tutorial opens, the way `useAsync` resets.
  if (clip.id !== id) {
    setClip({ id, time: 0, duration: tutorial?.durationSeconds ?? 0, paused: true, ended: false, failed: false });
  }
  if (trying.id !== id) setTrying({ id, state: "idle" });
  // More steps below the fold, which the list's bottom edge fades to say.
  const [moreBelow, setMoreBelow] = useState(false);

  const steps = tutorial?.steps ?? [];
  const current = stepAt(steps, clip.time);
  const failed = clip.failed;

  useEffect(() => {
    const timer = watchdog;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // A failure disables the bar, so focus on it moves to Retry; a retry hands it back to Play.
  useEffect(() => {
    if (!failed) {
      if (refocus.current) toggleRef.current?.focus({ preventScroll: true });
      refocus.current = false;
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || active === toggleRef.current) retryRef.current?.focus();
  }, [failed]);

  function measure() {
    const list = listRef.current;
    if (list) setMoreBelow(list.scrollTop + list.clientHeight < list.scrollHeight - 4);
  }

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setMoreBelow(list.scrollTop + list.clientHeight < list.scrollHeight - 4);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [id]);

  // Keeps the playing step in view without scrolling anything but the list, unless the reader just scrolled it.
  useEffect(() => {
    const list = listRef.current;
    if (!list || current < 0 || Date.now() < manualUntil.current) return;
    const item = list.children[current] as HTMLElement | undefined;
    if (!item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - 8), behavior: reduced ? "auto" : "smooth" });
    }
  }, [current, reduced]);

  function disarm() {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  }

  function fail() {
    disarm();
    wanted.current = false;
    setClip((now) => ({ ...now, failed: true, paused: true }));
  }

  /** Waiting or stalled: give the network its chance, then say so. */
  function arm() {
    disarm();
    watchdog.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && wanted.current && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) fail();
    }, STALL_MS);
  }

  function markWatched() {
    if (!tutorial || marked.current) return;
    marked.current = true;
    void onWatched(tutorial);
  }

  function holdFollow() {
    manualUntil.current = Date.now() + FOLLOW_GRACE_MS;
  }

  /** Stores the watch first, so a failed save is said here rather than lost behind the navigation. */
  function tryNow(anyway: boolean) {
    if (!tutorial || trying.state === "saving") return;
    if (anyway) {
      onTry(tutorial);
      return;
    }
    marked.current = true;
    tryingFor.current = tutorial.id;
    setTrying({ id: tutorial.id, state: "saving" });
    void onWatched(tutorial).then((ok) => {
      if (tryingFor.current !== tutorial.id) return;
      tryingFor.current = null;
      if (ok) onTry(tutorial);
      else setTrying({ id: tutorial.id, state: "failed" });
    });
  }

  function sync() {
    const video = videoRef.current;
    if (!video) return;
    setClip((now) => ({
      ...now,
      time: video.currentTime,
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : now.duration,
      paused: video.paused,
      ended: video.ended,
    }));
  }

  function play() {
    const video = videoRef.current;
    if (!video || failed) return;
    wanted.current = true;
    video.play().catch((err: unknown) => {
      // Refused autoplay or an interrupted load leaves it paused with the Play button showing.
      if ((err as { name?: string }).name === "NotSupportedError") fail();
    });
  }

  function toggle() {
    const video = videoRef.current;
    if (!video || failed) return;
    if (video.paused || video.ended) play();
    else {
      wanted.current = false;
      video.pause();
    }
  }

  function seek(to: number) {
    const video = videoRef.current;
    if (!video || failed) return;
    video.currentTime = Math.min(Math.max(to, 0), clip.duration || video.duration || 0);
    sync();
  }

  function jump(index: number) {
    const step = steps[index];
    if (!step) return;
    manualUntil.current = 0;
    seek(step.at);
    play();
  }

  function retry() {
    const video = videoRef.current;
    if (!video) return;
    refocus.current = true;
    setClip((now) => ({ ...now, failed: false }));
    video.load();
    // Reloaded but left paused when motion is reduced, the same rule as opening.
    wanted.current = !reduced;
    if (reduced) return;
    video.play().catch((err: unknown) => {
      if ((err as { name?: string }).name === "NotSupportedError") fail();
    });
  }

  function fullscreen() {
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!video || failed) return;
    if (typeof video.requestFullscreen === "function") void video.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();
  }

  /** Space or K plays and pauses, the arrows skip five seconds, F goes full screen. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const onControl = target.closest("button, a, input") !== null;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if ((key === " " && !onControl) || key === "k") {
      event.preventDefault();
      toggle();
    } else if ((key === "ArrowLeft" || key === "ArrowRight") && target.tagName !== "INPUT") {
      event.preventDefault();
      seek(clip.time + (key === "ArrowLeft" ? -5 : 5));
    } else if (key === "f") {
      event.preventDefault();
      fullscreen();
    }
  }

  const position = `${clock(Math.floor(clip.time))} / ${clock(Math.round(clip.duration))}`;
  const playing = steps[current];
  const narration = failed
    ? "The video did not load. The steps cover everything it shows."
    : playing
      ? `Step ${current + 1} of ${steps.length}: ${playing.title}. ${playing.line}`
      : "";

  return (
    <Dialog.Root open={tutorial !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="console-float fixed inset-0 z-[70] bg-plum-950/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {tutorial && (
          <Dialog.Content
            aria-describedby={`${metaId} ${stepsId}`}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              marked.current = false;
              wanted.current = !reduced;
              toggleRef.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              disarm();
              tryingFor.current = null;
              onClosed();
            }}
            onKeyDown={onKeyDown}
            className="console console-float fixed inset-x-0 bottom-0 z-[71] flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh_-_2rem)] sm:w-[min(44rem,calc(100vw_-_3rem),calc((100dvh_-_26rem)_*_16_/_9_+_2.5rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0 lg:w-[min(72rem,calc(100vw_-_3rem),calc((100dvh_-_14rem)_*_16_/_9_+_20.75rem))]"
          >
            <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-mist-300 sm:hidden" aria-hidden="true" />

            <div className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-base font-semibold text-plum-950">{tutorial.title}</Dialog.Title>
                <p id={metaId} className="mt-0.5 text-[13px] text-slate-600">
                  <span className="c-num" aria-hidden="true">
                    {clock(tutorial.durationSeconds)}
                  </span>
                  <span className="sr-only">{spokenDuration(tutorial.durationSeconds)}</span>
                  {" · "}Silent, with every step written out
                </p>
              </div>
              <Dialog.Close asChild>
                <IconButton label="Close video" icon={X} />
              </Dialog.Close>
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-5 lg:px-5">
              <div className="shrink-0 sm:px-5 lg:px-0">
                <div className="relative aspect-video overflow-hidden bg-plum-950 sm:rounded-xl">
                  <video
                    ref={videoRef}
                    key={tutorial.id}
                    src={tutorial.video}
                    poster={posterBroken ? undefined : tutorial.poster}
                    playsInline
                    muted
                    preload="metadata"
                    // Autoplay is movement nobody asked for when motion is reduced.
                    autoPlay={!reduced}
                    disablePictureInPicture
                    aria-hidden={failed}
                    onClick={toggle}
                    onPlay={sync}
                    onPlaying={() => {
                      disarm();
                      sync();
                    }}
                    onPause={() => {
                      disarm();
                      sync();
                    }}
                    onLoadedMetadata={sync}
                    onCanPlay={disarm}
                    onWaiting={arm}
                    onStalled={arm}
                    onProgress={() => {
                      if (watchdog.current) arm();
                    }}
                    onError={fail}
                    onEnded={() => {
                      wanted.current = false;
                      sync();
                      markWatched();
                    }}
                    onTimeUpdate={(event) => {
                      sync();
                      const video = event.currentTarget;
                      if (video.duration > 0 && video.currentTime / video.duration >= 0.9) markWatched();
                    }}
                    className={`block h-full w-full ${failed ? "invisible" : "cursor-pointer"}`}
                  />
                  {failed && (
                    <div className="absolute inset-0 grid place-items-center bg-plum-950 p-4 text-center">
                      <div>
                        <p id={errorId} className="text-[14px] font-semibold text-white">
                          This video did not load
                        </p>
                        <p className="mt-1 text-[13px] text-white/75">
                          The steps <span className="lg:hidden">below</span>
                          <span className="hidden lg:inline">beside it</span> cover everything it shows.
                        </p>
                        <button
                          ref={retryRef}
                          type="button"
                          onClick={retry}
                          aria-describedby={errorId}
                          className="c-tap mt-3 inline-flex h-11 items-center gap-1.5 rounded-lg bg-white px-4 text-[13px] font-semibold text-plum-950 transition-colors hover:bg-mist-100 sm:h-8 sm:px-3"
                        >
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                          Retry
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 px-2 pt-1 sm:gap-3 sm:px-0 sm:pt-2">
                  <button
                    ref={toggleRef}
                    type="button"
                    onClick={toggle}
                    disabled={failed}
                    aria-label={clip.ended ? "Play again" : clip.paused ? "Play" : "Pause"}
                    title={clip.ended ? "Play again" : clip.paused ? "Play (K)" : "Pause (K)"}
                    className={CONTROL}
                  >
                    {clip.ended ? (
                      <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    ) : clip.paused ? (
                      <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                    ) : (
                      <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                    )}
                  </button>
                  <span className="c-num w-[4.75rem] shrink-0 text-[12px] text-slate-600">{position}</span>
                  <input
                    type="range"
                    min={0}
                    max={clip.duration || 1}
                    step={0.5}
                    value={clip.time}
                    disabled={failed}
                    onChange={(event) => seek(Number(event.target.value))}
                    aria-label="Position in the video"
                    aria-valuetext={position.replace(" / ", " of ")}
                    className="h-11 min-w-0 flex-1 cursor-pointer accent-wine-600 disabled:cursor-not-allowed sm:h-8"
                  />
                  <button
                    type="button"
                    onClick={fullscreen}
                    disabled={failed}
                    aria-label="Full screen"
                    title="Full screen (F)"
                    className={CONTROL}
                  >
                    <Maximize2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <section
                aria-labelledby={stepsHeadingId}
                className="flex min-h-24 flex-1 flex-col border-t border-mist-100 pt-3 sm:mx-5 sm:mt-2 sm:max-h-64 lg:relative lg:m-0 lg:max-h-none lg:border-t-0 lg:pt-0"
              >
                <div className="flex min-h-0 flex-1 flex-col lg:absolute lg:inset-0">
                  <h3
                    id={stepsHeadingId}
                    className="shrink-0 px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:px-0"
                  >
                    Steps
                  </h3>
                  <ol
                    id={stepsId}
                    ref={listRef}
                    onScroll={measure}
                    onWheel={holdFollow}
                    onTouchMove={holdFollow}
                    onPointerDown={(event) => {
                      // A press on the list itself, not a step, is a grab of its scrollbar.
                      if (event.target === event.currentTarget) holdFollow();
                    }}
                    onKeyDown={(event) => {
                      if (["PageUp", "PageDown", "Home", "End"].includes(event.key)) holdFollow();
                    }}
                    className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2 sm:-mx-2.5 sm:px-0 ${moreBelow ? "[mask-image:linear-gradient(to_bottom,black_calc(100%_-_2rem),transparent)]" : ""}`}
                  >
                    {steps.map((step, index) => (
                      <li key={step.at}>
                        <StepRow
                          index={index}
                          title={step.title}
                          line={step.line}
                          at={step.at}
                          state={index === current ? "current" : index < current ? "past" : "next"}
                          onJump={failed ? null : () => jump(index)}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-mist-100 px-4 pt-3 pb-[calc(1rem+var(--safe-b))] sm:mt-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4">
              {canTry && trying.state === "failed" ? (
                <p role="alert" className="min-w-0 flex-1 text-[13px] font-medium leading-relaxed text-red-700">
                  Could not save that you watched this.{" "}
                  <button
                    type="button"
                    onClick={() => tryNow(false)}
                    className="c-tap font-semibold underline underline-offset-2 hover:text-red-800"
                  >
                    Try saving again
                  </button>
                  , or continue without it.
                </p>
              ) : canTry ? (
                <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
                  {trying.state === "saving"
                    ? `Saving that you watched this, then opening ${screenLabel}.`
                    : `Try it now opens ${screenLabel} and points at each step as you go.`}
                </p>
              ) : (
                <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] leading-relaxed text-slate-600">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
                  {touch
                    ? "Watch it here, then try it on a computer. The studio it uses only opens on a wide screen."
                    : "Widen the window to try this one. The studio it uses only opens on a wide screen."}
                </p>
              )}
              <div className="flex shrink-0 items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                <Dialog.Close asChild>
                  <Button variant="ghost">{canTry ? "Not now" : "Close"}</Button>
                </Dialog.Close>
                {canTry && (
                  // Never disabled while saving, so focus stays on it; a second press is ignored.
                  <Button onClick={() => tryNow(trying.state === "failed")}>
                    {trying.state === "saving" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" strokeWidth={2.2} aria-hidden="true" />
                        Saving
                      </>
                    ) : (
                      <>
                        {trying.state === "failed" ? "Continue anyway" : done ? "Try it again" : "Try it now"}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <p className="sr-only" aria-live="polite">
              {narration}
            </p>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepRow({
  index,
  title,
  line,
  at,
  state,
  onJump,
}: {
  index: number;
  title: string;
  line: string;
  at: number;
  state: "past" | "current" | "next";
  /** Null when the video failed: the text stays, the seeking goes. */
  onJump: (() => void) | null;
}) {
  const body = (
    <>
      <span
        className={`c-num mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors ${
          state === "current" ? "bg-wine-600 text-white" : "bg-mist-100 text-slate-600"
        }`}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[14px] font-semibold leading-snug sm:text-[13px] ${
            state === "past" ? "text-slate-600" : "text-plum-950"
          }`}
        >
          <span className="sr-only">Step {index + 1}: </span>
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-slate-600">{line}</span>
      </span>
      {onJump && (
        <span className="c-num mt-px shrink-0 text-[12px] text-slate-550" aria-hidden="true">
          {clock(Math.floor(at))}
        </span>
      )}
    </>
  );

  const box = `flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${
    state === "current" ? "bg-wine-50" : ""
  }`;

  if (!onJump) return <div className={box}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={`Step ${index + 1}: ${title}. ${line} Plays from ${spokenDuration(Math.floor(at)) || "the start"}.`}
      aria-current={state === "current" ? "step" : undefined}
      className={`${box} transition-colors ${state === "current" ? "" : "hover:bg-mist-50"}`}
    >
      {body}
    </button>
  );
}
