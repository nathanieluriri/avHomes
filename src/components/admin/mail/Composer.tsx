"use client";

import { useContext, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "radix-ui";
import { ArrowLeft, ChevronDown, Maximize2, Minimize2, Minus, Send, Trash2, X } from "lucide-react";
import type { MailContact, MailDraft, MailFolder, MailboxSummary } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, ConfirmButton, ErrorNote, Field, inputClass } from "@/components/admin/ui";
import { RecentCircles, RecipientField } from "./Recipients";
import { type SaveState, useContacts, useDraftAutosave } from "./state";
import {
  SignatureContext,
  type Draft,
  asApiError,
  draftIsEmpty,
  draftTitle,
  enc,
  htmlToText,
  isEmail,
  newDraftId,
  textToHtmlSigned,
} from "./shared";

/* ─────────────────────────────── the draft ───────────────────────────── */

export type Segment = "write" | "html" | "preview";

/**
 * One draft being edited: its fields, the recipient lines, the Write, HTML and
 * Preview switch, autosave, and the checks before it can go.
 *
 * The draft lives in a ref as well as in state, so a keyboard send reads the
 * chip that the same keystroke just committed.
 */
function useCompose(initial: Draft, onSaved: (saved: MailDraft) => void) {
  const signature = useContext(SignatureContext);
  const [draft, setDraft] = useState(initial);
  const ref = useRef(initial);
  const [segment, setSegment] = useState<Segment>(initial.mode === "html" ? "html" : "write");
  const [confirmPlain, setConfirmPlain] = useState(false);
  const [showCc, setShowCc] = useState(initial.cc.length > 0);
  const [showBcc, setShowBcc] = useState(initial.bcc.length > 0);
  const [invalid, setInvalid] = useState<string | null>(null);

  const update = (fn: (d: Draft) => Draft) => {
    ref.current = fn(ref.current);
    setDraft(ref.current);
    setInvalid(null);
  };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => update((d) => ({ ...d, [key]: value }));

  const autosave = useDraftAutosave(draft, (saved) => {
    ref.current = { ...ref.current, revision: saved.revision, updatedAt: saved.updatedAt };
    setDraft(ref.current);
    onSaved(saved);
  });

  function pickSegment(next: Segment) {
    setConfirmPlain(false);
    if (next === "write") {
      if (draft.mode === "html" && draft.html.trim() !== "") {
        setConfirmPlain(true);
        return;
      }
      update((d) => ({ ...d, mode: "text" }));
    } else if (draft.mode === "text") {
      update((d) => ({ ...d, mode: "html", html: d.html.trim() === "" ? textToHtmlSigned(d.text, signature) : d.html }));
    }
    setSegment(next);
  }

  function convertToPlain() {
    update((d) => ({ ...d, mode: "text", text: htmlToText(d.html), html: "" }));
    setConfirmPlain(false);
    setSegment("write");
  }

  /** The draft to send, or null with the reason shown. */
  function ready(): Draft | null {
    const d = ref.current;
    const all = [...d.to, ...d.cc, ...d.bcc];
    const bad = all.filter((a) => !isEmail(a));
    if (all.length === 0) {
      setInvalid("Add at least one recipient.");
      return null;
    }
    if (bad.length > 0) {
      setInvalid(
        bad.length === 1
          ? `${bad[0]} is not an email address. Fix it or remove it, then send.`
          : `${bad.length} addresses are not valid. Fix the ones in red, then send.`,
      );
      return null;
    }
    return d;
  }

  const taken = [...draft.to, ...draft.cc, ...draft.bcc];
  return {
    draft,
    ref,
    set,
    update,
    segment,
    pickSegment,
    confirmPlain,
    keepHtml: () => setConfirmPlain(false),
    convertToPlain,
    showCc,
    setShowCc,
    showBcc,
    setShowBcc,
    invalid,
    ready,
    taken,
    autosave,
  };
}

type Compose = ReturnType<typeof useCompose>;

