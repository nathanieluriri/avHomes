"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import { useMediaQuery } from "@/lib/admin/hooks";
import { clock, stepAt, type HelpStep, type HelpTopic } from "@/lib/marketer/help";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

/**
 * The video, full bleed in the app's own sheet, with every step written under it.
 *
 * The steps are not a nicety. The captions burned into the picture are a few
 * pixels tall on a phone, so the list under it is the narration, it is the whole
 * sheet before the video has been rendered, and it is what remains when the
 * video will not load.
 *
 * Its own controls rather than the browser's, for the reason the console gives:
 * a native bar offers a mute button on a video with no sound, and it holds
 * keyboard focus inside the video where Escape never reaches the sheet.
 *
 * Mounted only while it is open, so the state below resets with the sheet and no
 * <video> sits on the help screen quietly fetching metadata for a closed panel.
 */

// No data at all for this long after a stall, and the video is called dead.
const STALL_MS = 10_000;

// A sheet with no video has no end to reach, so this long open counts as read.
const READ_MS = 4000;

const CONTROL =
  "m-press m-press-light m-tap grid h-10 w-10 shrink-0 place-items-center rounded-full text-m-text disabled:text-m-faint";

export function VideoSheet({
  topic,
  posterBroken,
  onClose,
  onWatched,
}: {
  topic: HelpTopic;
  /** The card's poster already failed, so the video does not ask for it again. */
  posterBroken: boolean;
  onClose: () => void;
  /** Called once: the video reached the end, or the steps were open long enough. */
  onWatched: () => void;
}) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const videoRef = useRef<HTMLVideoElement>(null);
  const marked = useRef(false);
  // Whether the reader expects motion, so a stall while paused is not reported.
  const wanted = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(topic.seconds ?? 0);
  const [paused, setPaused] = useState(true);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  // The marketer's videos are recorded on a phone and land 1080x1920, so portrait
  // is the guess that avoids a jump. The file's own metadata corrects it.
  const [ratio, setRatio] = useState(9 / 16);

  const steps = topic.steps;
  const current = stepAt(steps, time);
  // No video, or one that died: the steps are the sheet, and time on them is the signal.
  const readOnly = topic.video === null || failed;

  function markWatched() {
    if (marked.current) return;
    marked.current = true;
    onWatched();
  }

  const onGone = useEffectEvent((openFor: number) => {
    if (readOnly && openFor >= READ_MS) markWatched();
  });

  useEffect(() => {
    const from = Date.now();
    const timer = watchdog;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      onGone(Date.now() - from);
    };
  }, []);

  function sync() {
    const video = videoRef.current;
    if (!video) return;
    setTime(video.currentTime);
    if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    if (video.videoWidth > 0 && video.videoHeight > 0) setRatio(video.videoWidth / video.videoHeight);
    setPaused(video.paused);
    setEnded(video.ended);
  }

  function disarm() {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  }

  function fail() {
    disarm();
    wanted.current = false;
    setFailed(true);
    setPaused(true);
  }

  /** Waiting or stalled: give the network its chance, then say so. */
  function arm() {
    disarm();
    watchdog.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && wanted.current && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) fail();
    }, STALL_MS);
  }

  function play() {
    const video = videoRef.current;
    if (!video || failed) return;
    wanted.current = true;
    video.play().catch((err: unknown) => {
      // A refused autoplay just leaves it paused. A format nothing can decode is dead.
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
    video.currentTime = Math.min(Math.max(to, 0), duration || video.duration || 0);
    sync();
  }

  function retry() {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    video.load();
    wanted.current = !reduced;
    if (!reduced) play();
  }

  function fullscreen() {
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!video || failed) return;
    if (typeof video.requestFullscreen === "function") void video.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.();
  }

  function jump(at: number) {
    seek(at);
    play();
  }

  const position = `${clock(Math.floor(time))} / ${clock(Math.round(duration))}`;

  return (
    <Sheet open onClose={onClose} title={topic.title} hint={topic.problem}>
      <div className="space-y-5">
        {topic.video !== null && (
          /* Full bleed: back out through the sheet's own side padding, so the
             picture gets every pixel of width a phone has. */
          <div className="-mx-4">
            {/* The band is the full width; the picture keeps its own shape inside
                it. A 9:16 phone recording is capped in height, or it would eat the
                whole sheet and push every step off the bottom. */}
            <div
              className="relative w-full overflow-hidden bg-[#0b0507]"
              // A dead video never reports its shape, and one sentence needs no portrait band.
              style={{ aspectRatio: failed ? 16 / 9 : ratio, maxHeight: "min(46dvh, 24rem)" }}
            >
              <video
                ref={videoRef}
                src={topic.video}
                poster={posterBroken ? undefined : (topic.poster ?? undefined)}
                playsInline
                // Silent films, and no phone browser starts one with sound anyway.
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
                className={`block h-full w-full object-contain ${failed ? "invisible" : ""}`}
              />
              {failed && (
                <div className="absolute inset-0 grid place-items-center bg-[#0b0507] px-5 text-center">
                  <div>
                    <p className="text-[14px] leading-relaxed text-white">
                      The video did not load. The steps below cover everything it shows.
                    </p>
                    <button
                      type="button"
                      onClick={retry}
                      className="m-btn m-btn--secondary m-tap mt-3 h-10 px-4 text-[14px]"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Gone rather than greyed when the video is dead: on a phone a row of
                controls that do nothing is noise under the one button that does. */}
            <div className={`${failed ? "hidden" : "flex"} items-center gap-2 px-4 pt-2`}>
              <button
                type="button"
                onClick={toggle}
                disabled={failed}
                aria-label={ended ? "Play again" : paused ? "Play" : "Pause"}
                className={CONTROL}
              >
                {ended ? (
                  <RotateCcw className="h-5 w-5" aria-hidden />
                ) : paused ? (
                  <Play className="h-5 w-5" fill="currentColor" aria-hidden />
                ) : (
                  <Pause className="h-5 w-5" fill="currentColor" aria-hidden />
                )}
              </button>
              <span className="m-num shrink-0 text-[12px] text-m-muted">{position}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.5}
                value={time}
                disabled={failed}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label="Position in the video"
                aria-valuetext={position.replace(" / ", " of ")}
                className="h-10 min-w-0 flex-1 accent-[#e0708e]"
              />
              <button
                type="button"
                onClick={fullscreen}
                disabled={failed}
                aria-label="Full screen"
                className={CONTROL}
              >
                <Maximize2 className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.07em] text-m-faint">
            Steps
          </h3>
          <ol className="space-y-0.5">
            {steps.map((step, index) => (
              <li key={`${index}-${step.title}`}>
                <StepRow
                  index={index}
                  step={step}
                  now={index === current}
                  onJump={step.at === null || failed ? null : () => jump(step.at ?? 0)}
                />
              </li>
            ))}
          </ol>
        </div>

        <Button variant="secondary" size="lg" full onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

function StepRow({
  index,
  step,
  now,
  onJump,
}: {
  index: number;
  step: HelpStep;
  /** The step the video is on. */
  now: boolean;
  /** Null when there is nothing to seek: the words stay, the tap goes. */
  onJump: (() => void) | null;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={`m-num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
          now ? "bg-[#c24a6b] text-white" : "bg-m-raised text-m-muted ring-1 ring-m-line"
        }`}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug text-m-text">
          <span className="sr-only">{`Step ${index + 1}: `}</span>
          {step.title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">{step.line}</span>
      </span>
    </>
  );

  const box = `flex w-full items-start gap-2.5 rounded-[14px] px-2 py-2 text-left ${
    now ? "bg-(--m-act-bg)" : ""
  }`;

  if (!onJump) return <div className={box}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onJump}
      aria-current={now ? "step" : undefined}
      className={`m-press m-press-light ${box}`}
    >
      {body}
    </button>
  );
}
