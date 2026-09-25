"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Folders, Inbox, Pencil } from "lucide-react";
import type {
  MailComposeWindow,
  MailDensity,
  MailDraft,
  MailFolder,
  MailListFilters,
  MailMessagePage,
  MailRecipient,
  MailStateResponse,
  MailViewState,
  MailboxSummary,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced, useMediaQuery } from "@/lib/admin/hooks";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, Card, EmptyState, ErrorNote, IconButton, PageHeader, Skeleton } from "@/components/admin/ui";
import { AccountSwitcher } from "@/components/admin/mail/AccountSwitcher";
import { ComposeWindow, FolderSettings, PhoneComposer } from "@/components/admin/mail/Composer";
import { DraftList } from "@/components/admin/mail/DraftList";
import { FilterChips, MailSearchBar } from "@/components/admin/mail/MailFilters";
import { MailRail } from "@/components/admin/mail/MailRail";
import { MessageList } from "@/components/admin/mail/MessageList";
import { MessageView } from "@/components/admin/mail/MessageView";
import { ComposeFab, PhoneAccountSheet, PhoneSearchBar, PhoneSheet } from "@/components/admin/mail/PhoneMail";
import { MailToast, type MailToastState } from "@/components/admin/mail/Toast";
import { DEFAULT_PREFS, forgetContacts, usePrefsSaver } from "@/components/admin/mail/state";
import {
  DRAFTS,
  STARRED,
  activeFilters,
  asApiError,
  blankDraft,
  draftIsEmpty,
  enc,
  folderLabel,
  forwardDraft,
  isSpecial,
  listQuery,
  replyDraft,
  sortFolders,
  type Draft,
} from "@/components/admin/mail/shared";

/**
 * The Hostinger mailboxes, read and answered from the console, laid out the
 * way Gmail is: folders on the left, one search bar with chips under it, a
 * dense list, and a reading view that replaces the list. Below `md` it follows
 * Gmail's phone app instead.
 *
 * Where the member left the page (mailbox, folder, search, filters, page, the
 * open message, compose windows) is kept on the server and read BEFORE the
 * workspace renders, so the first list request already carries the restored
 * filters and the default inbox never flashes. A link with view parameters
 * wins over the saved view, and the URL follows every change.
 *
 * Mailboxes themselves are created, deleted and given passwords in the
 * Hostinger panel: its API has no endpoint for any of that, nor for aliases.
 */

