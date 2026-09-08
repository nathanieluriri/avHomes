"use client";

import type { DesignNote, NoteStatus } from "@avhomes/contracts";
import type { ApiError } from "@/lib/admin/client";
import { Badge, ErrorNote, type Tone } from "@/components/admin/ui";
import { MarkLayer } from "./marks";

/**
 * The notes list: a filter strip, then one card per note.
 *
 * Lifted out of the studio's desktop aside because it is the half of the studio
 * a phone can actually run. Taking a note means photographing a whole desktop
 * page inside the browser, which a phone can neither show at the right width
 * nor hold in memory; reading one, replying to it and moving it along is a list
 * and a sheet. So the same panel is the aside at `lg` and up and the body of
 * the wide-screen gate below it.
 *
 * IT TAKES ITS HEIGHT FROM ITS PARENT rather than deciding one. Inside the
 * full-height aside the caller passes `flex-1`, so the list becomes its own
 * scroller under a pinned filter strip. Inside the gate it is passed nothing,
 * so the panel grows and the document scrolls, which is the right answer when
 * the panel is the only thing on the screen and a nested scroller would trap
 * the flick that was meant for the page.
 *
 * The responsive line here is `lg`, not `sm`, and that is deliberate. This
 * panel does not change shape at 640px: it changes shape at the gate, where it
 * stops being a 320px column beside a mouse and becomes the whole width under a
 * thumb. Sizing it against `lg` keeps those two facts as one number.
 */

const TONE: Record<NoteStatus, Tone> = {
  open: "wine",
  "in-progress": "amber",
  done: "green",
  declined: "neutral",
};

const LABEL: Record<NoteStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  done: "Done",
  declined: "Not doing",
};

export function NotesPanel({
  notes,
  filter,
  setFilter,
  selected,
  setSelected,
  loading,
  error,
  reload,
  className = "",
}: {
  notes: DesignNote[];
  filter: NoteStatus | "all";
  setFilter: (next: NoteStatus | "all") => void;
  /** Drawn as the current row. Below `lg` the review sheet opens over this
   *  list rather than replacing it, so the card it came from has to stay
   *  findable underneath. */
  selected: DesignNote | null;
  setSelected: (note: DesignNote | null) => void;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  className?: string;
}) {
  const visible = notes.filter((note) => filter === "all" || note.status === filter);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="shrink-0 border-b border-mist-200 p-3">
        {/* The fade is what is left to say the strip scrolls once the scrollbar
            is hidden, and it is only true below `lg`: the four pills fit the
            aside at their dense size, so the mask would be dimming the last one
            for nothing. The opt-out is `c-scroll-fade--from-lg` and not a
            `lg:[mask-image:none]`, because console.css is unlayered and a
            Tailwind utility is not, so the variant could never win. */}
        <div className="no-scrollbar c-scroll-fade c-scroll-fade--from-lg -mx-1 flex gap-1 overflow-x-auto px-1">
          {(["open", "in-progress", "done", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`h-11 shrink-0 rounded-lg px-4 text-[13px] font-medium transition-colors lg:h-7 lg:px-2.5 ${
                filter === value
                  ? "bg-plum-950 text-white"
                  : "text-slate-600 hover:bg-mist-100 hover:text-plum-950"
              }`}
            >
              {value === "all" ? "All" : LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {/* The list is its own scroller only in the aside, which has a height to
          scroll against. Under the gate it is a plain block that grows, so the
          flick belongs to the document rather than being eaten by a nested
          scroller on the one screen where the panel IS the page. */}
      <div className="min-h-0 p-3 lg:flex-1 lg:overflow-y-auto">
        {loading && <p className="py-8 text-center text-[13px] text-slate-600">Loading</p>}
        {error && <ErrorNote error={error} onRetry={reload} />}
        {!loading && visible.length === 0 && (
          <div className="px-2 py-10 text-center">
            <p className="text-[13px] font-semibold text-plum-950">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-[15rem] text-[12px] leading-relaxed text-slate-600">
              Switch to Mark up, scroll to something that bothers you, and freeze
              the screen.
            </p>
          </div>
        )}
        <ul className="space-y-2">
          {visible.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setSelected(note)}
                aria-current={selected?.id === note.id ? "true" : undefined}
                className={`w-full rounded-xl border p-2 text-left transition-colors ${
                  selected?.id === note.id
                    ? "border-wine-500 bg-wine-50/60"
                    : "border-mist-200 hover:border-wine-500 hover:bg-wine-50/40"
                }`}
              >
                <div
                  className="relative mb-2 overflow-hidden rounded-lg bg-mist-100"
                  style={{ aspectRatio: `${note.shotWidth} / ${note.shotHeight}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={note.shotUrl}
                    alt=""
                    loading="lazy"
                    className="block h-full w-full object-cover object-top"
                  />
                  <MarkLayer marks={note.marks} width={note.shotWidth} height={note.shotHeight} />
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={TONE[note.status]}>{LABEL[note.status]}</Badge>
                  {/* The path wraps rather than truncating below `lg`. A path
                      IS the answer to "which screen is this about", and a
                      picture of a desktop page rendered 320px wide is not going
                      to answer it instead. */}
                  <span className="min-w-0 text-[12px] text-slate-550 [overflow-wrap:anywhere] lg:truncate lg:text-[11px]">
                    {note.path}
                  </span>
                </div>
                {/* Three lines under the gate, two in the aside. On a phone the
                    thumbnail is unreadable, so the sentence is the note. */}
                <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-plum-950 lg:line-clamp-2">
                  {note.comment}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
