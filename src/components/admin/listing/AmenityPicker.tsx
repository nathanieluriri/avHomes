"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { AMENITY_LENGTH_MAX, AMENITY_MAX } from "@avhomes/contracts";
import { inputClass } from "@/components/admin/ui";

/** The count shows once the list is this close to the cap. */
const CAP_WARN_AT = AMENITY_MAX - 10;

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, AMENITY_LENGTH_MAX);
}

/**
 * Chosen amenities as removable chips, a free-text box, and one-tap suggestions.
 *
 * Enter or a comma adds what is typed; a pasted list splits on lines and commas.
 * Backspace in the empty box takes the last chip back. Duplicates are compared
 * case-insensitively and refused with a note rather than silently dropped.
 */
export function AmenityPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: readonly string[];
}) {
  const labelId = useId();
  const noteId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const chosen = new Set(value.map((a) => a.toLowerCase()));
  const full = value.length >= AMENITY_MAX;
  const offered = suggestions.filter((s) => !chosen.has(s.toLowerCase()));

  /* Where focus goes after a render: a suggestion's text, or "" for the input.
     A tapped suggestion unmounts, and focus would otherwise fall to the page. */
  const pendingFocus = useRef<string | null>(null);
  const suggestionList = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const next =
      target === ""
        ? null
        : suggestionList.current?.querySelector<HTMLButtonElement>(`[data-suggestion="${CSS.escape(target)}"]`);
    (next ?? input.current)?.focus();
  }, [value]);

  function add(parts: readonly string[]) {
    const next = [...value];
    const seen = new Set(chosen);
    const added: string[] = [];
    const repeated: string[] = [];
    let capped = false;
    for (const part of parts) {
      const amenity = clean(part);
      if (amenity === "") continue;
      const key = amenity.toLowerCase();
      if (seen.has(key)) {
        repeated.push(amenity);
        continue;
      }
      if (next.length >= AMENITY_MAX) {
        capped = true;
        break;
      }
      seen.add(key);
      next.push(amenity);
      added.push(amenity);
    }
    if (added.length > 0) onChange(next);
    // The live region is the only thing a screen reader hears when a chip appears.
    setNote(
      capped
        ? `That is the most a listing can carry (${AMENITY_MAX}).`
        : repeated.length > 0
          ? `${repeated.join(", ")} ${repeated.length === 1 ? "is" : "are"} already on the list.`
          : added.length > 0
            ? `Added ${added.join(", ")}.`
            : null,
    );
  }

  function addSuggestion(suggestion: string) {
    // The neighbour that will still be offered after this one goes, else the input.
    const at = offered.indexOf(suggestion);
    pendingFocus.current = offered[at + 1] ?? offered[at - 1] ?? "";
    add([suggestion]);
  }

  function remove(index: number) {
    const gone = value[index];
    onChange(value.filter((_, i) => i !== index));
    setNote(gone ? `Removed ${gone}.` : null);
    // The chip's own button is gone, so focus would fall to the page.
    input.current?.focus();
  }

  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span id={labelId} className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Amenities
        </span>
        {value.length >= CAP_WARN_AT && (
          <span className={`text-xs ${full ? "text-amber-700" : "text-slate-600"}`}>
            {value.length} of {AMENITY_MAX}
          </span>
        )}
      </div>

      {value.length > 0 && (
        <ul aria-label="Chosen amenities" className="mb-2 flex flex-wrap gap-2">
          {value.map((amenity, index) => (
            <li
              key={`${index}-${amenity}`}
              className="inline-flex h-9 max-w-full items-center gap-1 rounded-lg bg-plum-950 pl-3 pr-1 text-[13px] font-semibold text-white sm:h-7 sm:pl-2.5"
            >
              <span className="truncate">{amenity}</span>
              <button
                type="button"
                aria-label={`Remove ${amenity}`}
                title={`Remove ${amenity}`}
                onClick={() => remove(index)}
                className="c-tap grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/15 hover:text-white sm:h-5 sm:w-5"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        className={inputClass}
        aria-label="Add an amenity"
        aria-describedby={note ? noteId : undefined}
        placeholder={full ? "The list is full" : "Type one and press Enter"}
        autoComplete="off"
        maxLength={AMENITY_LENGTH_MAX}
        value={text}
        onChange={(e) => {
          const typed = e.target.value;
          if (!typed.includes(",")) {
            setText(typed);
            return;
          }
          // A comma finishes an amenity; whatever follows the last one stays in the box.
          const parts = typed.split(",");
          const rest = parts.pop() ?? "";
          add(parts);
          setText(rest.trimStart());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add([text]);
            setText("");
          } else if (
            e.key === "Backspace" &&
            // A held key clearing a word must stop at the empty box, not eat the chips behind it.
            !e.repeat &&
            e.currentTarget.value === "" &&
            value.length > 0
          ) {
            e.preventDefault();
            remove(value.length - 1);
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!/[\n\r,]/.test(pasted)) return;
          e.preventDefault();
          add([text, ...pasted.split(/[\n\r,]+/)]);
          setText("");
        }}
        onBlur={() => {
          // Typed and never confirmed would otherwise vanish on save.
          if (text.trim() === "") return;
          add([text]);
          setText("");
        }}
      />

      <p id={noteId} aria-live="polite" className="mt-1 min-h-4 text-xs text-slate-600">
        {note ?? ""}
      </p>

      {offered.length > 0 && !full && (
        <div ref={suggestionList} role="group" aria-label="Suggestions" className="mt-2 flex flex-wrap gap-2">
          {offered.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              data-suggestion={suggestion}
              aria-label={`Add ${suggestion}`}
              onClick={() => addSuggestion(suggestion)}
              className="c-tap inline-flex h-9 items-center gap-1 rounded-lg bg-mist-100 px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-mist-200/70 hover:text-plum-950 sm:h-7 sm:px-2.5"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