/** The page is full bleed, so anything that is not the workspace brings its own gutter. */
function Padded({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 md:p-0">{children}</div>;
}

interface Boot extends MailStateResponse {
  /** The saved state could not be read; the page runs on defaults. */
  failed?: boolean;
}

export default function MailPage() {
  const boxes = useAsync<{ mailboxes: MailboxSummary[]; senderMailboxId: string }>(
    (signal) => api.get("/admin/mail/mailboxes", signal),
    [],
  );
  const boot = useAsync<Boot>(
    (signal) =>
      api.get<MailStateResponse>("/admin/mail/state", signal).catch((err: unknown) => {
        if (signal.aborted) throw err;
        return { prefs: DEFAULT_PREFS, drafts: [], failed: true };
      }),
    [],
  );

  const header = (
    <PageHeader icon={Inbox} title="Mailboxes" subtitle="The Hostinger mailboxes the site's API key can reach." />
  );

  if (boxes.loading || boot.loading) return <WorkspaceSkeleton />;
  if (boxes.error) {
    return (
      <Padded>
        {header}
        <ErrorNote error={boxes.error} onRetry={boxes.reload} />
        <p className="mt-3 text-[13px] text-slate-600">
          The API key lives in{" "}
          <Link href="/admin/settings" className="font-semibold text-wine-700 hover:underline">
            Settings, Email delivery
          </Link>
          .
        </p>
      </Padded>
    );
  }
  if (!boxes.data) return null;
  if (boxes.data.mailboxes.length === 0) {
    return (
      <Padded>
        {header}
        <EmptyState
          icon={Inbox}
          title="This key reaches no mailboxes"
          hint="Create a mailbox in the Hostinger panel, or give the API key access to one, then come back."
        />
      </Padded>
    );
  }
  return (
    <MailWorkspace
      mailboxes={boxes.data.mailboxes}
      senderMailboxId={boxes.data.senderMailboxId}
      boot={boot.data ?? { prefs: DEFAULT_PREFS, drafts: [], failed: true }}
    />
  );
}

/** The workspace's own outline, so the restored view lands without a jump. */
function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" className="flex min-h-0 flex-1 flex-col px-3 pt-3 md:p-0">
      <h1 className="sr-only">Mailboxes</h1>
      <span className="sr-only">Loading your mailboxes</span>
      <div className="mb-3 flex shrink-0 items-center gap-3">
        <Skeleton className="h-12 flex-1 rounded-full md:h-10 md:rounded-lg" />
        <Skeleton className="hidden h-10 w-56 rounded-lg md:block" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-5">
        <div className="hidden space-y-1.5 lg:block">
          <Skeleton className="mb-3 h-9 rounded-lg" />
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl md:bg-white md:shadow-card">
          <div className="flex gap-2 px-1 py-2.5 md:px-4">
            {[16, 20, 28, 18].map((w) => (
              <Skeleton key={w} className="h-8 shrink-0 rounded-full" style={{ width: `${w * 0.25}rem` }} />
            ))}
          </div>
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex h-14 items-center gap-3 border-b border-mist-100 px-1 md:h-11 md:px-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full md:h-4 md:w-4 md:rounded" />
              <Skeleton className="hidden h-3.5 w-44 shrink-0 md:block" />
              <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${50 + ((i * 13) % 40)}%` }} />
              <Skeleton className="ml-auto h-3 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── restore ─────────────────────────────── */

const URL_KEYS = ["folder", "q", "from", "to", "subject", "since", "before", "attachment", "page", "open"] as const;

function defaultView(mailbox: string): MailViewState {
  return { mailbox, folder: "INBOX", search: "", filters: {}, preset: null, page: 1, open: null, compose: [] };
}

/** A link's view parameters win outright; otherwise the saved view, if its mailbox is still reachable. */
function restoreView(
  params: URLSearchParams,
  saved: MailViewState | null,
  valid: (id: string | null) => id is string,
  fallback: string,
  drafts: MailDraft[],
): MailViewState {
  const compose = (saved?.compose ?? []).filter((w) => drafts.some((d) => d.id === w.id));
  const urlMailbox = params.get("mailbox");
  if (URL_KEYS.some((k) => params.has(k))) {
    const text = (k: string) => {
      const v = params.get(k)?.trim();
      return v ? v : undefined;
    };
    const day = (k: string) => {
      const v = text(k);
      return v && /^\d{4}-\d{2}-\d{2}$/u.test(v) ? v : undefined;
    };
    const openRaw = params.get("open") ?? "";
    const cut = openRaw.lastIndexOf(":");
    const uid = Number(openRaw.slice(cut + 1));
    const filters: MailViewState["filters"] = {
      from: text("from"),
      to: text("to"),
      subject: text("subject"),
      since: day("since"),
      before: day("before"),
      attachment: params.get("attachment") === "1" ? "1" : undefined,
    };
    const matchesSaved = saved && JSON.stringify(saved.filters) === JSON.stringify(filters);
    return {
      mailbox: valid(urlMailbox) ? urlMailbox : valid(saved?.mailbox ?? null) ? saved!.mailbox : fallback,
      folder: text("folder") ?? "INBOX",
      search: params.get("q") ?? "",
      filters,
      // The date chip's label survives a refresh when the dates are still the saved ones.
      preset: matchesSaved ? saved.preset : null,
      page: Math.max(1, Number(params.get("page")) || 1),
      open: cut > 0 && Number.isInteger(uid) && uid > 0 ? { folder: openRaw.slice(0, cut), uid } : null,
      compose,
    };
  }
  if (valid(urlMailbox) && saved?.mailbox !== urlMailbox) return { ...defaultView(urlMailbox), compose };
  if (saved && valid(saved.mailbox)) return { ...defaultView(saved.mailbox), ...saved, compose };
  return { ...defaultView(fallback), compose };
}

function viewUrl(view: MailViewState): string {
  const url = new URL(window.location.href);
  for (const k of ["mailbox", ...URL_KEYS]) url.searchParams.delete(k);
  url.searchParams.set("mailbox", view.mailbox);
  if (view.folder !== "INBOX") url.searchParams.set("folder", view.folder);
  if (view.search.trim()) url.searchParams.set("q", view.search.trim());
  for (const [k, v] of Object.entries(view.filters)) if (typeof v === "string" && v !== "") url.searchParams.set(k, v);
  if (view.page > 1) url.searchParams.set("page", String(view.page));
  if (view.open) url.searchParams.set("open", `${view.open.folder}:${view.open.uid}`);
  return `${url.pathname}${url.search}`;
}

function toDraft(saved: MailDraft): Draft {
  const { createdAt, ...d } = saved;
  void createdAt;
  return d;
}

/* ────────────────────────────── workspace ────────────────────────────── */

function MailWorkspace({
  mailboxes,
  senderMailboxId,
  boot,
}: {
  mailboxes: MailboxSummary[];
  senderMailboxId: string;
  boot: Boot;
}) {
  const params = useSearchParams();
  // Tailwind's `md`. Below it the page is Gmail's phone app, not a narrow desktop.
  const wide = useMediaQuery("(min-width: 48rem)");
  const senderId = senderMailboxId || mailboxes[0].resourceId;
  const valid = (id: string | null): id is string => id !== null && mailboxes.some((m) => m.resourceId === id);
  const [initial] = useState(() => restoreView(params, boot.prefs.view, valid, senderId, boot.drafts));

  const [mailbox, setMailbox] = useState(initial.mailbox);
  const [folder, setFolder] = useState(initial.folder);
  const [page, setPage] = useState(initial.page);
  const [search, setSearch] = useState(initial.search);
  const q = useDebounced(search.trim(), 400);
  const [filters, setFilters] = useState<MailViewState["filters"]>(initial.filters);
  const [preset, setPreset] = useState<string | null>(initial.preset);
  const [open, setOpen] = useState<MailViewState["open"]>(initial.open);
  const [density, setDensity] = useState<MailDensity>(boot.prefs.density);
  const [recentTo, setRecentTo] = useState<string[]>(boot.prefs.recentTo);
  const [drafts, setDrafts] = useState<Draft[]>(() => boot.drafts.map(toDraft));
  const [windows, setWindows] = useState<MailComposeWindow[]>(initial.compose);
  const [problems, setProblems] = useState<Record<string, ApiError>>({});
  const [toast, setToast] = useState<MailToastState | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [accounts, setAccounts] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [settingsFor, setSettingsFor] = useState<MailFolder | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const dismissToast = useCallback(() => setToast(null), []);

  /* ── persistence: the server, then the URL ── */

  const save = usePrefsSaver(true);
  const view: MailViewState = { mailbox, folder, search, filters, preset, page, open, compose: windows };
  const viewJson = JSON.stringify(view);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    window.history.replaceState(null, "", viewUrl(JSON.parse(viewJson) as MailViewState));
    // The first render is what was restored; saving it back would only let a failed read overwrite a good row.
    if (lastSaved.current === null || lastSaved.current === viewJson) {
      lastSaved.current = viewJson;
      return;
    }
    lastSaved.current = viewJson;
    save({ view: JSON.parse(viewJson) as MailViewState });
  }, [viewJson, save]);

  /* ── reads ── */

  const effective: MailListFilters = { ...filters, q: q || undefined };
  const query = listQuery(effective, page);
  const listPath =
    folder === STARRED
      ? `/admin/mail/mailboxes/${enc(mailbox)}/starred?${query}`
      : `/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folder)}/messages?${query}`;

  const folders = useAsync<{ folders: MailFolder[] }>(
    (signal) => api.get(`/admin/mail/mailboxes/${enc(mailbox)}/folders`, signal),
    [mailbox, nonce],
    { keepPrevious: true },
  );
  const messages = useAsync<MailMessagePage | null>(
    (signal) => (folder === DRAFTS ? Promise.resolve(null) : api.get(listPath, signal)),
    [folder === DRAFTS ? DRAFTS : listPath, nonce],
    { keepPrevious: true },
  );
  const recipients = useAsync<{ recipients: MailRecipient[] }>(
    (signal) => api.get(`/admin/mail/mailboxes/${enc(mailbox)}/recipients`, signal),
    [mailbox],
  );

  const sorted = sortFolders(folders.data?.folders ?? []);
  const current = sorted.find((f) => f.path === folder) ?? null;
  const address = mailboxes.find((m) => m.resourceId === mailbox)?.address ?? "";
  const loaded = messages.data?.items ?? [];
  const senders = [...new Set(loaded.map((m) => m.from?.address).filter((a): a is string => !!a))];
  const shownDrafts = drafts.filter((d) => d.revision > 0 || !draftIsEmpty(d));

  // A restored folder that has since been deleted or renamed falls back to the inbox.
  const folderList = folders.data?.folders;
  useEffect(() => {
    if (!folderList || folder === STARRED || folder === DRAFTS) return;
    if (!folderList.some((f) => f.path === folder)) {
      setFolder("INBOX");
      setOpen(null);
      setPage(1);
    }
  }, [folderList, folder]);

  /* ── navigation ── */

  function pickMailbox(id: string) {
    setMailbox(id);
    setFolder("INBOX");
    setPage(1);
    setOpen(null);
    setFilters({});
    setPreset(null);
    setSearch("");
  }

  function pickFolder(path: string) {
    setFolder(path);
    setPage(1);
    setOpen(null);
    setDrawer(false);
  }

  function rememberTo(to: string | undefined) {
    if (!to || recentTo[0] === to) return;
    const next = [to, ...recentTo.filter((a) => a !== to)].slice(0, 8);
    setRecentTo(next);
    save({ recentTo: next });
  }

  function applyFilters(next: MailListFilters, nextPreset: string | null = preset) {
    const { q: text, ...rest } = next;
    setFilters(rest);
    setSearch(text ?? "");
    setPreset(nextPreset);
    setPage(1);
    setOpen(null);
    if (rest.to !== filters.to) rememberTo(rest.to);
  }

  function clearFilters() {
    setFilters({});
    setPreset(null);
    setSearch("");
    setPage(1);
  }

  function typeSearch(value: string) {
    setSearch(value);
    setPage(1);
    setOpen(null);
  }

  function changeDensity(next: MailDensity) {
    setDensity(next);
    save({ density: next });
  }

  /* ── compose ── */

  function upsertDraft(d: Draft) {
    setDrafts((prev) => (prev.some((x) => x.id === d.id) ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d]));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((x) => x.id !== id));
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }

  /* Opening one folds the others to their bars, so docked windows never cover the list. */
  function openDraft(d: Draft) {
    setDrawer(false);
    upsertDraft(d);
    setWindows((prev) => {
      const others = prev.filter((w) => w.id !== d.id).map((w) => ({ ...w, minimized: true, expanded: false }));
      return [{ id: d.id, minimized: false, expanded: false }, ...others].slice(0, 3);
    });
  }

  const compose = () => openDraft(blankDraft(mailbox));

  function layout(id: string, next: { minimized: boolean; expanded: boolean }) {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, ...next } : next.minimized ? w : { ...w, minimized: true, expanded: false },
      ),
    );
  }

  function onSaved(saved: MailDraft) {
    setDrafts((prev) =>
      prev.map((x) =>
        x.id === saved.id ? { ...toDraft(saved) } : x,
      ),
    );
  }

  function closeWindow(d: Draft) {
    setWindows((prev) => prev.filter((w) => w.id !== d.id));
    if (draftIsEmpty(d)) {
      removeDraft(d.id);
      if (d.revision > 0) void api.del(`/admin/mail/drafts/${enc(d.id)}`).catch(() => {});
      return;
    }
    upsertDraft(d);
    setToast({ id: Date.now(), text: "Draft saved", actions: [{ label: "Open", onClick: () => openDraft(d) }] });
  }

  function discard(d: Draft) {
    removeDraft(d.id);
    if (d.revision > 0) void api.del(`/admin/mail/drafts/${enc(d.id)}`).catch(() => {});
    if (draftIsEmpty(d)) return;
    setToast({
      id: Date.now(),
      text: "Draft discarded",
      actions: [
        {
          label: "Undo",
          onClick: () => {
            setToast(null);
            // Saved again as new, since the server copy is gone.
            openDraft({ ...d, revision: 0 });
          },
        },
      ],
    });
  }

  /* ── sending, with Gmail's undo window ── */

  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function sendLater(d: Draft) {
    setWindows((prev) => prev.filter((w) => w.id !== d.id));
    upsertDraft(d);
    setProblems((prev) => {
      const next = { ...prev };
      delete next[d.id];
      return next;
    });
    pending.current.set(
      d.id,
      setTimeout(() => void sendNow(d), 5000),
    );
    setToast({
      id: Date.now(),
      text: "Sending",
      sticky: true,
      actions: [
        {
          label: "Undo",
          onClick: () => {
            const timer = pending.current.get(d.id);
            if (timer) clearTimeout(timer);
            pending.current.delete(d.id);
            openDraft(d);
            setToast({ id: Date.now(), text: "Sending undone" });
          },
        },
      ],
    });
  }

  async function sendNow(d: Draft) {
    pending.current.delete(d.id);
    setToast({ id: Date.now(), text: "Sending", sticky: true });
    try {
      await api.post(`/admin/mail/mailboxes/${enc(d.mailbox)}/send`, {
        to: d.to,
        cc: d.cc,
        bcc: d.bcc,
        subject: d.subject,
        // In HTML mode the server writes the plain text copy from the HTML.
        text: d.mode === "html" ? "" : d.text,
        ...(d.mode === "html" ? { html: d.html } : {}),
        ...(d.inReplyTo ? { inReplyTo: d.inReplyTo } : {}),
        ...(d.forwardOf ? { forwardOf: d.forwardOf } : {}),
        draftId: d.id,
      });
      removeDraft(d.id);
      forgetContacts(d.mailbox);
      refresh();
      setToast({ id: Date.now(), text: "Message sent", actions: [{ label: "View message", onClick: () => void viewSent(d) }] });
    } catch (err) {
      setProblems((prev) => ({ ...prev, [d.id]: asApiError(err) }));
      openDraft(d);
      setToast({ id: Date.now(), text: "Not sent. The message is open again so you can try once more." });
    }
  }

  async function viewSent(d: Draft) {
    setToast(null);
    try {
      const list = await api.get<{ folders: MailFolder[] }>(`/admin/mail/mailboxes/${enc(d.mailbox)}/folders`);
      const sent = list.folders.find((f) => f.specialUse === "\\Sent");
      if (!sent) return;
      const newest = await api.get<MailMessagePage>(
        `/admin/mail/mailboxes/${enc(d.mailbox)}/folders/${enc(sent.path)}/messages?page=1`,
      );
      const hit = newest.items.find((m) => m.subject === d.subject) ?? newest.items[0] ?? null;
      if (d.mailbox !== mailbox) pickMailbox(d.mailbox);
      setFilters({});
      setPreset(null);
      setSearch("");
      setFolder(sent.path);
      setPage(1);
      setOpen(hit ? { folder: hit.folder, uid: hit.uid } : null);
    } catch {
      // The message is sent either way; the Sent folder is one click in the rail.
    }
  }

  /* ── page keys: c, / and u (the list's own keys live in MessageList) ── */

  const reading = open !== null;
  useEffect(() => {
    if (!wide) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      if (event.key === "c") {
        event.preventDefault();
        openDraftRef.current(blankDraft(mailboxRef.current));
      } else if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Search mail"]')?.focus();
      } else if ((event.key === "u" || event.key === "Escape") && readingRef.current) {
        event.preventDefault();
        setOpen(null);
        refresh();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, refresh]);
  const openDraftRef = useRef(openDraft);
  const mailboxRef = useRef(mailbox);
  const readingRef = useRef(reading);
  useEffect(() => {
    openDraftRef.current = openDraft;
    mailboxRef.current = mailbox;
    readingRef.current = reading;
  });

  /* ── pieces ── */

  const rail = (inDrawer: boolean) => (
    <MailRail
      mailbox={mailbox}
      folders={sorted}
      loading={folders.loading && !folders.data}
      error={folders.error}
      current={folder}
      onPick={pickFolder}
      onCompose={compose}
      onChanged={refresh}
      showCompose={!inDrawer || wide}
      draftCount={shownDrafts.length}
    />
  );

  const chips = (
    <FilterChips
      phone={!wide}
      filters={filters}
      preset={preset}
      senders={senders}
      recipients={recipients.data?.recipients ?? []}
      recipientsLoading={recipients.loading}
      recentTo={recentTo}
      onChange={(next, nextPreset) =>
        applyFilters({ ...next, q: search || undefined }, nextPreset === undefined ? preset : nextPreset)
      }
      onClear={clearFilters}
    />
  );

  const readingView = open && (
    <MessageView
      key={`${open.folder}:${open.uid}`}
      phone={!wide}
      mailbox={mailbox}
      mailboxAddress={address}
      folderPath={open.folder}
      uid={open.uid}
      folders={sorted}
      onBack={() => {
        setOpen(null);
        refresh();
      }}
      onReply={(m) => openDraft(replyDraft(mailbox, m))}
      onForward={(m) => openDraft(forwardDraft(mailbox, m))}
      onChanged={refresh}
    />
  );

  const draftList = (lead?: ReactNode) => (
    <DraftList
      drafts={shownDrafts}
      mailboxes={mailboxes}
      phone={!wide}
      lead={lead}
      onOpen={openDraft}
      onDiscard={discard}
    />
  );

  const listProps = {
    mailbox,
    folderPath: folder,
    folders: sorted,
    state: messages,
    page,
    filtered: activeFilters(effective),
    onPage: setPage,
    onOpen: (m: { folder: string; uid: number }) => setOpen({ folder: m.folder, uid: m.uid }),
    onRefresh: refresh,
    onChanged: refresh,
    onFolderSettings: current && !isSpecial(current) ? () => setSettingsFor(current) : null,
  };
  const listKey = `${mailbox}|${folder}|${query}`;

  const byId = new Map(drafts.map((d) => [d.id, d]));
  const live = windows.filter((w) => byId.has(w.id));
  // A phone has no docked bars: a folded window waits in Your drafts.
  const phoneWindow = live.find((w) => !w.minimized);
  const callbacks = (id: string) => ({
    onSaved,
    onClose: closeWindow,
    onDiscard: discard,
    onSend: sendLater,
    problem: problems[id] ?? null,
  });

  // Docked side by side from the right: an open window is 560px, a folded one 280px.
  let right = 16;
  const docked = live.map((w) => {
    const at = right;
    right += (w.minimized ? 280 : 560) + 12;
    return { w, at };
  });

  const overlays = (
    <>
      {wide
        ? docked.map(({ w, at }) => (
            <ComposeWindow
              key={w.id}
              initial={byId.get(w.id)!}
              mailboxes={mailboxes}
              minimized={w.minimized}
              expanded={w.expanded}
              right={at}
              onLayout={(next) => layout(w.id, next)}
              {...callbacks(w.id)}
            />
          ))
        : phoneWindow && (
            <PhoneComposer
              key={phoneWindow.id}
              initial={byId.get(phoneWindow.id)!}
              mailboxes={mailboxes}
              {...callbacks(phoneWindow.id)}
            />
          )}

      <MailToast toast={toast} phone={!wide} onDismiss={dismissToast} />

      {settingsFor && (
        <FolderSettings
          mailbox={mailbox}
          folder={settingsFor}
          onClose={() => setSettingsFor(null)}
          onRenamed={(path) => {
            setSettingsFor(null);
            pickFolder(path);
            refresh();
          }}
          onDeleted={() => {
            setSettingsFor(null);
            pickFolder("INBOX");
            refresh();
          }}
        />
      )}
    </>
  );

  if (!wide) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <h1 className="sr-only">Mailboxes</h1>
        {readingView ? (
          readingView
        ) : (
          <>
            <PhoneSearchBar
              value={search}
              address={address}
              onChange={typeSearch}
              onSubmit={() => setOpen(null)}
              onMenu={() => setDrawer(true)}
              onAccount={() => setAccounts(true)}
            />
            {folder === DRAFTS ? (
              draftList()
            ) : (
              <MessageList
                key={listKey}
                {...listProps}
                variant="phone"
                lead={chips}
                label={folderLabel(current, folder)}
                onScrollDown={setScrolledDown}
              />
            )}
            <ComposeFab compact={scrolledDown} onClick={compose} />
          </>
        )}

        <PhoneSheet open={drawer} onOpenChange={setDrawer} side="left" title="Mail" description={address}>
          {rail(true)}
        </PhoneSheet>
        <PhoneAccountSheet
          open={accounts}
          onOpenChange={setAccounts}
          mailboxes={mailboxes}
          current={mailbox}
          senderId={senderId}
          onPick={pickMailbox}
        />
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Mailboxes</h1>

      <div className="relative z-20 mb-3 flex shrink-0 items-center gap-3">
        <div className="lg:hidden">
          <IconButton label="Folders" icon={Folders} onClick={() => setDrawer(true)} />
        </div>
        <MailSearchBar
          value={search}
          onChange={typeSearch}
          onSubmit={() => setOpen(null)}
          filters={filters}
          recipients={recipients.data?.recipients ?? []}
          onApply={(next) => applyFilters(next, null)}
        />
        <Button className="lg:hidden" onClick={compose}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Compose
        </Button>
        <AccountSwitcher mailboxes={mailboxes} current={mailbox} senderId={senderId} onPick={pickMailbox} />
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-5">
        <aside className="hidden min-h-0 overflow-y-auto overscroll-contain pb-4 lg:block">{rail(false)}</aside>

        <Card padded={false} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {readingView ||
            (folder === DRAFTS ? (
              draftList()
            ) : (
              <>
                <div className="shrink-0">{chips}</div>
                <MessageList
                  key={listKey}
                  {...listProps}
                  density={density}
                  onDensity={changeDensity}
                  keys={!reading}
                />
              </>
            ))}
        </Card>
      </div>

      <BottomSheet open={drawer} onOpenChange={setDrawer} title="Folders" description={address}>
        {rail(true)}
      </BottomSheet>

      {overlays}
    </div>
  );
}
