"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import { searchPlaces, type Place } from "@/lib/locations";

/**
 * The location box on both search bars.
 *
 * A real combobox rather than an input with a menu glued under it: the wiring
 * below (`aria-activedescendant` moving while focus stays in the field, options
 * that are `aria-selected`, Escape closing without clearing) is what a screen
 * reader needs to announce the suggestions at all.
 *
 * ENTER IS THE AWKWARD KEY. This lives inside a form whose submit navigates to
 * the results, so Enter has to mean "take the highlighted suggestion" while the
 * list is open and "search for what I typed" once it is not, and the first case
 * has to stop the submit or the user never sees their own choice applied.
 */
export default function LocationInput({
  value,
  onChange,
  placeholder,
  className,
  wrapperClassName = "flex flex-1 items-center gap-2.5 px-4 py-2",
  onPick,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  /** The two search bars pad this row differently; the rest is identical. */
  wrapperClassName?: string;
  /** Fires only on an explicit pick, so a caller can submit on click. */
  onPick?: (place: Place) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** A pick sets the value, which would immediately re-open the list. */
  const silence = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo(() => (open ? searchPlaces(value) : []), [open, value]);

  useEffect(() => {
    if (silence.current) {
      silence.current = false;
      return;
    }
    setOpen(value.trim().length > 0);
    setActive(-1);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(place: Place) {
    silence.current = true;
    onChange(place.name);
    setOpen(false);
    setActive(-1);
    onPick?.(place);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // Closes the list, keeps the text. Clearing the field on Escape loses
      // work the user typed and is a well documented way to annoy people.
      if (open) e.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown" && value.trim()) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Tab" && active >= 0) {
      pick(matches[active]);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${wrapperClassName}`}>
      <MapPin className="h-4 w-4 shrink-0 text-wine-600" strokeWidth={1.8} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => value.trim() && setOpen(true)}
        placeholder={placeholder}
        aria-label="Search by location"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={
          className ??
          "w-full bg-transparent text-sm text-plum-950 outline-none placeholder:text-slate-500"
        }
      />

      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-2xl border border-mist-200 bg-white py-1.5"
        >
          {matches.map((place, i) => (
            <li
              key={`${place.name}-${place.area}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Pointer down, not click: click lands after blur, by which point
              // the outside-click handler has already closed the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(place);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2 text-sm transition-colors ${
                i === active ? "bg-wine-50" : ""
              }`}
            >
              <span className="block font-medium text-plum-950">{place.name}</span>
              <span className="block text-xs text-slate-500">
                {place.area === "State" ? place.state : `${place.area} · ${place.state}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
