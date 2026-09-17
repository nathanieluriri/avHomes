"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { Calendar, endOfDay, startOfDay } from "./Calendar";
import { Button } from "./ui";

/**
 * From one day to another.
 *
 * One calendar, not two side by side: a phone has room for one month grid at a
 * readable tap size, and two half-width ones make every day a 20px target. So
 * the sheet asks for the first day, then the last, and says which it is waiting
 * for at the top.
 *
 * Picking a first day that is after the current last day clears the last day
 * rather than refusing. The reader is changing their mind about the range, not
 * making a mistake, and an error message would be the app arguing with them.
 */

export interface DateRange {
  /** Midnight on the first day, or null for no lower bound. */
  from: number | null;
  /** The last millisecond of the last day, or null. */
  to: number | null;
}

export const NO_RANGE: DateRange = { from: null, to: null };

export function rangeLabel(range: DateRange): string {
  const fmt = (at: number) =>
    new Date(at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
  if (range.from && range.to) {
    return startOfDay(range.from) === startOfDay(range.to)
      ? fmt(range.from)
      : `${fmt(range.from)} to ${fmt(range.to)}`;
  }
  if (range.from) return `From ${fmt(range.from)}`;
  if (range.to) return `Up to ${fmt(range.to)}`;
  return "Any date";
}

export function DateRangeSheet({
  open,
  onClose,
  value,
  onApply,
  earliest,
}: {
  open: boolean;
  onClose: () => void;
  value: DateRange;
  onApply: (range: DateRange) => void;
  /** The account's first day. Nothing happened before it, so nothing before it is offerable. */
  earliest?: number;
}) {
  if (!open) return null;
  /* The draft lives in the inner component, which only exists while the sheet is
     open, so closing it throws the abandoned draft away. That is React's own
     answer to "reset state when a prop changes" and it beats an effect writing
     state back on every open, which renders twice and fights the reader if they
     tap while it settles. */
  return <Picker onClose={onClose} value={value} onApply={onApply} earliest={earliest} />;
}

function Picker({
  onClose,
  value,
  onApply,
  earliest,
}: {
  onClose: () => void;
  value: DateRange;
  onApply: (range: DateRange) => void;
  earliest?: number;
}) {
  const [draft, setDraft] = useState<DateRange>(value);
  const [picking, setPicking] = useState<"from" | "to">("from");

  function pick(day: number) {
    if (picking === "from") {
      // A new start after the old end clears the end instead of refusing it.
      setDraft((was) => ({
        from: startOfDay(day),
        to: was.to !== null && was.to < endOfDay(day) ? null : was.to,
      }));
      setPicking("to");
      return;
    }
    if (draft.from !== null && day < draft.from) {
      // Tapped behind the start: read it as a new start rather than an error.
      setDraft({ from: startOfDay(day), to: null });
      return;
    }
    setDraft((was) => ({ ...was, to: endOfDay(day) }));
  }

  const anchor = picking === "from" ? draft.from : (draft.to ?? draft.from);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Pick a date range"
      hint={picking === "from" ? "Tap the first day" : "Now tap the last day"}
    >
      <div className="px-4 pb-1">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Leg
            label="First day"
            value={draft.from}
            on={picking === "from"}
            onClick={() => setPicking("from")}
          />
          <Leg
            label="Last day"
            value={draft.to}
            on={picking === "to"}
            onClick={() => setPicking("to")}
          />
        </div>

        <Calendar
          value={anchor}
          onPick={pick}
          min={earliest}
          label={picking === "from" ? "Choose the first day" : "Choose the last day"}
        />

        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              onApply(NO_RANGE);
              onClose();
            }}
          >
            Any date
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={draft.from === null && draft.to === null}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Show these
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Leg({
  label,
  value,
  on,
  onClick,
}: {
  label: string;
  value: number | null;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-[14px] px-3 py-2.5 text-left ${
        on ? "bg-m-raised ring-2 ring-[#a83550]" : "bg-m-raised"
      }`}
    >
      <span className="block text-[12px] font-semibold text-m-faint">{label}</span>
      <span className={`block text-[15px] ${value === null ? "text-m-faint" : "text-m-text"}`}>
        {value === null
          ? "Any"
          : new Date(value).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
      </span>
    </button>
  );
}
