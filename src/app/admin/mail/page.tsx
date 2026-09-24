"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Flag,
  FolderPlus,
  Forward,
  MailPlus,
  Paperclip,
  Reply,
  Search,
  Trash2,
  Inbox,
} from "lucide-react";
import type {
  MailFolder,
  MailMessageDetail,
  MailMessagePage,
  MailMessageSummary,
  MailboxSummary,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { dateTime, shortDate } from "@/lib/admin/format";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * The Hostinger mailboxes, read and answered from the console.
 *
 * Everything is fetched live from Hostinger through the API. Mailboxes
 * themselves are created, deleted and given passwords in the Hostinger panel:
 * its API has no endpoint for any of that.
 */

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

const enc = encodeURIComponent;

function kb(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} MB`;
  return `${value} KB`;
}

function bytes(value: number): string {
  return value >= 1024 ? kb(Math.round(value / 1024)) : `${value} B`;
}

function who(m: { from: { name: string; address: string } | null }): string {
  return m.from ? m.from.name || m.from.address : "(no sender)";
}

const SPECIAL_ORDER = ["\\Inbox", "\\Drafts", "\\Sent", "\\Junk", "\\Trash"];

function sortFolders(folders: MailFolder[]): MailFolder[] {
  const rank = (f: MailFolder) => {
    const i = f.specialUse ? SPECIAL_ORDER.indexOf(f.specialUse) : -1;
    return i === -1 ? SPECIAL_ORDER.length : i;
  };
  return [...folders].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

interface Draft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo?: { uid: number; folder: string };
  forwardOf?: { uid: number; folder: string };
}

const EMPTY_DRAFT: Draft = { to: "", cc: "", bcc: "", subject: "", text: "" };

function list(value: string): string[] {
  return value
    .split(/[,;\s]+/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function quoted(m: MailMessageDetail): string {
  const body = m.text.trim() === "" ? "" : m.text.split("\n").map((line) => `> ${line}`).join("\n");
  return `\n\nOn ${dateTime(Date.parse(m.date))}, ${who(m)} wrote:\n${body}`;
}

function replyDraft(m: MailMessageDetail): Draft {
  return {
    ...EMPTY_DRAFT,
    to: m.from?.address ?? "",
    subject: /^re:/iu.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    text: quoted(m),
    inReplyTo: { uid: m.uid, folder: m.folder },
  };
}

function forwardDraft(m: MailMessageDetail): Draft {
  const header = [
    "---------- Forwarded message ----------",
    `From: ${m.from ? `${m.from.name} <${m.from.address}>` : ""}`,
    `Date: ${dateTime(Date.parse(m.date))}`,
    `Subject: ${m.subject}`,
    `To: ${m.to.map((a) => a.address).join(", ")}`,
  ].join("\n");
  return {
    ...EMPTY_DRAFT,
    subject: /^fwd?:/iu.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
    text: `\n\n${header}\n\n${m.text}`,
    forwardOf: { uid: m.uid, folder: m.folder },
  };
}

export default function MailPage() {
  const boxes = useAsync<{ mailboxes: MailboxSummary[]; senderMailboxId: string }>(
    (signal) => api.get("/admin/mail/mailboxes", signal),
    [],
  );

  const header = (
    <PageHeader
      icon={Inbox}
      title="Mailboxes"
      subtitle="The Hostinger mailboxes the site's API key can reach."
    />
  );

  if (boxes.loading) {
    return (
      <>
        {header}
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading mailboxes</span>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
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
  const [mailbox, setMailbox] = useState(senderMailboxId || mailboxes[0].resourceId);
  const [folder, setFolder] = useState("INBOX");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 400);
  const [openUid, setOpenUid] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  const folders = useAsync<{ folders: MailFolder[] }>(
    (signal) => api.get(`/admin/mail/mailboxes/${enc(mailbox)}/folders`, signal),
    [mailbox, nonce],
    { keepPrevious: true },
  );
  const sorted = sortFolders(folders.data?.folders ?? []);
  const current = sorted.find((f) => f.path === folder) ?? null;
  const trash = sorted.find((f) => f.specialUse === "\\Trash") ?? null;
  const address = mailboxes.find((m) => m.resourceId === mailbox)?.address ?? "";

  function pickMailbox(id: string) {
    setMailbox(id);
    setFolder("INBOX");
    setPage(1);
    setOpenUid(null);
  }

  function pickFolder(path: string) {
    setFolder(path);
    setPage(1);
    setOpenUid(null);
  }

  return (
    <>
      <PageHeader
        icon={Inbox}
        title="Mailboxes"
        subtitle="The Hostinger mailboxes the site's API key can reach."
        actions={
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <MailPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Compose
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {mailboxes.map((m) => (
          <MailboxCard
            key={m.resourceId}
            mailbox={m}
            active={m.resourceId === mailbox}
            sender={m.resourceId === (senderMailboxId || mailboxes[0].resourceId)}
            onPick={() => pickMailbox(m.resourceId)}
          />
        ))}
      </div>

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

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <FolderList
          mailbox={mailbox}
          folders={sorted}
          loading={folders.loading && !folders.data}
          error={folders.error}
          current={folder}
          onPick={pickFolder}
          onChanged={refresh}
        />

        {openUid === null ? (
          <MessageList
            mailbox={mailbox}
            folder={current}
            folderPath={folder}
            page={page}
            q={q}
            search={search}
            nonce={nonce}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            onPage={setPage}
            onOpen={setOpenUid}
            onFolderGone={() => {
              pickFolder("INBOX");
              refresh();
            }}
          />
        ) : (
          <MessageView
            mailbox={mailbox}
            folderPath={folder}
            uid={openUid}
            folders={sorted}
            trash={trash}
            onBack={() => {
              setOpenUid(null);
              refresh();
            }}
            onReply={(m) => setDraft(replyDraft(m))}
            onForward={(m) => setDraft(forwardDraft(m))}
          />
        )}
      </div>
    </>
  );
}

function MailboxCard({
  mailbox,
  active,
  sender,
  onPick,
}: {
  mailbox: MailboxSummary;
  active: boolean;
  sender: boolean;
  onPick: () => void;
}) {
  const q = mailbox.quota;
  const percent = q && q.storageLimitKb > 0 ? Math.min(100, (q.storageUsedKb / q.storageLimitKb) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`rounded-2xl bg-white p-4 text-left shadow-card transition-colors ${
        active ? "ring-2 ring-wine-500" : "hover:bg-mist-50"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-plum-950">{mailbox.address}</span>
        {sender && <Badge tone="wine">Sends site mail</Badge>}
      </span>
      {q && q.supported ? (
        <>
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-mist-100">
            <span
              className={`block h-full rounded-full ${percent > 90 ? "bg-red-600" : "bg-wine-600"}`}
              style={{ width: `${Math.max(percent, 1)}%` }}
            />
          </span>
          <span className="mt-1.5 block text-[12px] text-slate-600">
            {kb(q.storageUsedKb)} of {kb(q.storageLimitKb)} used, {q.messages.toLocaleString("en-GB")} messages
          </span>
        </>
      ) : (
        <span className="mt-3 block text-[12px] text-slate-550">Storage use is not reported for this mailbox.</span>
      )}
    </button>
  );
}

