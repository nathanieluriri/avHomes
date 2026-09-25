"use client";

import { useState, type FocusEvent } from "react";
import { Dialog } from "radix-ui";
import { ArrowLeft, ChevronDown, Send } from "lucide-react";
import type { MailAddress, MailFolder, MailboxSummary } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, ConfirmButton, ErrorNote, Field, inputClass } from "@/components/admin/ui";
import { type Draft, LetterAvatar, asApiError, enc, splitAddresses } from "./shared";

const bare = { outline: "none" } as const;

/** Recent correspondents that match what is being typed after the last comma. */
function suggest(value: string, people: MailAddress[]): MailAddress[] {
  const parts = value.split(/[,;]/u);
  const typing = (parts[parts.length - 1] ?? "").trim().toLowerCase();
  const chosen = new Set(splitAddresses(value).map((a) => a.toLowerCase()));
  return people
    .filter((p) => !chosen.has(p.address.toLowerCase()))
    .filter((p) => typing === "" || p.address.toLowerCase().includes(typing) || p.name.toLowerCase().includes(typing))
    .slice(0, 6);
}

function withPicked(value: string, address: string): string {
  const parts = value.split(/[,;]/u).map((p) => p.trim());
  parts[parts.length - 1] = address;
  return `${parts.filter((p) => p !== "").join(", ")}, `;
}

