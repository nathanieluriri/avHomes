"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { inputCls } from "./ui";

/**
 * Type to narrow, tap to pick.
 *
 * Built because a native `<select>` holding 284 Nigerian banks is not a control,
 * it is a punishment: on Android it opens a full-screen wheel with no search,
 * so finding Moniepoint means scrolling past two hundred microfinance banks
 * whose names you cannot skip to. Typing three letters is the whole feature.
 *
 * It is a real combobox rather than an input that happens to show a list:
 * `role="combobox"` with `aria-expanded` and `aria-activedescendant`, arrow keys
 * that move a highlight without moving focus out of the field, Enter to take the
 * highlighted row and Escape to abandon. A phone user never sees any of that and
 * a screen reader user cannot use the thing without it.
 *
 * Matching is "contains", not "starts with", because the bank somebody calls
 * "GTB" is listed as "Guaranty Trust Bank" and the one they call "First Bank"
 * is "First Bank of Nigeria".
 */

export interface Choice {
  value: string;
  label: string;
  /** A second line under the label. The city on a listing, nothing on a bank. */
  hint?: string;
  /** Right-aligned, for a price. */
  trailing?: string;
}

export function Combobox({
  value,
  options,
  onPick,
  placeholder,
  label,
  emptyText = "Nothing matched",
  invalid = false,
  loading = false,
  leading,
  typed: typedProp,
  onType,
}: {
  /** The chosen `value`, or "" for nothing chosen. */
  value: string;
  options: readonly Choice[];
  onPick: (choice: Choice | null) => void;
  placeholder: string;
  /** Names the field for assistive tech. The visible label is the caller's Field. */
  label: string;
  emptyText?: string;
  invalid?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  /**
   * Lift the typing out, for a list fetched per keystroke rather than filtered
   * in place. Given both, `options` is taken as already narrowed and the local
   * filter steps aside: filtering a server's answer a second time would hide
   * rows it matched on a field this component cannot see.
   */
  typed?: string;
  onType?: (next: string) => void;
}) {
  const listId = useId();
  const rowId = (index: number) => `${listId}-${index}`;
  const input = useRef<HTMLInputElement>(null);

  const chosen = options.find((option) => option.value === value) ?? null;
  const remote = onType !== undefined;
  const [ownTyped, setOwnTyped] = useState("");
  const typed = remote ? (typedProp ?? "") : ownTyped;
  const setTyped = (next: string) => (remote ? onType(next) : setOwnTyped(next));

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const shown = useMemo(() => {
    if (remote) return options.slice(0, 60);
    const needle = typed.trim().toLowerCase();
    if (needle === "") return options.slice(0, 60);
    const words = needle.split(/\s+/u);
    return options
      .filter((option) => {
        const hay = `${option.label} ${option.hint ?? ""}`.toLowerCase();
        return words.every((word) => hay.includes(word));
      })
      .slice(0, 60);
  }, [options, typed, remote]);

  function take(choice: Choice) {
    onPick(choice);
    setTyped("");
    setOpen(false);
    input.current?.blur();
  }

  function clear() {
    onPick(null);
    setTyped("");
    input.current?.focus();
  }

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((was) => {
        if (shown.length === 0) return 0;
        return (was + step + shown.length) % shown.length;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      const pick = shown[active];
      if (pick) {
        event.preventDefault();
        take(pick);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setTyped("");
      setOpen(false);
    }
  }

  // A chosen value shows as the field's text until the reader types over it.
  const text = open ? typed : (chosen?.label ?? "");

  return (
    <div className="relative">
      <span className="relative block">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-m-faint"
        >
          {leading ?? <Search className="h-[18px] w-[18px]" />}
        </span>

        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          aria-activedescendant={open && shown[active] ? rowId(active) : undefined}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setTyped(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          /* A blur from tapping a row would close the list before the tap
             registers, so the close waits a beat. `relatedTarget` is unreliable
             on touch, which is why this is a timer rather than a check. */
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          className={`${inputCls} pl-11 ${chosen && !open ? "pr-11" : ""} ${invalid ? "m-bad" : ""}`}
        />

        {chosen && !open ? (
          <button
            type="button"
            onClick={clear}
            aria-label={`Clear ${label}`}
            className="m-tap m-tap-abs right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[12px] text-m-muted active:bg-m-raised"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-m-muted"
          />
        )}
      </span>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 max-h-[15rem] overflow-y-auto overscroll-contain rounded-[16px] bg-m-card py-1 ring-1 ring-m-line"
        >
          {loading && <li className="px-4 py-3 text-[14px] text-m-muted">Loading...</li>}

          {!loading && shown.length === 0 && (
            <li className="px-4 py-3 text-[14px] text-m-muted">{emptyText}</li>
          )}

          {!loading &&
            shown.map((option, index) => (
              <li
                key={option.value}
                id={rowId(index)}
                role="option"
                aria-selected={option.value === value}
              >
                <button
                  type="button"
                  // The list closes on blur, so the tap has to land before it.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => take(option)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                    index === active ? "bg-m-raised" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-m-text">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-[12.5px] text-m-muted">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {option.trailing && (
                    <span className="shrink-0 text-[13px] font-semibold text-m-muted">
                      {option.trailing}
                    </span>
                  )}
                  {option.value === value && (
                    <Check className="h-4 w-4 shrink-0 text-(color:--m-link)" aria-hidden />
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
