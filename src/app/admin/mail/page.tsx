"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Folders, Inbox, Pencil } from "lucide-react";
import type {
  MailFolder,
  MailListFilters,
  MailMessagePage,
  MailMessageSummary,
  MailRecipient,
  MailboxSummary,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Card, EmptyState, ErrorNote, IconButton, PageHeader, Skeleton } from "@/components/admin/ui";
import { AccountSwitcher } from "@/components/admin/mail/AccountSwitcher";
import { Composer, FolderSettings } from "@/components/admin/mail/Composer";
import { FilterChips, MailSearchBar } from "@/components/admin/mail/MailFilters";
import { MailRail } from "@/components/admin/mail/MailRail";
import { MessageList } from "@/components/admin/mail/MessageList";
import { MessageView } from "@/components/admin/mail/MessageView";
import {
  EMPTY_DRAFT,
  STARRED,
  activeFilters,
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
 * dense list, and a reading view that replaces the list.
 *
 * Everything is fetched live from Hostinger through the API. Mailboxes
 * themselves are created, deleted and given passwords in the Hostinger panel:
 * its API has no endpoint for any of that, nor for aliases.
 */

const STORAGE_KEY = "avh-mail-mailbox";

function remembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage blocked: the URL still carries the choice.
  }
}

export default function MailPage() {
  const boxes = useAsync<{ mailboxes: MailboxSummary[]; senderMailboxId: string }>(
    (signal) => api.get("/admin/mail/mailboxes", signal),
    [],
  );

  const header = (
    <PageHeader icon={Inbox} title="Mailboxes" subtitle="The Hostinger mailboxes the site's API key can reach." />
  );

  if (boxes.loading) {
    return (
      <>
        <h1 className="sr-only">Mailboxes</h1>
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading mailboxes</span>
          <Skeleton className="h-10 rounded-lg" />
          <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
            <Skeleton className="hidden h-72 rounded-2xl lg:block" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </>
    );
  }
  if (boxes.error) {
    return (
      <>
        {header}
        <ErrorNote error={boxes.error} onRetry={boxes.reload} />
        <p className="mt-3 text-[13px] text-slate-600">
          The API key lives in{" "}
          <Link href="/admin/settings" className="font-semibold text-wine-700 hover:underline">
            Settings, Email delivery
          </Link>
          .
        </p>
      </>
    );
  }
  if (!boxes.data) return null;
  if (boxes.data.mailboxes.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Inbox}
          title="This key reaches no mailboxes"
          hint="Create a mailbox in the Hostinger panel, or give the API key access to one, then come back."
        />
      </>
    );
  }
  return <MailWorkspace mailboxes={boxes.data.mailboxes} senderMailboxId={boxes.data.senderMailboxId} />;
}

