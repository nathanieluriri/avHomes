"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { MailFolder } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { Button, ErrorNote, IconButton, Skeleton, inputClass } from "@/components/admin/ui";
import { STARRED, asApiError, enc, folderIcon, folderLabel, isSpecial } from "./shared";

/**
 * The mail page's own rail: Compose, the system folders, then the ones
 * somebody made. Rows reuse the console rail's `c-row`, so the current folder
 * gets the same white plate the current screen does.
 */
export function MailRail({
  mailbox,
  folders,
  loading,
  error,
  current,
  onPick,
  onCompose,
  onChanged,
  showCompose = true,
}: {
  showCompose?: boolean;
  mailbox: string;
  folders: MailFolder[];
  loading: boolean;
  error: ApiError | null;
  current: string;
  onPick: (path: string) => void;
  onCompose: () => void;
  onChanged: () => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);

  const system = folders.filter(isSpecial);
  const custom = folders.filter((f) => !isSpecial(f));
  const inboxAt = system.findIndex((f) => f.specialUse === "\\Inbox" || f.path === "INBOX");
  // Starred sits under Inbox, as it does in Gmail.
  const rows: (MailFolder | null)[] = [...system];
  rows.splice(inboxAt + 1, 0, null);

  async function create() {
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`/admin/mail/mailboxes/${enc(mailbox)}/folders`, { name: name.trim() });
      setName("");
      setNaming(false);
      onChanged();
    } catch (err) {
      setProblem(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function row(f: MailFolder | null) {
    const path = f?.path ?? STARRED;
    const Icon = folderIcon(f, path);
    const here = path === current;
    // Drafts counts what is there; everything else counts what is unread. Sent and Trash count nothing.
    const count =
      f === null || f.specialUse === "\\Sent" || f.specialUse === "\\Trash"
        ? 0
        : f.specialUse === "\\Drafts"
          ? f.messageCount
          : f.unreadCount;
    return (
      <li key={path}>
        <button
          type="button"
          onClick={() => onPick(path)}
          aria-current={here ? "page" : undefined}
          className="c-row w-full text-left"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{folderLabel(f, path)}</span>
          {count > 0 && (
            <span
              className={`shrink-0 text-[12px] tabular-nums ${f?.specialUse === "\\Drafts" ? "font-medium text-slate-600" : "font-bold text-plum-950"}`}
              aria-label={f?.specialUse === "\\Drafts" ? `${count} drafts` : `${count} unread`}
            >
              {count > 999 ? "999+" : count}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <nav aria-label="Mail folders">
      {showCompose && (
        <Button size="lg" className="mb-3 w-full" onClick={onCompose}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Compose
        </Button>
      )}

      {error && (
        <div className="mb-3">
          <ErrorNote error={error} />
        </div>
      )}

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1 lg:gap-0.5">{rows.map(row)}</ul>

          <div className="mt-5 flex items-center gap-2 pl-2">
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Folders</span>
            <IconButton
              label="New folder"
              icon={Plus}
              size="dense"
              onClick={() => {
                setNaming((v) => !v);
                setProblem(null);
              }}
            />
          </div>
          {naming && (
            <form
              className="mt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim() !== "") void create();
              }}
            >
              <input
                className={inputClass}
                value={name}
                placeholder="Folder name"
                aria-label="New folder name"
                maxLength={100}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busy || name.trim() === ""}>
                  {busy ? "Creating" : "Create"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {problem && (
            <div className="mt-2">
              <ErrorNote error={problem} />
            </div>
          )}
          {custom.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1 lg:gap-0.5">{custom.map(row)}</ul>
          ) : (
            !naming && <p className="mt-1.5 pl-2 text-[12px] text-slate-550">None yet.</p>
          )}
        </>
      )}
    </nav>
  );
}
