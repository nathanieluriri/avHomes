"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCw } from "lucide-react";
import {
  canFeature,
  isScopedRole,
  type AuthUser,
  type Property,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, ErrorNote, Field, inputClass } from "@/components/admin/ui";

/**
 * What the Listings screen can do to many listings at once.
 *
 * Every action here is one the single listing already has, sent through
 * `POST /admin/properties/bulk`, which runs each listing through the same rules
 * as its own route. So a refusal here reads the way it would on that listing's
 * page, and a partial run is reported row by row rather than as one failure.
 */

type BulkOp = "publish" | "unpublish" | "archive" | "unarchive" | "restore" | "submit" | "patch" | "trash";

interface BulkPatch {
  featured?: boolean;
  city?: string;
  location?: string;
}

type BulkResult =
  | { id: string; ok: true; property: Property }
  | { id: string; ok: false; status: number; error: string; detail: string };

interface BulkAction {
  key: string;
  label: string;
  description: string;
  /** Completes "7 ...": "published", "archived". */
  done: string;
  op: BulkOp;
  patch?: BulkPatch;
  /** A status or home page decision, which a partner account never makes. */
  staffOnly: boolean;
  applies: (p: Property) => boolean;
}

/* Mirrors the editor's status picker and the server's allowed-from table, so a
   listing is only sent a move it could make from its own page. */
const ACTIONS: readonly BulkAction[] = [
  {
    key: "publish",
    label: "Publish",
    description: "Put them on the public site. Ones waiting for review are approved.",
    done: "published",
    op: "publish",
    staffOnly: true,
    applies: (p) =>
      p.deletedAt === null && (p.status === "draft" || p.status === "submitted" || p.status === "archived"),
  },
  {
    key: "submit",
    label: "Send for review",
    description: "Hand the drafts to AV Homes to publish",
    done: "sent for review",
    op: "submit",
    staffOnly: false,
    applies: (p) => p.deletedAt === null && p.status === "draft",
  },
  {
    key: "unpublish",
    label: "Unpublish",
    description: "Take them off the site and back to draft",
    done: "unpublished",
    op: "unpublish",
    staffOnly: true,
    applies: (p) => p.deletedAt === null && (p.status === "live" || p.status === "under-offer"),
  },
  {
    key: "feature",
    label: "Feature on the landing page",
    description: "Only live and under offer listings can be featured",
    done: "featured",
    op: "patch",
    patch: { featured: true },
    staffOnly: true,
    applies: (p) => !p.featured && canFeature(p),
  },
  {
    key: "unfeature",
    label: "Take off the landing page",
    description: "They stay live; they stop being featured",
    done: "taken off the landing page",
    op: "patch",
    patch: { featured: false },
    staffOnly: true,
    applies: (p) => p.featured && p.deletedAt === null,
  },
  {
    key: "archive",
    label: "Archive",
    description: "Off the site, kept on record",
    done: "archived",
    op: "archive",
    staffOnly: true,
    applies: (p) => p.deletedAt === null && p.status !== "archived",
  },
  {
    key: "unarchive",
    label: "Back to draft",
    description: "Bring them out of the archive to edit",
    done: "moved back to draft",
    op: "unarchive",
    staffOnly: true,
    applies: (p) => p.deletedAt === null && p.status === "archived",
  },
  {
    key: "restore",
    label: "Restore from the trash",
    description: "They come back as drafts",
    done: "restored",
    op: "restore",
    staffOnly: true,
    applies: (p) => p.deletedAt !== null,
  },
];

const EDIT: BulkAction = {
  key: "edit",
  label: "Set city or area",
  description: "The same city or area on every selected listing",
  done: "updated",
  op: "patch",
  staffOnly: false,
  applies: () => true,
};

const TRASH: BulkAction = {
  key: "trash",
  label: "Move to trash",
  description: "Reversible. There is no permanent delete",
  done: "moved to the trash",
  op: "trash",
  staffOnly: false,
  applies: (p) => p.deletedAt === null,
};

interface Outcome {
  action: BulkAction;
  ok: number;
  refused: { id: string; title: string; detail: string }[];
  /** Selected, but not a listing this action applies to, so never sent. */
  skipped: number;
}

type Mode = "menu" | "edit" | "trash" | "running" | "result";