function MailWorkspace({
  mailboxes,
  senderMailboxId,
}: {
  mailboxes: MailboxSummary[];
  senderMailboxId: string;
}) {
  const params = useSearchParams();
  const senderId = senderMailboxId || mailboxes[0].resourceId;
  const valid = (id: string | null): id is string => id !== null && mailboxes.some((m) => m.resourceId === id);
  // The URL wins, then this browser's last choice, then the one that sends site mail.
  const [mailbox, setMailbox] = useState(() => {
    const fromUrl = params.get("mailbox");
    if (valid(fromUrl)) return fromUrl;
    const stored = remembered();
    return valid(stored) ? stored : senderId;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("mailbox") === mailbox) return;
    url.searchParams.set("mailbox", mailbox);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [mailbox]);

  const [folder, setFolder] = useState("INBOX");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 400);
  const [filters, setFilters] = useState<MailListFilters>({});
  const [preset, setPreset] = useState<string | null>(null);
  const [open, setOpen] = useState<MailMessageSummary | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [settingsFor, setSettingsFor] = useState<MailFolder | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

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
  const messages = useAsync<MailMessagePage>((signal) => api.get(listPath, signal), [listPath, nonce], {
    keepPrevious: true,
  });
  const recipients = useAsync<{ recipients: MailRecipient[] }>(
    (signal) => api.get(`/admin/mail/mailboxes/${enc(mailbox)}/recipients`, signal),
    [mailbox],
  );

  const sorted = sortFolders(folders.data?.folders ?? []);
  const current = sorted.find((f) => f.path === folder) ?? null;
  const address = mailboxes.find((m) => m.resourceId === mailbox)?.address ?? "";
  const senders = [...new Set((messages.data?.items ?? []).map((m) => m.from?.address).filter((a): a is string => !!a))];

  function pickMailbox(id: string) {
    remember(id);
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

  function applyFilters(next: MailListFilters, nextPreset: string | null = preset) {
    const { q: text, ...rest } = next;
    setFilters(rest);
    setSearch(text ?? "");
    setPreset(nextPreset);
    setPage(1);
    setOpen(null);
  }

  function clearFilters() {
    setFilters({});
    setPreset(null);
    setSearch("");
    setPage(1);
  }

  const rail = (
    <MailRail
      mailbox={mailbox}
      folders={sorted}
      loading={folders.loading && !folders.data}
      error={folders.error}
      current={folder}
      onPick={pickFolder}
      onCompose={() => {
        setDrawer(false);
        setDraft({ ...EMPTY_DRAFT });
      }}
      onChanged={refresh}
    />
  );

  return (
    <>
      <h1 className="sr-only">Mailboxes</h1>

      <div className="relative z-20 mb-4 flex items-center gap-2 sm:gap-3">
        <div className="lg:hidden">
          <IconButton label="Folders" icon={Folders} onClick={() => setDrawer(true)} />
        </div>
        <MailSearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
            setOpen(null);
          }}
          onSubmit={() => setOpen(null)}
          filters={filters}
          recipients={recipients.data?.recipients ?? []}
          onApply={(next) => applyFilters(next, null)}
        />
        <AccountSwitcher mailboxes={mailboxes} current={mailbox} senderId={senderId} onPick={pickMailbox} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">{rail}</aside>

        <Card padded={false} className="min-w-0 overflow-hidden">
          {open ? (
            <MessageView
              key={`${open.folder}:${open.uid}`}
              mailbox={mailbox}
              mailboxAddress={address}
              folderPath={open.folder}
              uid={open.uid}
              folders={sorted}
              onBack={() => {
                setOpen(null);
                refresh();
              }}
              onReply={(m) => setDraft(replyDraft(m))}
              onForward={(m) => setDraft(forwardDraft(m))}
              onChanged={refresh}
            />
          ) : (
            <>
              <p className="truncate px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600 lg:hidden">
                {folderLabel(current, folder)}
              </p>
              <FilterChips
                filters={filters}
                preset={preset}
                senders={senders}
                recipients={recipients.data?.recipients ?? []}
                recipientsLoading={recipients.loading}
                onChange={(next, nextPreset) => applyFilters({ ...next, q: search || undefined }, nextPreset === undefined ? preset : nextPreset)}
                onClear={clearFilters}
              />
              <MessageList
                key={`${mailbox}|${folder}|${query}`}
                mailbox={mailbox}
                folderPath={folder}
                folders={sorted}
                state={messages}
                page={page}
                filtered={activeFilters(effective)}
                onPage={setPage}
                onOpen={(m) => setOpen(m)}
                onRefresh={refresh}
                onChanged={refresh}
                onFolderSettings={current && !isSpecial(current) ? () => setSettingsFor(current) : null}
              />
            </>
          )}
        </Card>
      </div>

      <div className="h-16 lg:hidden" aria-hidden="true" />

      {/* Gmail's floating compose, for a phone, where the rail is behind a button. */}
      <button
        type="button"
        onClick={() => setDraft({ ...EMPTY_DRAFT })}
        className="c-bevel-primary fixed bottom-[calc(1.25rem+var(--safe-b))] right-5 z-30 flex h-14 items-center gap-2 rounded-2xl bg-wine-600 px-5 text-[14px] font-semibold text-white shadow-pop hover:bg-wine-700 lg:hidden"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Compose
      </button>

      <BottomSheet open={drawer} onOpenChange={setDrawer} title="Folders" description={address}>
        {rail}
      </BottomSheet>

      {draft && (
        <Composer
          mailbox={mailbox}
          from={address}
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSent={() => {
            setDraft(null);
            refresh();
          }}
        />
      )}

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
}
