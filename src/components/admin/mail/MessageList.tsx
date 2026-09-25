"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Inbox,
  Keyboard,
  Mail,
  MailOpen,
  MoreVertical,
  Paperclip,
  RotateCw,
  Star,
  Trash2,
} from "lucide-react";
import type { MailDensity, MailFolder, MailMessagePage, MailMessageSummary } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet, ResponsiveMenu } from "@/components/admin/BottomSheet";
import { EmptyState, ErrorNote, Skeleton } from "@/components/admin/ui";
import { PhoneRow, SelectionBar } from "./PhoneList";
import {
  MenuRow,
  MenuSeparator,
  MoveMenu,
  STARRED,
  ToolIcon,
  announceMailChange,
  asApiError,
  enc,
  folderLabel,
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
  variant = "desk",
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
  lead,
  label,
  onScrollDown,
  density = "comfortable",
  onDensity,
  keys = false,
}: {
  /** "phone" draws Gmail's app list: avatars, long-press selection, a toolbar over the search bar. */
  variant?: "desk" | "phone";
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
  /** Phone only: scrolls away above the rows (the filter chips). */
  lead?: ReactNode;
  /** Phone only: the folder's name over the rows. */
  label?: string;
  /** Phone only: told which way the list last scrolled, for the compose button. */
  onScrollDown?: (down: boolean) => void;
  density?: MailDensity;
  onDensity?: (next: MailDensity) => void;
  /** Desk only: j, k, o, x, s, # and friends act on the list. */
  keys?: boolean;
}) {
  const data = state.data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [patches, setPatches] = useState<Map<string, Patch>>(new Map());
  const lastTop = useRef(0);
  const [cursor, setCursor] = useState(-1);
  const [help, setHelp] = useState(false);

  /* Local edits give way to whatever the server says next. The parent keys this
     component by folder, filters and page, so the ticks reset with the list. */
  const [seenData, setSeenData] = useState(data);
  if (seenData !== data) {
    setSeenData(data);
    setPatches(new Map());
    setCursor(-1);
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

  function toggle(m: MailMessageSummary, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(keyOf(m));
      else next.delete(keyOf(m));
      return next;
    });
  }

  /* Gmail's keys. Read through refs, so the listener is bound once and always sees this render. */
  const keyState = useRef({ items, cursor, selected, trash, inTrash });
  const keyActions = useRef({ onOpen, toggle, setStar, setRead, moveTo });
  useEffect(() => {
    keyState.current = { items, cursor, selected, trash, inTrash };
    keyActions.current = { onOpen, toggle, setStar, setRead, moveTo };
  });
  useEffect(() => {
    if (!keys) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      const { items: list, cursor: at, selected: sel, trash: bin, inTrash: binned } = keyState.current;
      const act = keyActions.current;
      const current = list[at] ?? null;
      const move = (to: number) => {
        const next = Math.max(0, Math.min(list.length - 1, to));
        setCursor(next);
        document.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
      };
      switch (event.key) {
        case "j":
          move(at + 1);
          break;
        case "k":
          move(at < 0 ? 0 : at - 1);
          break;
        case "o":
        case "Enter":
          if (!current) return;
          act.onOpen(current);
          break;
        case "x":
          if (!current) return;
          act.toggle(current, !sel.has(keyOf(current)));
          break;
        case "s":
          if (!current) return;
          void act.setStar([current], !current.flagged);
          break;
        case "#":
          if (!current || !bin || binned) return;
          void act.moveTo([current], bin.path);
          break;
        case "I":
          if (!current) return;
          void act.setRead([current], true);
          break;
        case "U":
          if (!current) return;
          void act.setRead([current], false);
          break;
        case "?":
          setHelp(true);
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys]);

  const allOn = items.length > 0 && picked.length === items.length;
  const someOn = picked.length > 0 && !allOn;
  const start = data && data.total > 0 ? (data.page - 1) * 25 + 1 : 0;
  const end = data ? start + Math.max(data.items.length - 1, 0) : 0;
  const range = data && data.total > 0 ? `${start}-${end} of ${data.total.toLocaleString("en-GB")}${data.capped ? "+" : ""}` : "";
  const size = variant === "phone" ? "touch" : "desk";

  const bulk = (
    <>
      <MoveMenu size={size} targets={targets} disabled={actions.busy} onMove={(path) => void moveTo(picked, path)} />
      {trash && !inTrash && (
        <ToolIcon size={size} label="Move to trash" icon={Trash2} disabled={actions.busy} onClick={() => void moveTo(picked, trash.path)} />
      )}
      {picked.some((m) => m.unseen) ? (
        <ToolIcon size={size} label="Mark as read" icon={MailOpen} disabled={actions.busy} onClick={() => void setRead(picked, true)} />
      ) : (
        <ToolIcon size={size} label="Mark as unread" icon={Mail} disabled={actions.busy} onClick={() => void setRead(picked, false)} />
      )}
      <ToolIcon
        size={size}
        label={picked.every((m) => m.flagged) ? "Remove star" : "Star"}
        icon={Star}
        disabled={actions.busy}
        onClick={() => void setStar(picked, !picked.every((m) => m.flagged))}
      />
    </>
  );

  const moreMenu = (touch: boolean) => (
    <ResponsiveMenu
      title="More"
      align={touch ? "end" : "start"}
      trigger={
        <button
          type="button"
          aria-label={touch ? "Folder options" : "More"}
          title={touch ? "Folder options" : "More"}
          className={`c-tap grid place-items-center rounded-full text-slate-600 hover:bg-mist-100 ${touch ? "h-11 w-11" : "h-11 w-11 sm:h-7 sm:w-7 sm:rounded-lg"}`}
        >
          <MoreVertical className={touch ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
        </button>
      }
      items={(kind) => (
        <>
          {touch && (
            <MenuRow kind={kind} onSelect={onRefresh}>
              <RotateCw className="h-4 w-4 text-slate-550" aria-hidden="true" />
              Refresh
            </MenuRow>
          )}
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
          {!touch && onDensity && (
            <>
              <MenuSeparator kind={kind} />
              <MenuRow kind={kind} onSelect={() => onDensity(density === "compact" ? "comfortable" : "compact")}>
                <Check className={`h-4 w-4 ${density === "compact" ? "text-wine-600" : "text-transparent"}`} aria-hidden="true" />
                Compact rows
              </MenuRow>
              <MenuRow kind={kind} onSelect={() => setHelp(true)}>
                <Keyboard className="h-4 w-4 text-slate-550" aria-hidden="true" />
                Keyboard shortcuts
              </MenuRow>
            </>
          )}
        </>
      )}
    />
  );

  const notes = (
    <>
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
    </>
  );

  // The row's own shape, so nothing jumps when the mail lands.
  const loadingRows = (phone: boolean) => (
    <div aria-busy="true">
      <span className="sr-only">Loading messages</span>
      {Array.from({ length: 10 }, (_, i) =>
        phone ? (
          <div key={i} className="flex items-start gap-3 px-3 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ) : (
          <div key={i} className="flex h-11 items-center gap-3 border-b border-mist-100 px-4">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-3.5 w-40 shrink-0 xl:w-52" />
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
            <Skeleton className="ml-auto h-3 w-12 shrink-0" />
          </div>
        ),
      )}
    </div>
  );

  const inbox = folderPath === "INBOX" || folders.find((f) => f.path === folderPath)?.specialUse === "\\Inbox";
  const empty = (
    <EmptyState
      bare
      icon={folderPath === STARRED ? Star : Inbox}
      title={
        filtered
          ? "No messages match these filters"
          : folderPath === STARRED
            ? "No starred messages"
            : inbox
              ? "Your inbox is empty"
              : "Nothing in this folder"
      }
      hint={
        filtered
          ? "Change or clear a filter above."
          : folderPath === STARRED
            ? "Star a message to keep it here, whichever folder it is in."
            : inbox
              ? "New mail shows up here as it arrives."
              : undefined
      }
    />
  );

  const shortcutHelp = (
    <BottomSheet open={help} onOpenChange={setHelp} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[13px]">
        {[
          ["j / k", "Next or previous message"],
          ["o or Enter", "Open"],
          ["x", "Select"],
          ["s", "Star or remove star"],
          ["#", "Move to trash"],
          ["Shift + I / Shift + U", "Mark as read or unread"],
          ["c", "Compose"],
          ["/", "Search"],
          ["u or Esc", "Back to the list"],
          ["Ctrl + Enter", "Send, in a compose window"],
          ["Esc", "Minimise a compose window"],
        ].map(([k, what]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded-md border border-mist-200 bg-mist-50 px-1.5 py-0.5 font-sans text-[12px] font-semibold text-plum-950">
                {k}
              </kbd>
            </dt>
            <dd className="text-plum-950">{what}</dd>
          </div>
        ))}
      </dl>
    </BottomSheet>
  );

  if (variant === "phone") {
    const selecting = picked.length > 0;
    return (
      <>
        {selecting && (
          <SelectionBar count={picked.length} onClear={() => setSelected(new Set())}>
            {bulk}
          </SelectionBar>
        )}
        <div
          onScroll={(event) => {
            const top = event.currentTarget.scrollTop;
            if (Math.abs(top - lastTop.current) < 6) return;
            onScrollDown?.(top > lastTop.current && top > 24);
            lastTop.current = top;
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(6rem+var(--safe-b))]"
        >
          {lead}
          <div className="flex items-center gap-2 pl-4 pr-1.5">
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-600">{label}</h2>
            {moreMenu(true)}
          </div>
          {notes}
          {!data && state.loading ? (
            loadingRows(true)
          ) : data && items.length === 0 ? (
            empty
          ) : (
            <ul className={`transition-opacity ${state.loading ? "opacity-60" : ""}`}>
              {items.map((m) => (
                <PhoneRow
                  key={keyOf(m)}
                  message={m}
                  folder={folderPath === STARRED ? (folders.find((f) => f.path === m.folder) ?? null) : null}
                  selected={selected.has(keyOf(m))}
                  selecting={selecting}
                  onToggle={() => toggle(m, !selected.has(keyOf(m)))}
                  onOpen={() => onOpen(m)}
                  onStar={() => void setStar([m], !m.flagged)}
                />
              ))}
            </ul>
          )}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 px-4 pt-3">
              <ToolIcon size="touch" label="Newer" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} />
              <span className="px-2 text-[12.5px] tabular-nums text-slate-600">{range}</span>
              <ToolIcon size="touch" label="Older" icon={ChevronRight} disabled={page >= data.totalPages} onClick={() => onPage(page + 1)} />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-12 shrink-0 items-center gap-1 border-b border-mist-100 px-1.5 py-1 sm:px-2.5">
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
            {moreMenu(false)}
          </>
        ) : (
          <div className="flex items-center gap-0.5">
            {bulk}
            <span className="ml-1.5 hidden text-[12px] font-medium text-slate-600 sm:inline">{picked.length} selected</span>
          </div>
        )}

        {range !== "" && data && (
          <div className="ml-auto flex items-center gap-0.5">
            <span className="px-1.5 text-[12px] tabular-nums text-slate-600">{range}</span>
            <ToolIcon label="Newer" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} />
            <ToolIcon label="Older" icon={ChevronRight} disabled={page >= data.totalPages} onClick={() => onPage(page + 1)} />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {notes}
        {!data && state.loading ? (
          loadingRows(false)
        ) : data && items.length === 0 ? (
          empty
        ) : (
          <ul className={`transition-opacity ${state.loading ? "opacity-60" : ""}`}>
            {items.map((m, i) => (
              <MessageRow
                key={keyOf(m)}
                index={i}
                cursor={i === cursor}
                compact={density === "compact"}
                message={m}
                folders={folders}
                showFolder={folderPath === STARRED}
                selected={selected.has(keyOf(m))}
                inTrash={inTrash || (trash !== null && m.folder === trash.path)}
                trashPath={trash?.path ?? null}
                busy={actions.busy}
                onSelect={(on) => toggle(m, on)}
                onOpen={() => {
                  setCursor(i);
                  onOpen(m);
                }}
                onStar={() => void setStar([m], !m.flagged)}
                onRead={(read) => void setRead([m], read)}
                onMove={(path) => void moveTo([m], path)}
              />
            ))}
          </ul>
        )}
      </div>
      {shortcutHelp}
    </div>
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
  index,
  cursor,
  compact,
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
  index: number;
  /** The keyboard's place in the list. */
  cursor: boolean;
  compact: boolean;
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
  const files = m.attachments.filter((a) => !a.inline);
  const tint = selected ? "bg-wine-50" : m.unseen ? "bg-white" : "bg-mist-50/60";
  const weight = m.unseen ? "font-semibold text-plum-950" : "font-normal text-plum-900";

  return (
    <li
      data-row={index}
      className={`group relative flex items-center border-b border-mist-100 pl-1.5 pr-2 transition-colors last:border-b-0 hover:z-[1] hover:shadow-card sm:pl-2.5 sm:pr-3 ${tint} ${
        cursor ? "shadow-[inset_3px_0_0_var(--wine-600)]" : ""
      }`}
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
        className="c-tap grid h-11 w-9 shrink-0 place-items-center rounded-md sm:h-8 sm:w-8"
      >
        <Star
          className={`h-4 w-4 ${m.flagged ? "fill-amber-400 text-amber-500" : "text-mist-400 group-hover:text-slate-550"}`}
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className={`flex min-w-0 flex-1 items-center gap-3 pl-1 text-left xl:gap-4 ${compact ? "min-h-8 py-1" : "min-h-10 py-2"}`}
      >
        <span className={`w-44 shrink-0 truncate text-[13px] xl:w-56 ${weight}`}>{who(m)}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {showFolder && home && (
            <span className="shrink-0 rounded bg-mist-100 px-1.5 py-px text-[11px] font-medium text-slate-600">
              {folderLabel(home, home.path)}
            </span>
          )}
          <span className={`min-w-0 truncate text-[13px] ${weight}`}>{m.subject || "(no subject)"}</span>
          {/* The filenames get the width a wide screen now has to spare. */}
          {files.length > 0 && (
            <span className="ml-auto hidden min-w-0 shrink items-center gap-1.5 pl-3 2xl:flex">
              {files.slice(0, 2).map((a) => (
                <span
                  key={a.id}
                  className="inline-flex min-w-0 max-w-[12rem] items-center gap-1 rounded-full border border-mist-200 bg-white px-2 py-0.5 text-[11.5px] text-slate-600"
                >
                  <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{a.filename}</span>
                </span>
              ))}
            </span>
          )}
          {files.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-550 2xl:hidden" aria-label="Has attachments" />}
        </span>
        <span className="sr-only">{m.unseen ? "Unread" : "Read"}</span>
      </button>

      <span
        className={`w-20 shrink-0 text-right text-[12px] group-hover:hidden group-focus-within:hidden ${
          m.unseen ? "font-semibold text-plum-950" : "text-slate-600"
        }`}
      >
        {listDate(m.date)}
      </span>
      {/* Hover actions take the date's place, as Gmail's do. */}
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
        <MoveMenu size="compact" targets={folders.filter((f) => f.path !== m.folder)} disabled={busy} onMove={onMove} />
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

