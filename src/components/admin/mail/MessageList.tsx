"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Mail,
  MailOpen,
  MoreVertical,
  Paperclip,
  RotateCw,
  Star,
  Trash2,
  Inbox,
} from "lucide-react";
import type { MailFolder, MailMessagePage, MailMessageSummary } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { EmptyState, ErrorNote, Skeleton } from "@/components/admin/ui";
import {
  MenuLabel,
  MenuRow,
  MenuSeparator,
  STARRED,
  announceMailChange,
  asApiError,
  enc,
  folderIcon,
  folderLabel,
  hasFiles,
  keyOf,
  listDate,
  who,
} from "./shared";

type Patch = { unseen?: boolean; flagged?: boolean };

/** Flag and move calls, grouped per folder, since a Starred page spans several. */
export function useMailActions(mailbox: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);

  async function run(items: MailMessageSummary[], body: (uids: number[]) => { path: string; payload: unknown }) {
    const groups = new Map<string, number[]>();
    for (const m of items) groups.set(m.folder, [...(groups.get(m.folder) ?? []), m.uid]);
    setBusy(true);
    setProblem(null);
    try {
      await Promise.all(
        [...groups].map(([folder, uids]) => {
          const { path, payload } = body(uids);
          return api.post(`/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folder)}/messages/${path}`, payload);
        }),
      );
      announceMailChange();
      onDone();
      return true;
    } catch (err) {
      setProblem(asApiError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    problem,
    flags: (items: MailMessageSummary[], change: { read?: boolean; flagged?: boolean }) =>
      run(items, (uids) => ({ path: "flags", payload: { uids, ...change } })),
    move: (items: MailMessageSummary[], targetFolder: string) =>
      run(items, (uids) => ({ path: "move", payload: { uids, targetFolder } })),
  };
}

export function MessageList({
  mailbox,
  folderPath,
  folders,
  state,
  page,
  filtered,
  onPage,
  onOpen,
  onRefresh,
  onChanged,
  onFolderSettings,
}: {
  mailbox: string;
  folderPath: string;
  folders: MailFolder[];
  state: { data: MailMessagePage | null; error: ApiError | null; loading: boolean; reload: () => void };
  page: number;
  filtered: boolean;
  onPage: (page: number) => void;
  onOpen: (m: MailMessageSummary) => void;
  onRefresh: () => void;
  onChanged: () => void;
  onFolderSettings: (() => void) | null;
}) {
  const data = state.data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [patches, setPatches] = useState<Map<string, Patch>>(new Map());

  /* Local edits give way to whatever the server says next. The parent keys this
     component by folder, filters and page, so the ticks reset with the list. */
  const [seenData, setSeenData] = useState(data);
  if (seenData !== data) {
    setSeenData(data);
    setPatches(new Map());
  }

  const actions = useMailActions(mailbox, onChanged);
  const items = (data?.items ?? []).map((m) => ({ ...m, ...patches.get(keyOf(m)) }));
  const picked = items.filter((m) => selected.has(keyOf(m)));
  const trash = folders.find((f) => f.specialUse === "\\Trash") ?? null;
  const inTrash = trash !== null && trash.path === folderPath;
  const targets = folders.filter((f) => f.path !== folderPath);

  function patch(list: MailMessageSummary[], change: Patch) {
    setPatches((prev) => {
      const next = new Map(prev);
      for (const m of list) next.set(keyOf(m), { ...next.get(keyOf(m)), ...change });
      return next;
    });
  }

  async function setRead(list: MailMessageSummary[], read: boolean) {
    patch(list, { unseen: !read });
    await actions.flags(list, { read });
  }

  async function setStar(list: MailMessageSummary[], flagged: boolean) {
    patch(list, { flagged });
    await actions.flags(list, { flagged });
  }

  async function moveTo(list: MailMessageSummary[], target: string) {
    if (await actions.move(list, target)) setSelected(new Set());
  }

  function selectWhere(test: (m: MailMessageSummary) => boolean) {
    setSelected(new Set(items.filter(test).map(keyOf)));
  }

  const allOn = items.length > 0 && picked.length === items.length;
  const someOn = picked.length > 0 && !allOn;
  const start = data && data.total > 0 ? (data.page - 1) * 25 + 1 : 0;
  const end = data ? start + Math.max(data.items.length - 1, 0) : 0;

  return (
    <div className="min-w-0">
      <div className="flex min-h-12 items-center gap-1 border-b border-mist-100 px-1.5 py-1 sm:px-2.5">
        <SelectAll
          checked={allOn}
          indeterminate={someOn}
          disabled={items.length === 0}
          onToggle={() => setSelected(allOn || someOn ? new Set() : new Set(items.map(keyOf)))}
          onPick={(which) => {
            if (which === "all") selectWhere(() => true);
            if (which === "none") setSelected(new Set());
            if (which === "read") selectWhere((m) => !m.unseen);
            if (which === "unread") selectWhere((m) => m.unseen);
            if (which === "starred") selectWhere((m) => m.flagged);
          }}
        />

        {picked.length === 0 ? (
          <>
            <ToolIcon label="Refresh" icon={RotateCw} onClick={onRefresh} />
            <ResponsiveMenu
              title="More"
              align="start"
              trigger={
                <button
                  type="button"
                  aria-label="More"
                  title="More"
                  className="c-tap grid h-11 w-11 place-items-center rounded-lg text-slate-600 hover:bg-mist-100 sm:h-7 sm:w-7"
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>
              }
              items={(kind) => (
                <>
                  <MenuRow
                    kind={kind}
                    disabled={!items.some((m) => m.unseen)}
                    onSelect={() => void setRead(items.filter((m) => m.unseen), true)}
                  >
                    <MailOpen className="h-4 w-4 text-slate-550" aria-hidden="true" />
                    Mark this page as read
                  </MenuRow>
                  {onFolderSettings && (
                    <MenuRow kind={kind} onSelect={onFolderSettings}>
                      <FolderInput className="h-4 w-4 text-slate-550" aria-hidden="true" />
                      Rename or delete folder
                    </MenuRow>
                  )}
                </>
              )}
            />
          </>
        ) : (
          <div className="flex items-center gap-0.5">
            <MoveMenu targets={targets} disabled={actions.busy} onMove={(path) => void moveTo(picked, path)} />
            {trash && !inTrash && (
              <ToolIcon label="Move to trash" icon={Trash2} disabled={actions.busy} onClick={() => void moveTo(picked, trash.path)} />
            )}
            {picked.some((m) => m.unseen) ? (
              <ToolIcon label="Mark as read" icon={MailOpen} disabled={actions.busy} onClick={() => void setRead(picked, true)} />
            ) : (
              <ToolIcon label="Mark as unread" icon={Mail} disabled={actions.busy} onClick={() => void setRead(picked, false)} />
            )}
            <ToolIcon
              label={picked.every((m) => m.flagged) ? "Remove star" : "Star"}
              icon={Star}
              disabled={actions.busy}
              onClick={() => void setStar(picked, !picked.every((m) => m.flagged))}
            />
            <span className="ml-1.5 hidden text-[12px] font-medium text-slate-600 sm:inline">{picked.length} selected</span>
          </div>
        )}

        {data && data.total > 0 && (
          <div className={`ml-auto items-center gap-0.5 ${picked.length > 0 ? "hidden sm:flex" : "flex"}`}>
            <span className="px-1.5 text-[12px] tabular-nums text-slate-600">
              {start}-{end} of {data.total.toLocaleString("en-GB")}
              {data.capped ? "+" : ""}
            </span>
            <ToolIcon label="Newer" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} />
            <ToolIcon label="Older" icon={ChevronRight} disabled={page >= data.totalPages} onClick={() => onPage(page + 1)} />
          </div>
        )}
      </div>

      {actions.problem && (
        <div className="p-3">
          <ErrorNote error={actions.problem} />
        </div>
      )}
      {state.error && (
        <div className="p-3">
          <ErrorNote error={state.error} onRetry={state.reload} />
        </div>
      )}

      {!data && state.loading ? (
        <div aria-busy="true" className="space-y-px p-2">
          <span className="sr-only">Loading messages</span>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-md" />
          ))}
        </div>
      ) : data && items.length === 0 ? (
        <EmptyState
          bare
          icon={folderPath === STARRED ? Star : Inbox}
          title={
            filtered
              ? "No messages match these filters"
              : folderPath === STARRED
                ? "No starred messages"
                : "Nothing in this folder"
          }
          hint={filtered ? "Change or clear a filter above." : undefined}
        />
      ) : (
        <ul className={`transition-opacity ${state.loading ? "opacity-60" : ""}`}>
          {items.map((m) => (
            <MessageRow
              key={keyOf(m)}
              message={m}
              folders={folders}
              showFolder={folderPath === STARRED}
              selected={selected.has(keyOf(m))}
              inTrash={inTrash || (trash !== null && m.folder === trash.path)}
              trashPath={trash?.path ?? null}
              busy={actions.busy}
              onSelect={(on) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(keyOf(m));
                  else next.delete(keyOf(m));
                  return next;
                })
              }
              onOpen={() => onOpen(m)}
              onStar={() => void setStar([m], !m.flagged)}
              onRead={(read) => void setRead([m], read)}
              onMove={(path) => void moveTo([m], path)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolIcon({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: typeof Star;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function MoveMenu({
  targets,
  disabled,
  onMove,
  compact = false,
}: {
  targets: MailFolder[];
  disabled: boolean;
  onMove: (path: string) => void;
  compact?: boolean;
}) {
  return (
    <ResponsiveMenu
      title="Move to"
      align="start"
      trigger={
        <button
          type="button"
          aria-label="Move to"
          title="Move to"
          disabled={disabled}
          className={`c-tap grid shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:opacity-40 ${
            compact ? "h-8 w-8" : "h-11 w-11 sm:h-8 sm:w-8"
          }`}
        >
          <FolderInput className="h-4 w-4" aria-hidden="true" />
        </button>
      }
      items={(kind) => (
        <>
          <MenuLabel>Move to</MenuLabel>
          {targets.map((f) => {
            const Icon = folderIcon(f, f.path);
            return (
              <MenuRow key={f.path} kind={kind} onSelect={() => onMove(f.path)}>
                <Icon className="h-4 w-4 text-slate-550" aria-hidden="true" />
                <span className="truncate">{folderLabel(f, f.path)}</span>
              </MenuRow>
            );
          })}
        </>
      )}
    />
  );
}

function SelectAll({
  checked,
  indeterminate,
  disabled,
  onToggle,
  onPick,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onToggle: () => void;
  onPick: (which: "all" | "none" | "read" | "unread" | "starred") => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className="flex items-center rounded-lg hover:bg-mist-50">
      <label className="flex min-h-11 min-w-11 items-center justify-center sm:min-h-8 sm:min-w-8">
        <input
          ref={ref}
          type="checkbox"
          aria-label="Select all on this page"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-5 w-5 cursor-pointer accent-[var(--wine-600)] disabled:cursor-not-allowed disabled:opacity-40 md:h-4 md:w-4"
        />
      </label>
      <ResponsiveMenu
        title="Select"
        align="start"
        trigger={
          <button
            type="button"
            aria-label="Select by"
            title="Select by"
            disabled={disabled}
            className="c-tap -ml-1.5 grid h-11 w-6 place-items-center rounded-md text-slate-550 hover:text-plum-950 disabled:opacity-40 sm:h-8 sm:w-5"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }
        items={(kind) => (
          <>
            <MenuRow kind={kind} onSelect={() => onPick("all")}>All</MenuRow>
            <MenuRow kind={kind} onSelect={() => onPick("none")}>None</MenuRow>
            <MenuSeparator kind={kind} />
            <MenuRow kind={kind} onSelect={() => onPick("read")}>Read</MenuRow>
            <MenuRow kind={kind} onSelect={() => onPick("unread")}>Unread</MenuRow>
            <MenuRow kind={kind} onSelect={() => onPick("starred")}>Starred</MenuRow>
          </>
        )}
      />
    </div>
  );
}

function MessageRow({
  message: m,
  folders,
  showFolder,
  selected,
  inTrash,
  trashPath,
  busy,
  onSelect,
  onOpen,
  onStar,
  onRead,
  onMove,
}: {
  message: MailMessageSummary;
  folders: MailFolder[];
  showFolder: boolean;
  selected: boolean;
  inTrash: boolean;
  trashPath: string | null;
  busy: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
  onStar: () => void;
  onRead: (read: boolean) => void;
  onMove: (path: string) => void;
}) {
  const home = folders.find((f) => f.path === m.folder) ?? null;
  const files = hasFiles(m);
  const tint = selected ? "bg-wine-50" : m.unseen ? "bg-white" : "bg-mist-50/60";
  const weight = m.unseen ? "font-semibold text-plum-950" : "font-normal text-plum-900";

  return (
    <li
      className={`group relative flex items-center border-b border-mist-100 pl-1.5 pr-2 transition-colors last:border-b-0 hover:z-[1] hover:shadow-card sm:pl-2.5 sm:pr-3 ${tint}`}
    >
      <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center sm:min-h-8 sm:min-w-8">
        <input
          type="checkbox"
          aria-label={`Select ${m.subject || "(no subject)"}`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          className="h-5 w-5 cursor-pointer accent-[var(--wine-600)] md:h-4 md:w-4"
        />
      </label>
      <button
        type="button"
        aria-label={m.flagged ? "Starred. Remove star" : "Not starred. Star"}
        aria-pressed={m.flagged}
        onClick={onStar}
        className="c-tap order-last grid h-11 w-9 shrink-0 place-items-center rounded-md sm:order-none sm:h-8 sm:w-8"
      >
        <Star
          className={`h-4 w-4 ${m.flagged ? "fill-amber-400 text-amber-500" : "text-mist-400 group-hover:text-slate-550"}`}
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 py-2.5 pl-1 text-left sm:flex sm:items-center sm:gap-3 sm:py-2"
      >
        <span className="flex items-center gap-2 sm:w-44 sm:shrink-0">
          <span className={`min-w-0 flex-1 truncate text-[13px] ${weight}`}>{who(m)}</span>
          <span className={`shrink-0 text-[12px] sm:hidden ${m.unseen ? "font-semibold text-plum-950" : "text-slate-600"}`}>
            {listDate(m.date)}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 sm:mt-0 sm:flex-1">
          {showFolder && home && (
            <span className="shrink-0 rounded bg-mist-100 px-1.5 py-px text-[11px] font-medium text-slate-600">
              {folderLabel(home, home.path)}
            </span>
          )}
          <span className={`min-w-0 flex-1 truncate text-[13px] ${weight}`}>{m.subject || "(no subject)"}</span>
          {files && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-label="Has attachments" />}
        </span>
        <span className="sr-only">{m.unseen ? "Unread" : "Read"}</span>
      </button>

      <span
        className={`hidden w-16 shrink-0 text-right text-[12px] sm:block sm:group-hover:hidden sm:group-focus-within:hidden ${
          m.unseen ? "font-semibold text-plum-950" : "text-slate-600"
        }`}
      >
        {listDate(m.date)}
      </span>
      {/* Hover actions take the date's place, as Gmail's do. Mouse only: a phone
          ticks the box and uses the toolbar. */}
      <span className="hidden shrink-0 items-center gap-0.5 sm:group-hover:flex sm:group-focus-within:flex">
        <MoveMenu
          compact
          targets={folders.filter((f) => f.path !== m.folder)}
          disabled={busy}
          onMove={onMove}
        />
        {trashPath && !inTrash && (
          <RowIcon label="Move to trash" icon={Trash2} disabled={busy} onClick={() => onMove(trashPath)} />
        )}
        <RowIcon
          label={m.unseen ? "Mark as read" : "Mark as unread"}
          icon={m.unseen ? MailOpen : Mail}
          disabled={busy}
          onClick={() => onRead(m.unseen)}
        />
      </span>
    </li>
  );
}

function RowIcon({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Star;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:opacity-40"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