function FolderList({
  mailbox,
  folders,
  loading,
  error,
  current,
  onPick,
  onChanged,
}: {
  mailbox: string;
  folders: MailFolder[];
  loading: boolean;
  error: ApiError | null;
  current: string;
  onPick: (path: string) => void;
  onChanged: () => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);

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

  return (
    <Card>
      <CardHead
        title="Folders"
        action={
          <IconButton label="New folder" icon={FolderPlus} size="dense" onClick={() => setNaming((v) => !v)} />
        }
      />
      {naming && (
        <div className="mb-3 space-y-2">
          <input
            className={inputClass}
            value={name}
            placeholder="Folder name"
            aria-label="New folder name"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" disabled={busy || name.trim() === ""} onClick={() => void create()}>
            {busy ? "Creating" : "Create folder"}
          </Button>
        </div>
      )}
      {problem && (
        <div className="mb-3">
          <ErrorNote error={problem} />
        </div>
      )}
      {error && <ErrorNote error={error} />}
      {loading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <ul className="space-y-0.5">
          {folders.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => onPick(f.path)}
                aria-current={f.path === current ? "true" : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                  f.path === current ? "bg-wine-50 font-semibold text-wine-700" : "text-plum-950 hover:bg-mist-50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.unreadCount > 0 && <Badge tone="wine">{f.unreadCount}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MessageList({
  mailbox,
  folder,
  folderPath,
  page,
  q,
  search,
  nonce,
  onSearch,
  onPage,
  onOpen,
  onFolderGone,
}: {
  mailbox: string;
  folder: MailFolder | null;
  folderPath: string;
  page: number;
  q: string;
  search: string;
  nonce: number;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
  onOpen: (uid: number) => void;
  onFolderGone: () => void;
}) {
  const messages = useAsync<MailMessagePage>(
    (signal) =>
      api.get(
        `/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folderPath)}/messages?page=${page}${q ? `&q=${enc(q)}` : ""}`,
        signal,
      ),
    [mailbox, folderPath, page, q, nonce],
    { keepPrevious: true },
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const custom = folder !== null && folder.specialUse === null;

  async function rename() {
    if (renaming === null) return;
    setProblem(null);
    try {
      await api.put(`/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folderPath)}`, { name: renaming.trim() });
      setRenaming(null);
      onFolderGone();
    } catch (err) {
      setProblem(asApiError(err));
    }
  }

  async function remove() {
    setProblem(null);
    try {
      await api.del(`/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folderPath)}`);
      onFolderGone();
    } catch (err) {
      setProblem(asApiError(err));
    }
  }

  const data = messages.data;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-mist-100 p-4">
        <h2 className="mr-auto text-sm font-semibold text-plum-950">{folder?.name ?? folderPath}</h2>
        {custom && renaming === null && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(folder.name)}>
              Rename
            </Button>
            <ConfirmButton size="sm" confirmLabel="Yes, delete folder and its mail" onConfirm={() => void remove()}>
              Delete folder
            </ConfirmButton>
          </>
        )}
        {renaming !== null && (
          <div className="flex w-full gap-2">
            <input
              className={inputClass}
              value={renaming}
              aria-label="Folder name"
              maxLength={100}
              onChange={(event) => setRenaming(event.target.value)}
            />
            <Button size="sm" disabled={renaming.trim() === ""} onClick={() => void rename()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
          </div>
        )}
        <label className="relative w-full">
          <span className="sr-only">Search this folder</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-550" aria-hidden="true" />
          <input
            className={`${inputClass} pl-9`}
            type="search"
            value={search}
            placeholder="Search sender, subject or text"
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
      </div>

      {problem && (
        <div className="p-4">
          <ErrorNote error={problem} />
        </div>
      )}
      {messages.error && (
        <div className="p-4">
          <ErrorNote error={messages.error} onRetry={messages.reload} />
        </div>
      )}

      {!data && messages.loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState bare title={q ? "Nothing matches that search" : "No messages here"} />
      ) : (
        data && (
          <>
            <ul className="divide-y divide-mist-100">
              {data.items.map((m) => (
                <MessageRow key={m.uid} message={m} onOpen={() => onOpen(m.uid)} />
              ))}
            </ul>
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-mist-100 p-3 text-[12px] text-slate-600">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                  Newer
                </Button>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
                <Button size="sm" variant="ghost" disabled={page >= data.totalPages} onClick={() => onPage(page + 1)}>
                  Older
                </Button>
              </div>
            )}
          </>
        )
      )}
    </Card>
  );
}