export function Composer({
  phone = false,
  mailboxes,
  mailbox,
  draft,
  people,
  onChange,
  onClose,
  onSent,
}: {
  /** Full screen with a Gmail-style bar, instead of the centred sheet. */
  phone?: boolean;
  mailboxes: MailboxSummary[];
  mailbox: string;
  draft: Draft;
  /** Addresses from the mail already loaded, offered under To. */
  people: MailAddress[];
  onChange: (next: Draft) => void;
  onClose: () => void;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [showBcc, setShowBcc] = useState(draft.bcc !== "");
  const [showCc, setShowCc] = useState(draft.cc !== "" || draft.bcc !== "");
  const [toFocused, setToFocused] = useState(false);
  // A reply or forward names a message in the open mailbox, so only a new message can change sender.
  const locked = Boolean(draft.inReplyTo || draft.forwardOf);
  const [fromId, setFromId] = useState(mailbox);
  const sender = locked ? mailbox : fromId;
  const from = mailboxes.find((m) => m.resourceId === sender)?.address ?? "";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const title = draft.inReplyTo ? "Reply" : draft.forwardOf ? "Forward" : "New message";
  const hints = toFocused ? suggest(draft.to, people) : [];

  async function send() {
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`/admin/mail/mailboxes/${enc(sender)}/send`, {
        to: splitAddresses(draft.to),
        cc: splitAddresses(draft.cc),
        bcc: splitAddresses(draft.bcc),
        subject: draft.subject,
        text: draft.text,
        ...(draft.inReplyTo ? { inReplyTo: draft.inReplyTo } : {}),
        ...(draft.forwardOf ? { forwardOf: draft.forwardOf } : {}),
      });
      onSent();
    } catch (err) {
      setProblem(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const empty = splitAddresses(draft.to).length + splitAddresses(draft.cc).length + splitAddresses(draft.bcc).length === 0;

  const fromSelect = (className: string) => (
    <select
      style={phone ? bare : undefined}
      aria-label="From"
      value={sender}
      disabled={locked || mailboxes.length < 2}
      onChange={(event) => setFromId(event.target.value)}
      className={className}
    >
      {mailboxes.map((m) => (
        <option key={m.resourceId} value={m.resourceId}>
          {m.address}
        </option>
      ))}
    </select>
  );

  const bodyFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    // A reply opens with the quote below an empty first line; start typing above it.
    if (draft.inReplyTo && event.currentTarget.selectionStart === event.currentTarget.value.length) {
      event.currentTarget.setSelectionRange(0, 0);
    }
  };

  if (phone) {
    // The row shows focus, not a ring around a borderless field.
    const row = "flex min-h-12 items-center gap-3 border-b border-mist-100 px-4 focus-within:border-wine-500";
    const label = "w-12 shrink-0 text-[14px] text-slate-600";
    const field = "min-w-0 flex-1 bg-transparent py-3 text-[15px] text-plum-950 outline-none placeholder:text-slate-550";
    return (
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
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
                  aria-label="Close"
                  title="Close"
                  disabled={busy}
                  className="c-tap grid h-11 w-11 place-items-center rounded-full text-plum-950 hover:bg-mist-100"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </button>
              </Dialog.Close>
              <Dialog.Title className="min-w-0 flex-1 truncate pl-1 text-[18px] font-semibold text-plum-950">{title}</Dialog.Title>
              <button
                type="button"
                aria-label={busy ? "Sending" : "Send"}
                title="Send"
                disabled={busy || empty}
                onClick={() => void send()}
                className="c-tap grid h-11 w-11 place-items-center rounded-full text-wine-700 hover:bg-wine-50 disabled:text-mist-400"
              >
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {problem && (
              <div className="shrink-0 px-4 pb-2">
                <ErrorNote error={problem} />
              </div>
            )}

            <div className="shrink-0 border-t border-mist-100">
              <div className={row}>
                <span className={label}>From</span>
                <span className="relative flex min-w-0 flex-1 items-center">
                  {fromSelect(
                    "min-w-0 flex-1 appearance-none truncate bg-transparent py-3 pr-6 text-[15px] text-plum-950 outline-none disabled:opacity-100",
                  )}
                  {!locked && mailboxes.length > 1 && (
                    <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-slate-550" aria-hidden="true" />
                  )}
                </span>
              </div>
              <div className={row}>
                <label htmlFor="mail-to" className={label}>
                  To
                </label>
                <input
                  id="mail-to"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="off"
                  className={field}
                  style={bare}
                  value={draft.to}
                  autoFocus={!locked}
                  onFocus={() => setToFocused(true)}
                  onBlur={() => setToFocused(false)}
                  onChange={(event) => set("to", event.target.value)}
                />
                {!showCc && (
                  <button
                    type="button"
                    aria-label="Add Cc and Bcc"
                    title="Add Cc and Bcc"
                    onClick={() => setShowCc(true)}
                    className="c-tap -mr-2 grid h-11 w-11 place-items-center rounded-full text-slate-600 hover:bg-mist-100"
                  >
                    <ChevronDown className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {hints.length > 0 && (
                <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-mist-100 px-4 py-2">
                  {hints.map((p) => (
                    <button
                      key={p.address}
                      type="button"
                      // Keeps the field focused so the tap lands before the chips hide.
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => set("to", withPicked(draft.to, p.address))}
                      className="c-tap inline-flex h-9 max-w-[16rem] shrink-0 items-center gap-2 rounded-full border border-mist-200 bg-white pl-1 pr-3 text-[13px] text-plum-950 active:bg-mist-100"
                    >
                      <LetterAvatar text={p.name || p.address} toneKey={p.address} size="xs" />
                      <span className="truncate">{p.name || p.address}</span>
                    </button>
                  ))}
                </div>
              )}
              {showCc && (
                <>
                  <div className={row}>
                    <label htmlFor="mail-cc" className={label}>
                      Cc
                    </label>
                    <input
                      id="mail-cc"
                      inputMode="email"
                      autoCapitalize="off"
                      className={field}
                  style={bare}
                      value={draft.cc}
                      onChange={(event) => set("cc", event.target.value)}
                    />
                  </div>
                  <div className={row}>
                    <label htmlFor="mail-bcc" className={label}>
                      Bcc
                    </label>
                    <input
                      id="mail-bcc"
                      inputMode="email"
                      autoCapitalize="off"
                      className={field}
                  style={bare}
                      value={draft.bcc}
                      onChange={(event) => set("bcc", event.target.value)}
                    />
                  </div>
                </>
              )}
              <div className={row}>
                <input
                  aria-label="Subject"
                  placeholder="Subject"
                  className={field}
                  style={bare}
                  value={draft.subject}
                  maxLength={500}
                  onChange={(event) => set("subject", event.target.value)}
                />
              </div>
            </div>

            <textarea
              style={bare}
              aria-label="Message"
              placeholder="Compose email"
              className="min-h-0 flex-1 resize-none bg-transparent px-4 pb-[calc(1rem+var(--safe-b))] pt-3 text-[15px] leading-relaxed text-plum-950 outline-none placeholder:text-slate-550"
              value={draft.text}
              autoFocus={locked}
              onFocus={bodyFocus}
              onChange={(event) => set("text", event.target.value)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={title}
      description={`From ${from}`}
      widthClassName="sm:w-[min(44rem,calc(100vw-2rem))]"
      footer={
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || empty} onClick={() => void send()}>
            {busy ? "Sending" : "Send"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Discard
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {problem && <ErrorNote error={problem} />}
        {!locked && mailboxes.length > 1 && <Field label="From">{fromSelect(inputClass)}</Field>}
        <Field label="To" hint="Separate addresses with commas.">
          <input
            className={inputClass}
            list="mail-people"
            value={draft.to}
            autoFocus={!locked}
            onChange={(event) => set("to", event.target.value)}
          />
          <datalist id="mail-people">
            {people.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Cc">
          <input className={inputClass} value={draft.cc} onChange={(event) => set("cc", event.target.value)} />
        </Field>
        {showBcc ? (
          <Field label="Bcc">
            <input className={inputClass} value={draft.bcc} onChange={(event) => set("bcc", event.target.value)} />
          </Field>
        ) : (
          <button
            type="button"
            className="c-tap text-[12px] font-semibold text-wine-700 hover:underline"
            onClick={() => setShowBcc(true)}
          >
            Add Bcc
          </button>
        )}
        <Field label="Subject">
          <input
            className={inputClass}
            value={draft.subject}
            maxLength={500}
            onChange={(event) => set("subject", event.target.value)}
          />
        </Field>
        <Field label="Message">
          <textarea
            className={`${inputClass} min-h-60`}
            value={draft.text}
            autoFocus={locked}
            onFocus={bodyFocus}
            onChange={(event) => set("text", event.target.value)}
          />
        </Field>
      </div>
    </BottomSheet>
  );
}

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