/* ─────────────────────────────── pieces ──────────────────────────────── */

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "html", label: "HTML" },
  { id: "preview", label: "Preview" },
];

/** Write, HTML and Preview. Also the signature editor's switch, so both read the same. */
export function ModeSwitch({
  value,
  onPick,
  label = "Message format",
}: {
  value: Segment;
  onPick: (next: Segment) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg bg-mist-100 p-0.5">
      {SEGMENTS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          onClick={() => onPick(s.id)}
          className={`c-tap h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${
            value === s.id ? "bg-white text-plum-950 shadow-card" : "text-slate-600 hover:text-plum-950"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function tick(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "Saved";
  if (seconds < 60) return `Saved ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `Saved ${minutes} min ago` : "Saved";
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (state.kind !== "saved") return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [state.kind]);

  if (state.kind === "saving") return <span className="text-[12px] text-slate-550">Saving</span>;
  if (state.kind === "saved") return <span className="text-[12px] text-slate-550">{tick(state.at)}</span>;
  if (state.kind === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-red-700" title={state.error.message}>
        Not saved
        <button type="button" onClick={onRetry} className="c-tap font-semibold underline underline-offset-2">
          Retry
        </button>
      </span>
    );
  }
  return null;
}

/** A one-line question inside the window, in place of a modal over it. */
function Notice({ tone = "neutral", children, actions }: { tone?: "neutral" | "warn"; children: ReactNode; actions: ReactNode }) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 text-[12.5px] ${
        tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-mist-200 bg-mist-50 text-plum-950"
      }`}
    >
      <p className="min-w-0 flex-1">{children}</p>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </div>
  );
}

function Notices({ c, problem }: { c: Compose; problem: ApiError | null }) {
  const s = c.autosave.state;
  return (
    <>
      {problem && (
        <div className="border-b border-mist-100 p-3">
          <ErrorNote error={problem} />
        </div>
      )}
      {c.invalid && (
        <Notice tone="warn" actions={null}>
          {c.invalid}
        </Notice>
      )}
      {c.confirmPlain && (
        <Notice
          tone="warn"
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={c.keepHtml}>
                Keep HTML
              </Button>
              <Button size="sm" onClick={c.convertToPlain}>
                Switch to plain text
              </Button>
            </>
          }
        >
          Plain text drops the formatting. Links stay, as text with the address after them.
        </Notice>
      )}
      {s.kind === "conflict" && (
        <Notice
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  c.update((d) => ({ ...d, revision: s.theirs.revision }));
                  c.autosave.resume();
                }}
              >
                Keep this one
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  c.update(() => ({ ...s.theirs }));
                  c.autosave.resume();
                }}
              >
                Use that version
              </Button>
            </>
          }
        >
          This draft was changed on another device.
        </Notice>
      )}
      {s.kind === "gone" && (
        <Notice
          actions={
            <Button
              size="sm"
              onClick={() => {
                c.update((d) => ({ ...d, id: newDraftId(), revision: 0 }));
                c.autosave.resume();
              }}
            >
              Keep as a new draft
            </Button>
          }
        >
          This draft was sent or discarded on another device.
        </Notice>
      )}
    </>
  );
}

const bare = { outline: "none" } as const;

function Body({ c, phone, autoFocus }: { c: Compose; phone: boolean; autoFocus: boolean }) {
  const d = c.draft;
  const pad = phone ? "px-4" : "px-3";
  const bodyFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    // A new message opens with the signature (and any quote) below an empty first line; start typing above it.
    if (d.revision === 0 && d.text.startsWith("\n") && event.currentTarget.selectionStart === event.currentTarget.value.length) {
      event.currentTarget.setSelectionRange(0, 0);
    }
  };

  if (c.segment === "preview") {
    return d.html.trim() === "" ? (
      <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-[13px] text-slate-600">
        Nothing to preview yet. Paste your HTML under HTML.
      </div>
    ) : (
      // The reading view's sandbox: no scripts, no forms, no reach into this origin.
      <iframe title="Preview" srcDoc={d.html} sandbox="" className="min-h-0 w-full flex-1 border-0 bg-white" />
    );
  }
  if (c.segment === "html") {
    return (
      <textarea
        style={bare}
        aria-label="Message HTML"
        placeholder="Paste or write HTML. Scripts and forms are removed before it is sent."
        spellCheck={false}
        autoFocus={autoFocus}
        value={d.html}
        onChange={(event) => c.set("html", event.target.value)}
        className={`min-h-0 w-full flex-1 resize-none bg-mist-50/60 py-3 font-mono text-[12.5px] leading-relaxed text-plum-950 outline-none placeholder:text-slate-550 ${pad}`}
      />
    );
  }
  return (
    <textarea
      style={bare}
      aria-label="Message"
      placeholder={phone ? "Compose email" : "Write your message"}
      autoFocus={autoFocus}
      value={d.text}
      onFocus={bodyFocus}
      onChange={(event) => c.set("text", event.target.value)}
      className={`min-h-0 w-full flex-1 resize-none bg-transparent py-3 leading-relaxed text-plum-950 outline-none placeholder:text-slate-550 ${pad} ${
        phone ? "text-[15px]" : "text-[14px]"
      }`}
    />
  );
}

function FromSelect({
  c,
  mailboxes,
  phone,
}: {
  c: Compose;
  mailboxes: MailboxSummary[];
  phone: boolean;
}) {
  // A reply or forward names a message in its own mailbox, so only a new message can change sender.
  const locked = Boolean(c.draft.inReplyTo || c.draft.forwardOf) || mailboxes.length < 2;
  return (
    <div className={`flex items-center gap-2 border-b border-mist-100 ${phone ? "min-h-12 px-4" : "min-h-10 px-3"}`}>
      <span className={`shrink-0 text-slate-600 ${phone ? "w-12 text-[14px]" : "w-9 text-[13px]"}`}>From</span>
      <span className="relative flex min-w-0 flex-1 items-center">
        <select
          style={bare}
          aria-label="From"
          value={c.draft.mailbox}
          disabled={locked}
          onChange={(event) => c.set("mailbox", event.target.value)}
          className={`min-w-0 flex-1 appearance-none truncate bg-transparent pr-6 text-plum-950 outline-none disabled:opacity-100 ${
            phone ? "py-3 text-[15px]" : "py-2 text-[13px]"
          }`}
        >
          {mailboxes.map((m) => (
            <option key={m.resourceId} value={m.resourceId}>
              {m.address}
            </option>
          ))}
        </select>
        {!locked && <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-slate-550" aria-hidden="true" />}
      </span>
    </div>
  );
}

/** From, To with Cc and Bcc on its right, the suggestion circles, Cc, Bcc and Subject. */
function Header({
  c,
  mailboxes,
  contacts,
  phone,
  onEscape,
}: {
  c: Compose;
  mailboxes: MailboxSummary[];
  contacts: MailContact[];
  phone: boolean;
  onEscape?: () => void;
}) {
  const d = c.draft;
  const locked = Boolean(d.inReplyTo || d.forwardOf);
  const line = "border-b border-mist-100 focus-within:border-wine-500";
  const toggle = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`c-tap shrink-0 rounded-md px-1.5 font-medium text-slate-600 hover:bg-mist-100 hover:text-plum-950 ${
        phone ? "mt-2.5 h-8 text-[13.5px]" : "mt-1.5 h-7 text-[12.5px]"
      }`}
    >
      {label}
    </button>
  );
  const toggles =
    !c.showCc || !c.showBcc ? (
      <span className="flex shrink-0 gap-0.5">
        {!c.showCc && toggle("Cc", () => c.setShowCc(true))}
        {!c.showBcc && toggle("Bcc", () => c.setShowBcc(true))}
      </span>
    ) : null;

  return (
    <div className="shrink-0">
      {mailboxes.length > 1 && <FromSelect c={c} mailboxes={mailboxes} phone={phone} />}
      <div className={line}>
        <RecipientField
          label="To"
          phone={phone}
          values={d.to}
          contacts={contacts}
          taken={c.taken}
          autoFocus={!locked && d.to.length === 0}
          onChange={(next) => c.set("to", next)}
          trailing={toggles}
          onEscape={onEscape}
        />
      </div>
      {d.to.length === 0 && d.cc.length === 0 && (
        <div className="border-b border-mist-100">
          <RecentCircles phone={phone} contacts={contacts} taken={c.taken} onPick={(a) => c.set("to", [...d.to, a])} />
        </div>
      )}
      {c.showCc && (
        <div className={line}>
          <RecipientField
            label="Cc"
            phone={phone}
            values={d.cc}
            contacts={contacts}
            taken={c.taken}
            autoFocus={d.cc.length === 0 && d.to.length > 0}
            onChange={(next) => c.set("cc", next)}
            onEscape={onEscape}
          />
        </div>
      )}
      {c.showBcc && (
        <div className={line}>
          <RecipientField
            label="Bcc"
            phone={phone}
            values={d.bcc}
            contacts={contacts}
            taken={c.taken}
            onChange={(next) => c.set("bcc", next)}
            onEscape={onEscape}
          />
        </div>
      )}
      <div className={`${line} flex items-center ${phone ? "min-h-12 px-4" : "min-h-10 px-3"}`}>
        <input
          aria-label="Subject"
          placeholder="Subject"
          style={bare}
          value={d.subject}
          maxLength={500}
          onChange={(event) => c.set("subject", event.target.value)}
          className={`min-w-0 flex-1 bg-transparent text-plum-950 outline-none placeholder:text-slate-550 ${
            phone ? "py-3 text-[15px]" : "py-2 text-[13.5px] font-medium"
          }`}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────── desktop ─────────────────────────────── */

export interface ComposeCallbacks {
  /** Saved to the server; the page keeps its list of drafts current. */
  onSaved: (saved: MailDraft) => void;
  /** Closed with its draft kept. */
  onClose: (draft: Draft) => void;
  onDiscard: (draft: Draft) => void;
  /** Validated and ready; the page runs the undo window and the send. */
  onSend: (draft: Draft) => void;
}

/**
 * Gmail's compose window: docked bottom right, minimises to its title bar and
 * expands to a large dialog. The body takes whatever height is left, and the
 * footer is outside the scroll, so nothing ever sits under it.
 */
export function ComposeWindow({
  initial,
  mailboxes,
  minimized,
  expanded,
  right,
  problem,
  onLayout,
  onSaved,
  onClose,
  onDiscard,
  onSend,
}: ComposeCallbacks & {
  initial: Draft;
  mailboxes: MailboxSummary[];
  minimized: boolean;
  expanded: boolean;
  /** Pixels from the right edge, for windows docked side by side. */
  right: number;
  problem: ApiError | null;
  onLayout: (next: { minimized: boolean; expanded: boolean }) => void;
}) {
  const c = useCompose(initial, onSaved);
  const contacts = useContacts(c.draft.mailbox);
  const [discarding, setDiscarding] = useState(false);

  const d = c.draft;
  const title = draftTitle(d);
  const minimize = () => onLayout({ minimized: true, expanded: false });

  function send() {
    const ready = c.ready();
    if (!ready) return;
    void c.autosave.flush();
    onSend(ready);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      send();
    } else if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      if (expanded) onLayout({ minimized: false, expanded: false });
      else minimize();
    }
  }

  const bar = (
    <div
      className={`flex h-10 shrink-0 items-center gap-1 pl-3.5 pr-1.5 ${minimized ? "cursor-pointer rounded-t-xl" : "rounded-t-xl"} bg-mist-100`}
      onClick={minimized ? () => onLayout({ minimized: false, expanded: false }) : undefined}
    >
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-plum-950">{title}</h2>
      <BarIcon
        label={minimized ? "Restore" : "Minimise"}
        onClick={(event) => {
          event.stopPropagation();
          onLayout({ minimized: !minimized, expanded: false });
        }}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </BarIcon>
      <BarIcon
        label={expanded ? "Exit full size" : "Full size"}
        onClick={(event) => {
          event.stopPropagation();
          onLayout({ minimized: false, expanded: !expanded });
        }}
      >
        {expanded ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
      </BarIcon>
      <BarIcon
        label="Save and close"
        onClick={(event) => {
          event.stopPropagation();
          void c.autosave.flush();
          onClose(c.ref.current);
        }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </BarIcon>
    </div>
  );

  const shape = minimized
    ? "bottom-0 h-10 w-[17.5rem]"
    : expanded
      ? "left-1/2 top-1/2 h-[min(52rem,calc(100dvh-4rem))] w-[min(72rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 rounded-b-xl"
      : "bottom-0 h-[min(38.75rem,calc(100dvh-4.5rem))] w-[35rem] max-w-[calc(100vw-2rem)]";

  const win = (
    <div className="console console-float">
      {expanded && !minimized && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[60] bg-plum-950/30"
          onClick={() => onLayout({ minimized: false, expanded: false })}
        />
      )}
      <section
        role="dialog"
        aria-label={title}
        onKeyDown={onKeyDown}
        style={minimized || !expanded ? { right } : undefined}
        className={`fixed z-[61] flex flex-col overflow-hidden rounded-t-xl bg-white shadow-pop ${shape}`}
      >
        {bar}
        {!minimized && (
          <>
            <Header c={c} mailboxes={mailboxes} contacts={contacts} phone={false} onEscape={minimize} />
            <div className="flex shrink-0 items-center gap-3 border-b border-mist-100 px-3 py-1.5">
              <ModeSwitch value={c.segment} onPick={c.pickSegment} />
              {c.segment === "html" && (
                <span className="min-w-0 truncate text-[12px] text-slate-550">Sent as HTML with a plain text copy.</span>
              )}
            </div>
            <Notices c={c} problem={problem} />
            <div className="flex min-h-0 flex-1 flex-col">
              <Body c={c} phone={false} autoFocus={Boolean(d.inReplyTo || d.forwardOf) && c.segment === "write"} />
            </div>
            <div className="flex shrink-0 items-center gap-3 border-t border-mist-100 px-3 py-2.5">
              {discarding ? (
                <>
                  <p className="min-w-0 flex-1 text-[12.5px] text-plum-950">Discard this draft?</p>
                  <Button size="md" variant="ghost" onClick={() => setDiscarding(false)}>
                    Keep editing
                  </Button>
                  <Button size="md" variant="danger" onClick={() => onDiscard(c.ref.current)}>
                    Discard
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={send} title="Send (Ctrl+Enter)">
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Send
                  </Button>
                  <span className="hidden text-[11.5px] text-slate-550 lg:inline">Ctrl+Enter</span>
                  <span className="min-w-0 flex-1 text-right">
                    <SaveStatus state={c.autosave.state} onRetry={() => void c.autosave.flush()} />
                  </span>
                  <button
                    type="button"
                    aria-label="Discard draft"
                    title="Discard draft"
                    onClick={() => (draftIsEmpty(c.ref.current) ? onDiscard(c.ref.current) : setDiscarding(true))}
                    className="c-tap grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-mist-100 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );

  // Only ever rendered after the page's state has loaded in the browser, never on the server.
  return typeof document === "undefined" ? null : createPortal(win, document.body);
}

function BarIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-mist-200 hover:text-plum-950"
    >
      {children}
    </button>
  );
}

/* ──────────────────────────────── phone ──────────────────────────────── */

/** Gmail's app composer: full screen, Send in the bar, the body filling what the keyboard leaves. */
export function PhoneComposer({
  initial,
  mailboxes,
  problem,
  onSaved,
  onClose,
  onDiscard,
  onSend,
}: ComposeCallbacks & {
  initial: Draft;
  mailboxes: MailboxSummary[];
  problem: ApiError | null;
}) {
  const c = useCompose(initial, onSaved);
  const contacts = useContacts(c.draft.mailbox);
  const [discarding, setDiscarding] = useState(false);
  const d = c.draft;

  function send() {
    const ready = c.ready();
    if (!ready) return;
    void c.autosave.flush();
    onSend(ready);
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          void c.autosave.flush();
          onClose(c.ref.current);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="console console-float fixed inset-0 z-[71] flex flex-col bg-white pb-[var(--c-kb)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4"
        >
          <div className="flex h-14 shrink-0 items-center gap-1 px-1.5">
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Save and close"
                title="Save and close"
                className="c-tap grid h-11 w-11 place-items-center rounded-full text-plum-950 hover:bg-mist-100"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
            <div className="min-w-0 flex-1 pl-1">
              <Dialog.Title className="truncate text-[18px] font-semibold leading-tight text-plum-950">
                {d.inReplyTo ? "Reply" : d.forwardOf ? "Forward" : "Compose"}
              </Dialog.Title>
              {c.autosave.state.kind !== "idle" && (
                <div className="leading-4">
                  <SaveStatus state={c.autosave.state} onRetry={() => void c.autosave.flush()} />
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Discard draft"
              title="Discard draft"
              onClick={() => (draftIsEmpty(c.ref.current) ? onDiscard(c.ref.current) : setDiscarding(true))}
              className="c-tap grid h-11 w-11 place-items-center rounded-full text-slate-600 hover:bg-mist-100"
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Send"
              title="Send"
              onClick={send}
              className="c-tap grid h-11 w-11 place-items-center rounded-full text-wine-700 hover:bg-wine-50"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-mist-100">
            {discarding && (
              <Notice
                tone="warn"
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setDiscarding(false)}>
                      Keep editing
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => onDiscard(c.ref.current)}>
                      Discard
                    </Button>
                  </>
                }
              >
                Discard this draft?
              </Notice>
            )}
            <Header c={c} mailboxes={mailboxes} contacts={contacts} phone />
            <div className="flex shrink-0 items-center gap-3 border-b border-mist-100 px-4 py-2">
              <ModeSwitch value={c.segment} onPick={c.pickSegment} />
            </div>
            <Notices c={c} problem={problem} />
            <div className="flex min-h-[14rem] flex-1 flex-col pb-[var(--safe-b)]">
              <Body c={c} phone autoFocus={Boolean(d.inReplyTo || d.forwardOf) && c.segment === "write"} />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


/* ─────────────────────────────── folders ─────────────────────────────── */

/** Rename or delete a folder somebody made. System folders never get here. */
export function FolderSettings({
  mailbox,
  folder,
  onClose,
  onRenamed,
  onDeleted,
}: {
  mailbox: string;
  folder: MailFolder;
  onClose: () => void;
  onRenamed: (path: string) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const path = `/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folder.path)}`;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Folder: ${folder.name}`}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || name.trim() === "" || name.trim() === folder.name}
            onClick={() =>
              void run(async () => {
                const res = await api.put<{ folder: MailFolder | null }>(path, { name: name.trim() });
                onRenamed(res.folder?.path ?? folder.path);
              })
            }
          >
            Rename
          </Button>
          <ConfirmButton
            disabled={busy}
            confirmLabel="Yes, delete folder and its mail"
            onConfirm={() =>
              void run(async () => {
                await api.del(path);
                onDeleted();
              })
            }
          >
            Delete folder
          </ConfirmButton>
        </div>
      }
    >
      <div className="space-y-3">
        {problem && <ErrorNote error={problem} />}
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <p className="text-[12.5px] text-slate-600">
          Deleting a folder deletes the {folder.messageCount === 1 ? "message" : `${folder.messageCount} messages`} in it
          for good.
        </p>
      </div>
    </BottomSheet>
  );
}