function plural(n: number, noun = "listing"): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function BulkActions({
  selected,
  user,
  onClear,
  onDone,
}: {
  selected: readonly Property[];
  user: AuthUser;
  onClear: () => void;
  /** Called with the ids that changed, once the list should be fetched again. */
  onDone: (changed: ReadonlySet<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");

  const scoped = isScopedRole(user.role);
  const offered = ACTIONS.filter((a) => !(scoped && a.staffOnly))
    .map((action) => ({ action, count: selected.filter(action.applies).length }))
    .filter(({ count }) => count > 0);
  const trashable = selected.filter(TRASH.applies).length;

  function show(next: boolean) {
    if (mode === "running") return;
    setOpen(next);
    if (!next) {
      // Closing after a run is the moment the list catches up.
      setMode("menu");
      setError(null);
      setOutcome(null);
    }
  }

  async function run(action: BulkAction, patch?: BulkPatch) {
    const targets = selected.filter(action.applies);
    setMode("running");
    setError(null);
    try {
      const res = await api.post<{ results: BulkResult[] }>("/admin/properties/bulk", {
        ids: targets.map((p) => p.id),
        op: action.op,
        ...(patch ? { patch } : {}),
        revisions: Object.fromEntries(targets.map((p) => [p.id, p.revision])),
      });
      const title = new Map(targets.map((p) => [p.id, p.title || "Untitled listing"]));
      const changed = new Set(res.results.filter((r) => r.ok).map((r) => r.id));
      setOutcome({
        action,
        ok: changed.size,
        refused: res.results.flatMap((r) =>
          r.ok ? [] : [{ id: r.id, title: title.get(r.id) ?? r.id, detail: r.detail }],
        ),
        skipped: selected.length - targets.length,
      });
      setMode("result");
      if (changed.size > 0) onDone(changed);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setMode(action.key === "edit" ? "edit" : action.key === "trash" ? "trash" : "menu");
    }
  }

  const editPatch: BulkPatch = {
    ...(city.trim() ? { city: city.trim() } : {}),
    ...(area.trim() ? { location: area.trim() } : {}),
  };

  const title =
    mode === "result" && outcome
      ? summaryOf(outcome)
      : mode === "edit"
        ? "Set city or area"
        : mode === "trash"
          ? `Move ${plural(trashable)} to the trash?`
          : `${plural(selected.length)} selected`;

  const footer =
    mode === "edit" ? (
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="ml-auto" onClick={() => setMode("menu")}>
          Back
        </Button>
        <Button onClick={() => void run(EDIT, editPatch)} disabled={Object.keys(editPatch).length === 0}>
          Apply to {plural(selected.length)}
        </Button>
      </div>
    ) : mode === "trash" ? (
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="ml-auto" onClick={() => setMode("menu")}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void run(TRASH)}>
          Yes, move {plural(trashable)} to trash
        </Button>
      </div>
    ) : mode === "result" ? (
      <div className="flex items-center gap-2">
        <Button className="ml-auto" onClick={() => show(false)}>
          Done
        </Button>
      </div>
    ) : undefined;

  // The sheet outlives the selection: a run that clears every row still has its result to show.
  const bar =
    typeof document === "undefined" || selected.length === 0
      ? null
      : createPortal(
          /* The save bar's pill and its place on screen, since it is the same
             kind of thing: a state the page is in, with its way out beside it.
             `c-savebar` also reserves the room under the last row for it. */
          <div
            role="status"
            className="c-savebar console-float pointer-events-none fixed inset-x-0 bottom-[var(--c-kb)] z-[60] flex justify-center px-3 pt-3 pb-[calc(0.75rem+var(--safe-b))] sm:px-4 sm:pt-4 sm:pb-[calc(1rem+var(--safe-b))]"
          >
            <div className="pointer-events-auto flex w-full max-w-lg items-center gap-2 rounded-2xl bg-plum-950 p-3 shadow-pop sm:gap-3 sm:py-2 sm:pl-4 sm:pr-2">
              <p className="c-num min-w-0 flex-1 truncate text-[13px] font-medium text-white">
                {selected.length} selected
              </p>
              <button
                type="button"
                onClick={onClear}
                className="c-tap h-11 shrink-0 rounded-lg px-4 text-[13px] font-semibold text-wine-100 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:px-3"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => show(true)}
                className="c-tap c-bevel-primary inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-wine-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-wine-700 sm:h-8 sm:px-3.5"
              >
                Actions
              </button>
            </div>
          </div>,
          document.body,
        );

  return (
    <>
      {bar}
      <BottomSheet open={open} onOpenChange={show} title={title} footer={footer}>
        {error && (
          <div className="mb-3">
            <ErrorNote error={error} />
          </div>
        )}

        {mode === "menu" && (
          <div role="group" aria-label="Actions for the selected listings" className="space-y-1">
            {offered.length === 0 && trashable === 0 && (
              <p className="py-2 text-[13px] text-slate-600">
                Nothing can be done to all of these at once. Open a listing to change it on its own.
              </p>
            )}
            {offered.map(({ action, count }) => (
              <ActionRow
                key={action.key}
                label={action.label}
                description={action.description}
                count={count}
                total={selected.length}
                onClick={() => void run(action, action.patch)}
              />
            ))}
            <ActionRow
              label={EDIT.label}
              description={EDIT.description}
              count={selected.length}
              total={selected.length}
              onClick={() => {
                setError(null);
                setMode("edit");
              }}
            />
            {trashable > 0 && (
              <ActionRow
                label={TRASH.label}
                description={TRASH.description}
                count={trashable}
                total={selected.length}
                danger
                onClick={() => {
                  setError(null);
                  setMode("trash");
                }}
              />
            )}
          </div>
        )}

        {mode === "edit" && (
          <div className="space-y-4">
            <p className="text-[13px] text-slate-600">
              Leave a box empty to keep what each listing already says. A listing on the site still has to
              keep a city.
            </p>
            <Field label="City">
              <input
                className={inputClass}
                value={city}
                maxLength={120}
                placeholder="Abuja"
                onChange={(event) => setCity(event.target.value)}
              />
            </Field>
            <Field label="Area">
              <input
                className={inputClass}
                value={area}
                maxLength={200}
                placeholder="Guzape"
                onChange={(event) => setArea(event.target.value)}
              />
            </Field>
          </div>
        )}

        {mode === "trash" && (
          <p className="text-[13px] leading-relaxed text-slate-600">
            They come off the site and stay in this list marked In trash, so AV Homes can restore any of
            them. Nothing is deleted for good, because an enquiry may still name one.
            {selected.length > trashable &&
              ` ${plural(selected.length - trashable)} already in the trash will be left as they are.`}
          </p>
        )}

        {mode === "running" && (
          <p role="status" className="flex items-center gap-2 py-2 text-[13px] text-slate-600">
            <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            Working through the listings
          </p>
        )}

        {mode === "result" && outcome && <OutcomeDetail outcome={outcome} />}
      </BottomSheet>
    </>
  );
}

