"use client";

import { useState } from "react";
import type { MailFolder } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, ConfirmButton, ErrorNote, Field, inputClass } from "@/components/admin/ui";
import { type Draft, asApiError, enc, splitAddresses } from "./shared";

export function Composer({
  mailbox,
  from,
  draft,
  onChange,
  onClose,
  onSent,
}: {
  mailbox: string;
  from: string;
  draft: Draft;
  onChange: (next: Draft) => void;
  onClose: () => void;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [showBcc, setShowBcc] = useState(draft.bcc !== "");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const title = draft.inReplyTo ? "Reply" : draft.forwardOf ? "Forward" : "New message";

  async function send() {
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`/admin/mail/mailboxes/${enc(mailbox)}/send`, {
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

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={title}
      description={`From ${from}`}
      widthClassName="sm:w-[min(40rem,calc(100vw-2rem))]"
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
        <Field label="To" hint="Separate addresses with commas.">
          <input
            className={inputClass}
            value={draft.to}
            autoFocus={!draft.inReplyTo}
            onChange={(event) => set("to", event.target.value)}
          />
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
            className={`${inputClass} min-h-48`}
            value={draft.text}
            autoFocus={Boolean(draft.inReplyTo)}
            onFocus={(event) => {
              // A reply opens with the quote below an empty first line; start typing above it.
              if (draft.inReplyTo && event.currentTarget.selectionStart === event.currentTarget.value.length) {
                event.currentTarget.setSelectionRange(0, 0);
              }
            }}
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
