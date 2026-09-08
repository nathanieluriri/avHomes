"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MousePointerClick, Pencil, RefreshCw, Type, X } from "lucide-react";
import type { DesignNote, NoteStatus } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useIsNarrow } from "@/lib/admin/hooks";
import { Card } from "@/components/admin/ui";
import { WideScreenGate } from "@/components/admin/WideScreenGate";
import { Markup, type Capture } from "@/components/admin/studio/Markup";
import { NoteReview } from "@/components/admin/studio/NoteReview";
import { NotesPanel } from "@/components/admin/studio/NotesPanel";

/**
 * The customize studio.
 *
 * The site, in a frame, with three things you can do to it: look at it, circle
 * something and say what is wrong, or rewrite a piece of copy. Everything
 * produced is a NOTE, and every note carries a sentence, because a circle
 * without one is a developer guessing what the circle meant.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FRAME IS THE REAL SITE, NOT A COPY OF IT.
 *
 * An iframe of the live pages, same origin, so what somebody marks up is exactly
 * what a visitor sees, including whatever shipped an hour ago. Anything else, a
 * gallery of stored screenshots or a rebuilt preview, is a second version of the
 * site to keep in sync, and the day it drifts the studio starts collecting
 * feedback about a page that no longer exists.
 *
 * Same origin is also what makes the capture possible at all: the picture is
 * taken by reading the frame's own document, which a cross-origin frame would
 * refuse.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A TAKEOVER, like the writing studio, and for the same reason: the console's
 * rail and 66rem sheet would leave the site rendered as a postcard inside a
 * column. `ConsoleShell` steps aside for this path and the bar below carries the
 * way out.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BELOW `lg` THE AUTHORING HALF IS GATED AND THE READING HALF IS NEW.
 *
 * Three facts, all of them visible in this file, and not one of them a layout
 * problem that a breakpoint could solve. `takeShot` sizes the picture from
 * `win.innerWidth`, so a note taken on a phone permanently stores a 390px
 * picture of the MOBILE site while the reviewer reading it later believes they
 * marked up "the site": that is wrong data, not a wrong layout. The capture
 * clones the whole document and inlines every stylesheet and every image as a
 * data URI, which the comment on `takeShot` measures at 23 seconds and then 11
 * on a desktop dev server, and which is exactly the workload that gets a mobile
 * Safari tab killed at its memory ceiling. And the drawing surface is
 * `touch-none` across nearly its full width, so a finger that lands on the
 * picture cannot reach the comment box under it.
 *
 * So the narrow branch renders the gate with the notes panel under it, and it
 * ships MORE than this screen had before rather than less: reading a note, its
 * picture, its comment and its event trail, replying to it, moving it between
 * statuses and deleting it are all new on a phone.
 *
 * THE BRANCH IS `useIsNarrow`, NEVER A CSS `hidden`. A hidden subtree still
 * mounts, and a mounted iframe pulls the entire marketing site and its
 * photography onto the phone, which is the precise cost the gate exists to
 * avoid.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Mode = "browse" | "markup" | "copy";

/** The pages worth starting from. The frame can navigate anywhere from here. */
const START_PAGES = [
  { path: "/", label: "Home" },
  { path: "/listings", label: "Listings" },
  { path: "/posts", label: "Journal" },
  { path: "/contact", label: "Contact" },
  { path: "/about", label: "About" },
];