/** "7 published, 2 refused", the sheet's headline once a run is back. */
function summaryOf(o: Outcome): string {
  const parts = [`${o.ok} ${o.action.done}`];
  if (o.refused.length > 0) parts.push(`${o.refused.length} refused`);
  return parts.join(", ");
}

function OutcomeDetail({ outcome }: { outcome: Outcome }) {
  // The same reason usually applies to several rows, so it is said once over them.
  const byReason = new Map<string, string[]>();
  for (const r of outcome.refused) byReason.set(r.detail, [...(byReason.get(r.detail) ?? []), r.title]);

  return (
    <div className="space-y-3 text-[13px]">
      {outcome.ok > 0 && (
        <p className="flex items-center gap-2 text-plum-950">
          <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          {plural(outcome.ok)} {outcome.action.done}.
        </p>
      )}
      {[...byReason].map(([reason, titles]) => (
        <div key={reason} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          <p className="font-semibold">
            {plural(titles.length)} refused: {reason}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {titles.map((t, i) => (
              <li key={`${t}-${i}`} className="break-words">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {outcome.skipped > 0 && (
        <p className="text-slate-600">
          {plural(outcome.skipped)} left alone, because {outcome.skipped === 1 ? "it is" : "they are"} not in a
          state this applies to.
        </p>
      )}
    </div>
  );
}

/** A full-width row, as in the filter sheet: the action, what it does, and how many it reaches. */
function ActionRow({
  label,
  description,
  count,
  total,
  danger = false,
  onClick,
}: {
  label: string;
  description: string;
  count: number;
  total: number;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-mist-100"
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${danger ? "text-red-700" : "text-plum-950"}`}>
          {label}
        </span>
        <span className="block text-[12px] text-slate-600">{description}</span>
      </span>
      {/* Only when it reaches fewer than were picked, so the reader knows the rest are left alone. */}
      {count < total && (
        <span className="c-num shrink-0 rounded bg-mist-100 px-1.5 py-0.5 text-[12px] font-semibold text-slate-600">
          {count} of {total}
        </span>
      )}
    </button>
  );
}
