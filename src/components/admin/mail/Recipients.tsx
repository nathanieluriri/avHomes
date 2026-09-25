"use client";

import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { rankContacts, type MailContact } from "@avhomes/contracts";
import { LetterAvatar, isEmail, parseAddresses } from "./shared";

/** The typed fragment, highlighted wherever it sits in `text`. */
function Marked({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q === "" ? -1 : text.toLowerCase().indexOf(q);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-wine-50 font-semibold text-wine-700">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function firstName(c: MailContact): string {
  const name = c.name.trim();
  if (name !== "") return name.split(/\s+/u)[0];
  return c.address.split("@")[0];
}

/**
 * One recipient line as chips: typing shows ranked matches from the mailbox's
 * correspondents, and Enter, Tab, comma or a paste turns text into chips.
 * An address that is not one stays, in red, until it is fixed or removed.
 */
export function RecipientField({
  label,
  values,
  onChange,
  contacts,
  taken,
  autoFocus = false,
  phone = false,
  trailing,
  onEscape,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  contacts: MailContact[];
  /** Everyone already on To, Cc or Bcc, left out of the suggestions. */
  taken: string[];
  autoFocus?: boolean;
  phone?: boolean;
  /** The Cc and Bcc toggles, at the end of the To line. */
  trailing?: ReactNode;
  /** Escape with nothing open to close, for the compose window to minimise. */
  onEscape?: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const known = new Map(contacts.map((c) => [c.address, c]));
  const skip = new Set(taken.map((a) => a.toLowerCase()));
  const matches =
    focused && !dismissed && text.trim() !== ""
      ? rankContacts(contacts.filter((c) => !skip.has(c.address)), text, 6)
      : [];
  const open = matches.length > 0;

  function commit(raw: string[]) {
    const fresh = raw.map((a) => a.trim().toLowerCase()).filter((a) => a !== "" && !values.includes(a));
    if (fresh.length > 0) onChange([...values, ...new Set(fresh)]);
  }

  function pick(c: MailContact) {
    commit([c.address]);
    setText("");
    setActive(0);
    input.current?.focus();
  }

  function type(value: string) {
    setDismissed(false);
    setActive(0);
    // A separator typed or pasted mid-line commits everything before it.
    if (/[,;\n]/u.test(value)) {
      const parts = parseAddresses(value);
      const trailingSep = /[,;\n]\s*$/u.test(value);
      commit(trailingSep ? parts : parts.slice(0, -1));
      setText(trailingSep ? "" : (parts[parts.length - 1] ?? ""));
      return;
    }
    setText(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const key = event.key;
    if (open && (key === "ArrowDown" || key === "ArrowUp")) {
      event.preventDefault();
      setActive((i) => (i + (key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
      return;
    }
    if (key === "Enter" || key === "Tab") {
      if (open) {
        event.preventDefault();
        pick(matches[Math.min(active, matches.length - 1)]);
        return;
      }
      if (text.trim() !== "") {
        event.preventDefault();
        commit(parseAddresses(text));
        setText("");
      }
      return;
    }
    if (key === "Backspace" && text === "" && values.length > 0) {
      event.preventDefault();
      onChange(values.slice(0, -1));
      return;
    }
    if (key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(true);
      } else if (onEscape) {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!/[,;\n<]/u.test(pasted)) return;
    event.preventDefault();
    commit(parseAddresses(`${text}${pasted}`));
    setText("");
  }

  function edit(address: string) {
    onChange(values.filter((v) => v !== address));
    if (text.trim() !== "") commit(parseAddresses(text));
    setText(address);
    requestAnimationFrame(() => input.current?.select());
  }

  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div className="relative">
      <div className={`flex items-start gap-2 ${phone ? "min-h-12 px-4" : "min-h-10 px-3"}`}>
        <label htmlFor={id} className={`shrink-0 text-slate-600 ${phone ? "w-12 pt-3.5 text-[14px]" : "w-9 pt-2.5 text-[13px]"}`}>
          {label}
        </label>
        <div
          className={`flex min-w-0 flex-1 flex-wrap items-center gap-1 ${phone ? "py-2" : "py-1.5"}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) input.current?.focus();
          }}
        >
          {values.map((address) => {
            const valid = isEmail(address);
            const c = known.get(address);
            return (
              <span
                key={address}
                className={`inline-flex h-8 max-w-full items-center gap-1 rounded-full border pl-0.5 pr-1 text-[12.5px] ${
                  valid ? "border-mist-200 bg-mist-50 text-plum-950" : "border-red-300 bg-red-50 text-red-700"
                }`}
              >
                {valid ? (
                  <LetterAvatar text={c?.name || address} toneKey={address} size="xs" />
                ) : (
                  <span className="w-1" aria-hidden="true" />
                )}
                <button
                  type="button"
                  title={valid ? (c?.name ? `${c.name} <${address}>` : address) : `${address} is not an email address. Click to fix it.`}
                  onClick={() => edit(address)}
                  className="min-w-0 truncate px-0.5"
                >
                  {c?.name && valid ? c.name : address}
                  {!valid && <span className="sr-only"> (not a valid address)</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${address}`}
                  onClick={() => onChange(values.filter((v) => v !== address))}
                  className="c-tap grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-550 hover:bg-mist-200 hover:text-plum-950"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
          <input
            ref={input}
            id={id}
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? optionId(Math.min(active, matches.length - 1)) : undefined}
            value={text}
            onChange={(event) => type(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (text.trim() !== "") {
                commit(parseAddresses(text));
                setText("");
              }
            }}
            style={{ outline: "none" }}
            className={`min-w-[5rem] flex-1 bg-transparent text-plum-950 outline-none ${phone ? "h-8 text-[15px]" : "h-8 text-[13px]"}`}
          />
        </div>
        {trailing}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Suggestions for ${label}`}
          className={`z-30 overflow-hidden bg-white py-1 ${
            phone
              ? "border-b border-mist-100"
              : "absolute left-12 right-3 top-full mt-0.5 rounded-xl border border-mist-200 shadow-pop"
          }`}
        >
          {matches.map((c, i) => (
            <li
              key={c.address}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the field, so the blur does not commit the fragment first.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
              className={`flex cursor-pointer items-center gap-3 px-3 ${phone ? "min-h-14" : "min-h-11"} ${
                i === active ? "bg-mist-100" : ""
              }`}
            >
              <LetterAvatar text={c.name || c.address} toneKey={c.address} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-plum-950">
                  <Marked text={c.name || c.address.split("@")[0]} query={text} />
                </span>
                <span className="block truncate text-[12px] text-slate-600">
                  <Marked text={c.address} query={text} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The people this mailbox writes to most, as circles with a first name under
 * each, like the Gmail app's suggestions. One tap adds them to To.
 */
export function RecentCircles({
  contacts,
  taken,
  onPick,
  phone = false,
}: {
  contacts: MailContact[];
  taken: string[];
  onPick: (address: string) => void;
  phone?: boolean;
}) {
  const skip = new Set(taken);
  const people = rankContacts(contacts.filter((c) => !skip.has(c.address)), "", 8);
  if (people.length === 0) return null;
  return (
    <div className={phone ? "border-b border-mist-100 py-3" : "py-2"}>
      <p className={`pb-2 text-[12px] font-medium text-slate-600 ${phone ? "px-4" : "px-3"}`}>People you write to</p>
      <ul className={`no-scrollbar flex gap-1 overflow-x-auto ${phone ? "px-2.5" : "px-1.5"}`}>
        {people.map((c) => (
          <li key={c.address} className="shrink-0">
            <button
              type="button"
              title={c.name ? `${c.name} <${c.address}>` : c.address}
              aria-label={`Add ${c.name || c.address} to To`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(c.address)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-1 hover:bg-mist-50 active:bg-mist-100 ${phone ? "w-[4.5rem]" : "w-16"}`}
            >
              <LetterAvatar text={c.name || c.address} toneKey={c.address} size={phone ? "lg" : "md"} />
              <span className="w-full truncate text-center text-[11.5px] text-plum-950">{firstName(c)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