export default function CustomizePage() {
  const [mode, setMode] = useState<Mode>("browse");
  const [path, setPath] = useState("/");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DesignNote | null>(null);
  const [filter, setFilter] = useState<NoteStatus | "all">("open");

  const isNarrow = useIsNarrow();
  const frame = useRef<HTMLIFrameElement>(null);

  const { data, error, loading, reload } = useAsync<{ items: DesignNote[] }>(
    (signal) => api.get<{ items: DesignNote[] }>("/admin/notes?limit=100", signal),
    [],
  );
  const [notes, setNotes] = useState<DesignNote[]>([]);
  const [seeded, setSeeded] = useState(false);
  /* Adopted during render rather than in an effect: the list is server state
     the panel then edits locally, and an effect would paint the stale copy for
     a frame on every reload. */
  if (!seeded && data) {
    setNotes(data.items);
    setSeeded(true);
  }

  /* The object URL for a capture is revoked when the capture is replaced or
     dropped. Without this every markup session leaks a full page PNG for as
     long as the tab lives. */
  useEffect(() => {
    if (!capture) return;
    const url = capture.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [capture]);

  const onThisPage = notes.filter((note) => note.path === path && note.status !== "done").length;
  const openCount = notes.filter((note) => note.status === "open").length;

  /**
   * Freezes the frame's current view as a PNG.
   *
   * Imported lazily, because the capture library is the single largest thing
   * this screen can pull in and most sessions are somebody reading notes rather
   * than taking a new one.
   */
  const takeShot = useCallback(async (copyBefore?: string) => {
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!win || !doc?.documentElement) {
      setCaptureError("The page has not finished loading yet.");
      return;
    }
    setCapturing(true);
    setCaptureError(null);
    try {
      const { domToBlob } = await import("modern-screenshot");
      /*
       * The picture is the size of the FRAME'S OWN WINDOW, which is why this
       * screen is gated below `lg`. The width taken here is stored on the note
       * forever and is what every later reader is shown, so a capture made in a
       * 390px frame is a permanent record of the mobile site filed under a
       * comment about "the site". A breakpoint cannot fix that; only not
       * offering the button can.
       */
      const width = win.innerWidth;
      const height = win.innerHeight;
      /*
       * THE VISIBLE SLICE, not the whole document.
       *
       * A marketing page is several thousand pixels tall, and a note about the
       * hero should not carry a picture of the footer. The clone is rendered at
       * viewport size and shifted up by the scroll position, which yields
       * exactly what is on screen.
       *
       * IT IS SLOW, AND THAT IS INHERENT RATHER THAN A BUG TO FIX HERE.
       * Measured on the home page against the dev server: about 23 seconds the
       * first time and 11 after, because the library clones the WHOLE document,
       * inlines every stylesheet and every image as a data URI, and only then
       * crops to the slice above. Production images are optimised and cached, so
       * it is faster there, but this is never instant. The button says
       * "Freezing" and the banner warns, because a spinner with no explanation
       * at eleven seconds reads as a hang. It is also the second reason this
       * screen is gated: base64-inlining a page full of photography is what
       * takes a phone browser to its memory ceiling.
       *
       * `timeout` is the one figure worth tuning: it bounds how long a single
       * unreachable font or image can stall the whole capture. Measured, it
       * changes nothing on a healthy page and saves twelve seconds on a sick
       * one.
       */
      const blob = await domToBlob(doc.documentElement, {
        width,
        height,
        backgroundColor: "#ffffff",
        timeout: 3000,
        style: {
          transform: `translateY(-${win.scrollY}px)`,
          transformOrigin: "top left",
        },
      });
      /*
       * A zero-byte blob is the library's way of failing, not an exception. It
       * happens when the frame has no layout to photograph (a hidden tab, a
       * document that has not painted), and storing it would give the note a
       * picture that renders as nothing at all.
       */
      if (!blob || blob.size === 0) {
        throw new Error("the page had nothing to photograph yet");
      }
      setCapture({
        previewUrl: URL.createObjectURL(blob),
        blob,
        width,
        height,
        path: doc.location.pathname,
        ...(copyBefore !== undefined ? { copyBefore } : {}),
      });
    } catch (err) {
      /*
       * Named rather than swallowed. Capture reads every stylesheet and inlines
       * every image in the frame, and the honest failure modes (a font that will
       * not fetch, an image from a host with no CORS header) produce a blank or
       * broken picture rather than an exception. Saying so beats a note whose
       * anchor is a white rectangle.
       */
      setCaptureError(
        `Could not take the picture. ${err instanceof Error ? err.message : "Unknown reason."}`,
      );
    } finally {
      setCapturing(false);
    }
  }, []);

  /**
   * Copy mode: one click in the frame picks the text under the pointer.
   *
   * Bound INSIDE the frame's document on every load, and torn down with it. The
   * listener is capturing and cancels the event, so clicking a headline that
   * happens to be inside a link picks the words instead of navigating away from
   * the page being reviewed.
   */
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || mode !== "copy") return;

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const text = (target.innerText ?? "").trim();
      if (text === "") return;
      void takeShot(text.slice(0, 4000));
    }

    doc.addEventListener("click", onClick, true);
    doc.body?.classList.add("studio-picking");
    return () => {
      doc.removeEventListener("click", onClick, true);
      doc.body?.classList.remove("studio-picking");
    };
  }, [mode, path, takeShot]);

  /* One set of props, two mounts: the aside at `lg` and up, the gate's body
     below it. Only the second gets no height of its own, so the document
     scrolls rather than a panel inside it. */
  const panelProps = { notes, filter, setFilter, selected, setSelected, loading, error, reload };

  const review = selected && (
    <NoteReview
      note={selected}
      asSheet={isNarrow}
      onChange={(next) => {
        setSelected(next);
        setNotes((all) => all.map((n) => (n.id === next.id ? next : n)));
      }}
      onDeleted={(id) => {
        setNotes((all) => all.filter((n) => n.id !== id));
        setSelected(null);
      }}
      onClose={() => setSelected(null)}
    />
  );

  if (isNarrow) {
    return (
      <>
        <WideScreenGate
          feature="the customize studio"
          why="Marking up the site means photographing a whole desktop page inside the browser and drawing on the picture, and a phone can only show you the phone version of that page and cannot hold the photograph."
          backHref="/admin"
          backLabel="Back to the console"
        >
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Notes so far
            </h2>
            {/* The count lives HERE below `lg`, beside the notes it counts,
                rather than in the studio header where it used to sit over a
                panel a phone could not open. Say plainly what half of the
                screen this is: a number with no route to it is worse than no
                number. */}
            <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
              {loading
                ? "Loading the notes."
                : `${openCount === 1 ? "1 note is" : `${openCount} notes are`} open across the site.`}{" "}
              You can read them here, reply, move one along and delete it. Taking a
              new one needs the wider screen.
            </p>
            {/* `padded={false}`: the panel owns its own padding, and the card's
                would put a second gutter around a list that already has one. */}
            <Card padded={false} className="mt-3 overflow-hidden">
              <NotesPanel {...panelProps} />
            </Card>
          </section>
        </WideScreenGate>

        {/* Over the list, not instead of it, so closing a note lands back on the
            row it was opened from. */}
        {review}
      </>
    );
  }

  return (
    /* `h-dvh`, not `h-screen`. `vh` is the LARGE viewport, measured with the
       browser's URL bar retracted, so a fixed non-scrolling column sized against
       it is taller than what is visible and runs its own bottom edge under the
       toolbar with no scroller left to recover it. */
    <div className="flex h-dvh flex-col bg-mist-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-mist-200 bg-white px-3 py-2">
        {/* An EXIT, not a back arrow. The studio covers the whole window, so the
            rail and breadcrumb that would say where you are are both gone.

            The `.c-tap` on this row's 32px controls is not dead weight above
            `lg`: a tablet in landscape is a coarse pointer at 1024px, and it is
            inert with a mouse. */}
        <Link
          href="/admin"
          className="c-tap flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-plum-950 transition-colors hover:bg-mist-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Exit customize
        </Link>

        <div className="mx-1 h-5 w-px bg-mist-200" />

        <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
          <span className="sr-only">Page</span>
          <select
            value={START_PAGES.some((p) => p.path === path) ? path : "custom"}
            onChange={(event) => setPath(event.target.value)}
            className="h-8 w-full rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-plum-950 outline-none focus:border-wine-500"
          >
            {START_PAGES.map((page) => (
              <option key={page.path} value={page.path}>
                {page.label}
              </option>
            ))}
            <option value="custom" disabled>
              {path}
            </option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            const win = frame.current?.contentWindow;
            if (win) win.location.reload();
          }}
          aria-label="Reload the page"
          className="c-tap grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>

        <div role="group" aria-label="Mode" className="flex items-center gap-1">
          <ModeButton
            active={mode === "browse"}
            onClick={() => setMode("browse")}
            icon={MousePointerClick}
            label="Browse"
            hint="Click around the site normally"
          />
          <ModeButton
            active={mode === "markup"}
            onClick={() => setMode("markup")}
            icon={Pencil}
            label="Mark up"
            hint="Freeze the screen and circle something"
          />
          <ModeButton
            active={mode === "copy"}
            onClick={() => setMode("copy")}
            icon={Type}
            label="Edit copy"
            hint="Click any words to suggest new ones"
          />
        </div>

        {mode === "markup" && (
          <button
            type="button"
            onClick={() => void takeShot()}
            disabled={capturing}
            className="c-tap c-bevel-primary inline-flex h-8 items-center gap-1.5 rounded-lg bg-wine-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-wine-700"
          >
            {capturing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {capturing ? "Freezing, a few seconds" : "Freeze this screen"}
          </button>
        )}

        {/* The count is only drawn in this branch, and that is the honest
            version of it: the panel holding those notes is on the same screen,
            one Close away at worst. Below `lg` the same fact is restated inside
            the gate, over the list a phone can actually open. */}
        <span className="ml-auto text-[12px] text-slate-600">
          {onThisPage > 0 ? `${onThisPage} open on this page` : "Nothing open here"}
        </span>
      </header>

      {mode !== "browse" && (
        <p className="shrink-0 bg-wine-50 px-4 py-1.5 text-center text-[12px] font-medium text-wine-700">
          {mode === "markup"
            ? "Scroll to what you mean, then press Freeze this screen. It takes a few seconds on a page full of photos."
            : "Click any words on the page to suggest a change."}
        </p>
      )}
      {captureError && (
        <p className="shrink-0 bg-red-50 px-4 py-1.5 text-center text-[12px] text-red-700">
          {captureError}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-white">
          <iframe
            ref={frame}
            /* Keyed on the path so choosing a page is a fresh document rather
               than a mutation of the current one, which keeps the copy-mode
               listener's teardown honest. */
            key={path}
            src={path}
            title="The site"
            className="h-full w-full border-0"
          />
          {/*
            In copy mode the frame stays interactive, because the click IS the
            interaction. In markup mode the freeze happens from the toolbar and
            the frame is left alone, so somebody can scroll to what they mean.
          */}
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-mist-200 bg-white lg:flex">
          {/* The aside SWAPS between the list and the review, because at 320px
              there is no room for both. Below `lg` they stack instead: the
              review comes up as a sheet over the list. */}
          {selected ? review : <NotesPanel {...panelProps} className="flex-1" />}
        </aside>
      </div>

      {capture && (
        <Markup
          capture={capture}
          onCancel={() => setCapture(null)}
          onSaved={(note) => {
            setNotes((all) => [note, ...all]);
            setCapture(null);
            setMode("browse");
            setSelected(note);
          }}
        />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Pencil;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      onClick={onClick}
      /* `.c-tap` despite the `gap-1` beside its neighbours: the halo is
         `max(100%, 44px)` per axis, and these are drawn wider than 44px, so it
         only grows downwards and upwards where nothing sits. */
      className={`c-tap flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
        active ? "bg-plum-950 text-white" : "text-slate-600 hover:bg-mist-100 hover:text-plum-950"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