function MessageRow({ message: m, onOpen }: { message: MailMessageSummary; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-mist-50"
      >
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.unseen ? "bg-wine-600" : "bg-transparent"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-[13px] ${m.unseen ? "font-semibold text-plum-950" : "text-plum-950"}`}>
              {who(m)}
            </span>
            {m.flagged && <Flag className="h-3.5 w-3.5 shrink-0 text-wine-600" aria-label="Flagged" />}
            {m.attachments.some((a) => !a.inline) && (
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-label="Has attachments" />
            )}
            <span className="shrink-0 text-[12px] text-slate-550">{shortDate(Date.parse(m.date))}</span>
          </span>
          <span className={`mt-0.5 block truncate text-[12.5px] ${m.unseen ? "font-medium text-plum-950" : "text-slate-600"}`}>
            {m.subject || "(no subject)"}
          </span>
        </span>
        <span className="sr-only">{m.unseen ? "Unread" : "Read"}</span>
      </button>
    </li>
  );
}

function MessageView({
  mailbox,
  folderPath,
  uid,
  folders,
  trash,
  onBack,
  onReply,
  onForward,
}: {
  mailbox: string;
  folderPath: string;
  uid: number;
  folders: MailFolder[];
  trash: MailFolder | null;
  onBack: () => void;
  onReply: (m: MailMessageDetail) => void;
  onForward: (m: MailMessageDetail) => void;
}) {
  const path = `/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folderPath)}/messages/${uid}`;
  const detail = useAsync<{ message: MailMessageDetail }>((signal) => api.get(path, signal), [path]);
  const [flagged, setFlagged] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(work: () => Promise<unknown>, thenBack: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      if (thenBack) onBack();
    } catch (err) {
      setProblem(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Button size="sm" variant="ghost" onClick={onBack}>
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
      Back
    </Button>
  );

  if (detail.loading) {
    return (
      <Card>
        {back}
        <Skeleton className="mt-3 h-64 rounded-xl" />
      </Card>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <Card className="space-y-3">
        {back}
        {detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}
      </Card>
    );
  }

  const m = detail.data.message;
  const isFlagged = flagged ?? m.flagged;
  const inTrash = trash !== null && trash.path === folderPath;
  const files = m.attachments.filter((a) => !a.inline);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onReply(m)}>
            <Reply className="mr-1 h-4 w-4" aria-hidden="true" />
            Reply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onForward(m)}>
            <Forward className="mr-1 h-4 w-4" aria-hidden="true" />
            Forward
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void act(() => api.patch(path, { read: false }), true)}
          >
            Mark unread
          </Button>
          <IconButton
            label={isFlagged ? "Remove flag" : "Flag"}
            icon={Flag}
            size="dense"
            disabled={busy}
            className={isFlagged ? "text-wine-600" : ""}
            onClick={() =>
              void act(async () => {
                await api.patch(path, { flagged: !isFlagged });
                setFlagged(!isFlagged);
              }, false)
            }
          />
          <select
            className="rounded-lg border border-mist-200 bg-white px-2 py-1.5 text-[12.5px] text-plum-950"
            aria-label="Move to folder"
            value=""
            disabled={busy}
            onChange={(event) => {
              const target = event.target.value;
              if (target) void act(() => api.post(`${path}/move`, { targetFolder: target }), true);
            }}
          >
            <option value="">Move to</option>
            {folders
              .filter((f) => f.path !== folderPath)
              .map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
          </select>
          {trash && !inTrash ? (
            <IconButton
              label="Move to trash"
              icon={Trash2}
              size="dense"
              variant="danger"
              disabled={busy}
              onClick={() => void act(() => api.post(`${path}/move`, { targetFolder: trash.path }), true)}
            />
          ) : (
            <ConfirmButton
              size="sm"
              confirmLabel="Yes, delete forever"
              disabled={busy}
              onConfirm={() => void act(() => api.del(path), true)}
            >
              Delete forever
            </ConfirmButton>
          )}
        </div>
      </div>

      {problem && <ErrorNote error={problem} />}

      <div>
        <h2 className="text-lg font-semibold text-plum-950">{m.subject || "(no subject)"}</h2>
        <dl className="mt-2 space-y-0.5 text-[12.5px] text-slate-600">
          <div>
            <dt className="inline font-semibold">From: </dt>
            <dd className="inline">{m.from ? `${m.from.name} <${m.from.address}>` : "(no sender)"}</dd>
          </div>
          {m.to.length > 0 && (
            <div>
              <dt className="inline font-semibold">To: </dt>
              <dd className="inline break-all">{m.to.map((a) => a.address).join(", ")}</dd>
            </div>
          )}
          {m.cc.length > 0 && (
            <div>
              <dt className="inline font-semibold">Cc: </dt>
              <dd className="inline break-all">{m.cc.map((a) => a.address).join(", ")}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-semibold">Date: </dt>
            <dd className="inline">{dateTime(Date.parse(m.date))}</dd>
          </div>
        </dl>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((a) => (
            <li key={a.id}>
              <a
                href={`/api${path}/attachments/${enc(a.id)}?name=${enc(a.filename)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-mist-200 px-2.5 py-1.5 text-[12.5px] text-plum-950 hover:bg-mist-50"
              >
                <Paperclip className="h-3.5 w-3.5 text-slate-550" aria-hidden="true" />
                {a.filename}
                <span className="text-slate-550">{bytes(a.sizeBytes)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* Sandboxed with no permissions: a received email is somebody else's HTML, so
          it runs no script and cannot reach this origin. */}
      {m.html ? (
        <iframe title="Message" srcDoc={m.html} sandbox="" className="h-[32rem] w-full rounded-lg border border-mist-200 bg-white" />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-plum-950">{m.text}</pre>
      )}
    </Card>
  );
}

function Composer({
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
        to: list(draft.to),
        cc: list(draft.cc),
        bcc: list(draft.bcc),
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

  const empty = list(draft.to).length + list(draft.cc).length + list(draft.bcc).length === 0;

  return (
    <Card className="mb-4 space-y-3">
      <CardHead
        title={title}
        action={<span className="truncate text-[12px] text-slate-600">From {from}</span>}
      />
      {problem && <ErrorNote error={problem} />}
      <Field label="To" hint="Separate addresses with commas.">
        {/* Focused on open, which also scrolls the composer into view from a message lower down. */}
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
        <button type="button" className="text-[12px] font-semibold text-wine-700 hover:underline" onClick={() => setShowBcc(true)}>
          Add Bcc
        </button>
      )}
      <Field label="Subject">
        <input className={inputClass} value={draft.subject} maxLength={500} onChange={(event) => set("subject", event.target.value)} />
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
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || empty} onClick={() => void send()}>
          {busy ? "Sending" : "Send"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Discard
        </Button>
      </div>
    </Card>
  );
}
