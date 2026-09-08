"use client";

import { useState } from "react";
import { ArrowUpRight, Trash2, X } from "lucide-react";
import { NOTE_STATUSES, type DesignNote, type NoteStatus } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { dateTime } from "@/lib/admin/format";
import { Badge, Button, ErrorNote, type Tone } from "@/components/admin/ui";
import { MarkLayer } from "./marks";

/**
 * One note, its picture, and everything that has happened to it.
 *
 * This is the "monitor progress" half of the studio. The status is a real state
 * machine somebody moves through, and every move lands in the same trail as the
 * replies, so the panel reads top to bottom as a story rather than as a status
 * field with a comment box beside it.
 */

const TONE: Record<NoteStatus, Tone> = {
  open: "wine",
  "in-progress": "amber",
  done: "green",
  declined: "neutral",
};

const LABEL: Record<NoteStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  done: "Done",
  declined: "Not doing",
};

/** What each move MEANS, in the words of somebody who is not a developer. */
const MOVE_HINT: Record<NoteStatus, string> = {
  open: "Put it back on the pile",
  "in-progress": "Somebody is on it",
  done: "Changed on the site",
  declined: "Decided against, with a reason",
};

export function NoteReview({
  note,
  onChange,
  onDeleted,
  onClose,
}: {
  note: DesignNote;
  onChange: (next: DesignNote) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function patch(body: { status?: NoteStatus; reply?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ note: DesignNote }>(`/admin/notes/${note.id}`, {
        ...body,
        baseRevision: note.revision,
      });
      onChange(res.note);
      if (body.reply !== undefined) setReply("");
    } catch (err) {
      const apiError = asApiError(err);
      setError(apiError);
      // A 409 carries the other version. Adopting it means the next press quotes
      // the revision that actually exists rather than failing again.
      const theirs = apiError.body.note as DesignNote | undefined;
      if (theirs) onChange(theirs);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/admin/notes/${note.id}`);
      onDeleted(note.id);
    } catch (err) {
      setError(asApiError(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-mist-200 px-4 py-3">
        <Badge tone={TONE[note.status]}>{LABEL[note.status]}</Badge>
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{note.path}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close note"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <a
          href={note.shotUrl}
          target="_blank"
          rel="noreferrer"
          title="Open the full picture"
          className="relative block overflow-hidden rounded-xl border border-mist-200"
          style={{ aspectRatio: `${note.shotWidth} / ${note.shotHeight}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={note.shotUrl} alt={`The page at ${note.path}`} className="block h-full w-full object-contain" />
          <MarkLayer marks={note.marks} width={note.shotWidth} height={note.shotHeight} />
        </a>

        <div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-plum-950">
            {note.comment}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-550">
            {note.createdByName} · {dateTime(note.createdAt)}
          </p>
        </div>

        {note.kind === "copy" && (
          <div className="space-y-2 rounded-xl border border-mist-200 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Wording
            </p>
            <p className="rounded-lg bg-red-50 p-2 text-[13px] leading-relaxed text-red-900 line-through decoration-red-300">
              {note.copyBefore || "(empty)"}
            </p>
            <p className="rounded-lg bg-emerald-50 p-2 text-[13px] leading-relaxed text-emerald-900">
              {note.copyAfter || "(empty)"}
            </p>
          </div>
        )}

        {note.attachments.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Inspiration
            </p>
            <div className="grid grid-cols-2 gap-2">
              {note.attachments.map((item, index) =>
                item.kind === "image" ? (
                  <a key={index} href={item.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.label}
                      className="aspect-[4/3] w-full rounded-lg border border-mist-200 object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={index}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 flex items-center gap-1.5 rounded-lg bg-mist-50 px-2.5 py-2 text-[12px] font-medium text-wine-700 hover:bg-mist-100"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ),
              )}
            </div>
          </div>
        )}

        {note.events.length > 0 && (
          <ol className="space-y-2 border-t border-mist-100 pt-3">
            {note.events.map((event) => (
              <li key={event.id} className="text-[12px]">
                <span className="font-semibold text-plum-950">{event.byName}</span>{" "}
                <span className="text-slate-550">{dateTime(event.at)}</span>
                <p className="mt-0.5 text-slate-600">
                  {event.kind === "status"
                    ? `Moved to ${LABEL[event.text as NoteStatus] ?? event.text}`
                    : event.text}
                </p>
              </li>
            ))}
          </ol>
        )}

        {error && <ErrorNote error={error} />}
      </div>

      <footer className="shrink-0 space-y-2 border-t border-mist-200 p-3">
        <div className="flex flex-wrap gap-1.5">
          {NOTE_STATUSES.filter((status) => status !== note.status).map((status) => (
            <Button
              key={status}
              variant="ghost"
              size="sm"
              disabled={busy}
              title={MOVE_HINT[status]}
              onClick={() => void patch({ status })}
            >
              {LABEL[status]}
            </Button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={2}
            placeholder="Add to the thread"
            className="max-h-32 min-h-[3rem] flex-1 resize-none rounded-lg border border-mist-200 px-3 py-2 text-[13px] text-plum-950 outline-none placeholder:text-slate-550 focus:border-wine-500"
          />
          <Button
            size="lg"
            disabled={busy || reply.trim() === ""}
            onClick={() => void patch({ reply: reply.trim() })}
          >
            Post
          </Button>
        </div>

        {/* Two presses, because a note is the only record of what somebody asked
            for and there is no trash to fish it back out of. */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2">
            <p className="flex-1 text-[12px] text-red-900">Delete this note for good?</p>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-1 text-[12px] text-slate-600 transition-colors hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete note
          </button>
        )}
      </footer>
    </div>
  );
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}
