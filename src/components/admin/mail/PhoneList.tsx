"use client";

import { useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, Check, Paperclip, Star } from "lucide-react";
import type { MailFolder, MailMessageSummary } from "@avhomes/contracts";
import { folderLabel, hasFiles, initialOf, listDate, toneOf, who } from "./shared";

/** A press held still for 450ms. `consume` says whether the click that follows belongs to it. */
function useLongPress(onLong: () => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        fired.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        cancel();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(12);
          onLong();
        }, 450);
      },
      onPointerMove: (event: PointerEvent) => {
        const o = origin.current;
        if (o && Math.hypot(event.clientX - o.x, event.clientY - o.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      // Android raises the context menu on the same hold.
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    },
    consume: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}

/** Gmail's app row: avatar, sender and date, subject and star. */
export function PhoneRow({
  message: m,
  folder,
  selected,
  selecting,
  onToggle,
  onOpen,
  onStar,
}: {
  message: MailMessageSummary;
  /** Set on Starred, which mixes folders. */
  folder: MailFolder | null;
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onStar: () => void;
}) {
  const press = useLongPress(onToggle);
  const sender = who(m);
  const strong = m.unseen ? "font-semibold text-plum-950" : "font-normal text-slate-600";

  return (
    <li
      className={`relative flex select-none items-start gap-3 px-3 py-2.5 transition-colors [-webkit-touch-callout:none] ${
        selected ? "bg-wine-100/80" : "active:bg-mist-100"
      }`}
    >
      <button
        type="button"
        aria-label={`${selected ? "Deselect" : "Select"} ${m.subject || "(no subject)"}`}
        aria-pressed={selected}
        onClick={onToggle}
        className={`c-tap relative z-[1] mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white transition-transform ${
          selected ? "bg-wine-700" : toneOf(m.from?.address ?? sender)
        }`}
      >
        {selected ? <Check className="h-5 w-5" aria-hidden="true" /> : initialOf(sender)}
      </button>

      {/* The whole row is this button, through its ::before; the avatar and star sit above it. */}
      <button
        type="button"
        {...press.handlers}
        onClick={() => {
          if (press.consume()) return;
          if (selecting) onToggle();
          else onOpen();
        }}
        className="min-w-0 flex-1 text-left before:absolute before:inset-0 before:content-['']"
      >
        <span
          className={`block truncate text-[15px] ${m.unseen ? "font-semibold text-plum-950" : "font-medium text-plum-900"}`}
        >
          {sender}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {folder && (
            <span className="shrink-0 rounded bg-mist-100 px-1.5 py-px text-[11px] font-medium text-slate-600">
              {folderLabel(folder, folder.path)}
            </span>
          )}
          <span className={`min-w-0 flex-1 truncate text-[13.5px] ${strong}`}>{m.subject || "(no subject)"}</span>
          {hasFiles(m) && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-label="Has attachments" />}
        </span>
        <span className="sr-only">{m.unseen ? "Unread" : "Read"}</span>
      </button>

      {/* Date over star, as the app draws them. Taps fall through to the row except on the star. */}
      <span className="pointer-events-none relative z-[1] -mr-1 flex shrink-0 flex-col items-end">
        <span className={`flex items-center gap-1.5 pr-1 pt-0.5 text-[12px] ${m.unseen ? "font-semibold text-wine-700" : "text-slate-600"}`}>
          {m.unseen && <span className="h-2 w-2 rounded-full bg-wine-600" aria-hidden="true" />}
          {listDate(m.date)}
        </span>
        <button
          type="button"
          aria-label={m.flagged ? "Starred. Remove star" : "Not starred. Star"}
          aria-pressed={m.flagged}
          onClick={onStar}
          className="c-tap pointer-events-auto grid h-8 w-8 place-items-center rounded-full"
        >
          <Star className={`h-5 w-5 ${m.flagged ? "fill-amber-400 text-amber-500" : "text-mist-400"}`} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

/** Takes the search bar's place while rows are selected. */
export function SelectionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={`${count} selected`}
      className="absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-0.5 border-b border-mist-200 bg-white px-1.5 shadow-card"
    >
      <button
        type="button"
        aria-label="Clear selection"
        title="Clear selection"
        onClick={onClear}
        className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-full text-plum-950 hover:bg-mist-100"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1 truncate pl-1 text-[17px] font-semibold tabular-nums text-plum-950">{count}</span>
      {children}
    </div>
  );
}
