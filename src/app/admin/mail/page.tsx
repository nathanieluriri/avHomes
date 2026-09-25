"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Folders, Inbox, Pencil } from "lucide-react";
import type {
  MailAddress,
  MailFolder,
  MailListFilters,
  MailMessagePage,
  MailMessageSummary,
  MailRecipient,
  MailboxSummary,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced, useMediaQuery } from "@/lib/admin/hooks";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, Card, EmptyState, ErrorNote, IconButton, PageHeader, Skeleton } from "@/components/admin/ui";
import { AccountSwitcher } from "@/components/admin/mail/AccountSwitcher";
import { Composer, FolderSettings } from "@/components/admin/mail/Composer";
import { FilterChips, MailSearchBar } from "@/components/admin/mail/MailFilters";
import { MailRail } from "@/components/admin/mail/MailRail";
import { MessageList } from "@/components/admin/mail/MessageList";
import { MessageView } from "@/components/admin/mail/MessageView";
import { ComposeFab, PhoneAccountSheet, PhoneSearchBar, PhoneSheet } from "@/components/admin/mail/PhoneMail";
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
 * dense list, and a reading view that replaces the list. Below `md` it follows
 * Gmail's phone app instead.
 *
 * The page fills the console's content area (see FULL_BLEED in ConsoleShell)
 * and scrolls inside the list, not as a document.
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

/** The page is full bleed, so anything that is not the workspace brings its own gutter. */
function Padded({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 md:p-0">{children}</div>;
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
      <Padded>
        <h1 className="sr-only">Mailboxes</h1>
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading mailboxes</span>
          <Skeleton className="h-12 rounded-full md:h-10 md:rounded-lg" />
          <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <Skeleton className="hidden h-72 rounded-2xl lg:block" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </Padded>
    );
  }
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
  // Tailwind's `md`. Below it the page is Gmail's phone app, not a narrow desktop.
  const wide = useMediaQuery("(min-width: 48rem)");
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
  const [accounts, setAccounts] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
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
  const loaded = messages.data?.items ?? [];
  const senders = [...new Set(loaded.map((m) => m.from?.address).filter((a): a is string => !!a))];

  // Composer suggestions: whoever appears on the mail already on screen, minus our own mailboxes.
  const own = new Set(mailboxes.map((m) => m.address.toLowerCase()));
  const people = new Map<string, MailAddress>();
  for (const m of loaded) {
    for (const a of [...(m.from ? [m.from] : []), ...m.to, ...m.cc]) {
      const key = a.address.toLowerCase();
      if (!own.has(key) && !people.has(key)) people.set(key, a);
    }
  }

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

  function typeSearch(value: string) {
    setSearch(value);
    setPage(1);
    setOpen(null);
  }

  const compose = () => {
    setDrawer(false);
    setDraft({ ...EMPTY_DRAFT });
  };

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
      onChange={(next, nextPreset) =>
        applyFilters({ ...next, q: search || undefined }, nextPreset === undefined ? preset : nextPreset)
      }
      onClear={clearFilters}
    />
  );

  const reading = open && (
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
      onReply={(m) => setDraft(replyDraft(m))}
      onForward={(m) => setDraft(forwardDraft(m))}
      onChanged={refresh}
    />
  );

  const listProps = {
    key: `${mailbox}|${folder}|${query}`,
    mailbox,
    folderPath: folder,
    folders: sorted,
    state: messages,
    page,
    filtered: activeFilters(effective),
    onPage: setPage,
    onOpen: (m: MailMessageSummary) => setOpen(m),
    onRefresh: refresh,
    onChanged: refresh,
    onFolderSettings: current && !isSpecial(current) ? () => setSettingsFor(current) : null,
  };

  const overlays = (
    <>
      {draft && (
        <Composer
          phone={!wide}
          mailboxes={mailboxes}
          mailbox={mailbox}
          draft={draft}
          people={[...people.values()]}
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

  if (!wide) {
    const { key, ...rest } = listProps;
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <h1 className="sr-only">Mailboxes</h1>
        {reading ? (
          reading
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
            <MessageList
              key={key}
              {...rest}
              variant="phone"
              lead={chips}
              label={folderLabel(current, folder)}
              onScrollDown={setScrolledDown}
            />
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

  const { key, ...rest } = listProps;
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
          {reading || (
            <>
              <div className="shrink-0">{chips}</div>
              <MessageList key={key} {...rest} />
            </>
          )}
        </Card>
      </div>

      <BottomSheet open={drawer} onOpenChange={setDrawer} title="Folders" description={address}>
        {rail(true)}
      </BottomSheet>

      {overlays}
    </div>
  );
}
