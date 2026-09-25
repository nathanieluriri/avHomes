"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FolderInput,
  Forward,
  Mail,
  MoreVertical,
  Paperclip,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import type { MailAddress, MailFolder, MailMessageDetail } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, relative } from "@/lib/admin/format";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { Badge, Button, ConfirmButton, ErrorNote, Skeleton } from "@/components/admin/ui";
import {
  MenuLabel,
  MenuRow,
  announceMailChange,
  asApiError,
  bytes,
  enc,
  folderIcon,
  folderLabel,
  initialOf,
  who,
} from "./shared";

function ToolIcon({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  icon: typeof Star;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
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
      <Icon className={`h-4 w-4 ${active ? "fill-amber-400 text-amber-500" : ""}`} aria-hidden="true" />
    </button>
  );
}

function list(addresses: MailAddress[]): string {
  return addresses.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");
}

/** "to me", "to arc_athanasius", or the first name on the To line. */
function toLine(m: MailMessageDetail, mailboxAddress: string): string {
  const own = mailboxAddress.toLowerCase();
  const all = [...m.to, ...m.cc];
  const names = all.map((a) => (a.address.toLowerCase() === own ? "me" : a.name || a.address.split("@")[0]));
  if (names.length === 0) return "to undisclosed recipients";
  const shown = names.slice(0, 2).join(", ");
  return `to ${shown}${names.length > 2 ? ` and ${names.length - 2} more` : ""}`;
}

export function MessageView({
  mailbox,
  mailboxAddress,
  folderPath,
  uid,
  folders,
  onBack,
  onReply,
  onForward,
  onChanged,
}: {
  mailbox: string;
  mailboxAddress: string;
  folderPath: string;
  uid: number;
  folders: MailFolder[];
  onBack: () => void;
  onReply: (m: MailMessageDetail) => void;
  onForward: (m: MailMessageDetail) => void;
  onChanged: () => void;
}) {
  const path = `/admin/mail/mailboxes/${enc(mailbox)}/folders/${enc(folderPath)}/messages/${uid}`;
  const detail = useAsync<{ message: MailMessageDetail }>((signal) => api.get(path, signal), [path]);
  const [flagged, setFlagged] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);

  // Opening marks it read upstream; the rail's counts and the nav badge follow.
  const loaded = detail.data !== null;
  useEffect(() => {
    if (!loaded) return;
    announceMailChange();
    onChanged();
    // Once per message opened, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  async function act(work: () => Promise<unknown>, thenBack: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      announceMailChange();
      if (thenBack) onBack();
      else onChanged();
    } catch (err) {
      setProblem(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const trash = folders.find((f) => f.specialUse === "\\Trash") ?? null;
  const inTrash = trash !== null && trash.path === folderPath;
  const here = folders.find((f) => f.path === folderPath) ?? null;
  const move = (target: string) => void act(() => api.post(`${path}/move`, { targetFolder: target }), true);

  const toolbar = (m: MailMessageDetail | null) => {
    const isFlagged = flagged ?? m?.flagged ?? false;
    return (
      <div className="flex min-h-12 items-center gap-0.5 border-b border-mist-100 px-1.5 py-1 sm:px-2.5">
        <ToolIcon label="Back to list" icon={ArrowLeft} onClick={onBack} />
        {m && (
          <>
            <span className="mx-1 h-5 w-px bg-mist-200" aria-hidden="true" />
            <ResponsiveMenu
              title="Move to"
              align="start"
              trigger={
                <button
                  type="button"
                  aria-label="Move to"
                  title="Move to"
                  disabled={busy}
                  className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-mist-100 hover:text-plum-950 disabled:opacity-40 sm:h-8 sm:w-8"
                >
                  <FolderInput className="h-4 w-4" aria-hidden="true" />
                </button>
              }
              items={(kind) => (
                <>
                  <MenuLabel>Move to</MenuLabel>
                  {folders
                    .filter((f) => f.path !== folderPath)
                    .map((f) => {
                      const Icon = folderIcon(f, f.path);
                      return (
                        <MenuRow key={f.path} kind={kind} onSelect={() => move(f.path)}>
                          <Icon className="h-4 w-4 text-slate-550" aria-hidden="true" />
                          <span className="truncate">{folderLabel(f, f.path)}</span>
                        </MenuRow>
                      );
                    })}
                </>
              )}
            />
            {trash && !inTrash && (
              <ToolIcon label="Move to trash" icon={Trash2} disabled={busy} onClick={() => move(trash.path)} />
            )}
            <ToolIcon
              label="Mark as unread"
              icon={Mail}
              disabled={busy}
              onClick={() => void act(() => api.patch(path, { read: false }), true)}
            />
            <ToolIcon
              label={isFlagged ? "Remove star" : "Star"}
              icon={Star}
              active={isFlagged}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.patch(path, { flagged: !isFlagged });
                  setFlagged(!isFlagged);
                }, false)
              }
            />
            <ResponsiveMenu
              title="More"
              align="start"
              trigger={
                <button
                  type="button"
                  aria-label="More"
                  title="More"
                  className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-mist-100 hover:text-plum-950 sm:h-8 sm:w-8"
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>
              }
              items={(kind) => (
                <>
                  <MenuRow kind={kind} onSelect={() => onReply(m)}>
                    <Reply className="h-4 w-4 text-slate-550" aria-hidden="true" />
                    Reply
                  </MenuRow>
                  <MenuRow kind={kind} onSelect={() => onForward(m)}>
                    <Forward className="h-4 w-4 text-slate-550" aria-hidden="true" />
                    Forward
                  </MenuRow>
                </>
              )}
            />
            {(inTrash || !trash) && (
              <span className="ml-auto">
                <ConfirmButton
                  size="sm"
                  confirmLabel="Yes, delete forever"
                  disabled={busy}
                  onConfirm={() => void act(() => api.del(path), true)}
                >
                  Delete forever
                </ConfirmButton>
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  if (detail.loading) {
    return (
      <div>
        {toolbar(null)}
        <div aria-busy="true" className="space-y-3 p-4 sm:p-6">
          <span className="sr-only">Loading message</span>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div>
        {toolbar(null)}
        <div className="p-4">{detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}</div>
      </div>
    );
  }

  const m = detail.data.message;
  const files = m.attachments.filter((a) => !a.inline);
  const at = Date.parse(m.date);

  return (
    <div>
      {toolbar(m)}
      <article className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        {problem && (
          <div className="mb-3">
            <ErrorNote error={problem} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h2 className="min-w-0 text-lg font-semibold leading-snug text-plum-950 [overflow-wrap:anywhere] sm:text-xl">
            {m.subject || "(no subject)"}
          </h2>
          <Badge>{folderLabel(here, folderPath)}</Badge>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wine-50 text-[15px] font-semibold text-wine-700"
          >
            {initialOf(who(m))}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[13.5px] font-semibold text-plum-950">{who(m)}</span>
              {m.from && m.from.name && (
                <span className="min-w-0 truncate text-[12px] text-slate-600">&lt;{m.from.address}&gt;</span>
              )}
              <span className="w-full text-[12px] text-slate-600 sm:ml-auto sm:w-auto sm:shrink-0">
                {dateTime(at)} <span className="hidden sm:inline">({relative(at)})</span>
              </span>
            </div>
            <button
              type="button"
              aria-expanded={details}
              onClick={() => setDetails((v) => !v)}
              className="c-tap mt-0.5 inline-flex max-w-full items-center gap-1 rounded text-[12px] text-slate-600 hover:text-plum-950"
            >
              <span className="truncate">{toLine(m, mailboxAddress)}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${details ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {details && (
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl border border-mist-200 p-3 text-[12px]">
                <dt className="text-slate-600">from</dt>
                <dd className="text-plum-950 [overflow-wrap:anywhere]">{m.from ? list([m.from]) : "(no sender)"}</dd>
                {m.to.length > 0 && (
                  <>
                    <dt className="text-slate-600">to</dt>
                    <dd className="text-plum-950 [overflow-wrap:anywhere]">{list(m.to)}</dd>
                  </>
                )}
                {m.cc.length > 0 && (
                  <>
                    <dt className="text-slate-600">cc</dt>
                    <dd className="text-plum-950 [overflow-wrap:anywhere]">{list(m.cc)}</dd>
                  </>
                )}
                {m.bcc.length > 0 && (
                  <>
                    <dt className="text-slate-600">bcc</dt>
                    <dd className="text-plum-950 [overflow-wrap:anywhere]">{list(m.bcc)}</dd>
                  </>
                )}
                <dt className="text-slate-600">date</dt>
                <dd className="text-plum-950">{dateTime(at)}</dd>
                <dt className="text-slate-600">subject</dt>
                <dd className="text-plum-950 [overflow-wrap:anywhere]">{m.subject || "(no subject)"}</dd>
                <dt className="text-slate-600">mailbox</dt>
                <dd className="text-plum-950 [overflow-wrap:anywhere]">{mailboxAddress}</dd>
              </dl>
            )}
          </div>
        </div>

        <div className="mt-5 sm:pl-[3.25rem]">
          {/* Sandboxed with no permissions: a received email is somebody else's HTML, so
              it runs no script and cannot reach this origin. */}
          {m.html ? (
            <iframe
              title="Message"
              srcDoc={m.html}
              sandbox=""
              className="h-[60dvh] w-full rounded-lg border border-mist-200 bg-white sm:h-[32rem]"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-plum-950">{m.text}</pre>
          )}

          {files.length > 0 && (
            <div className="mt-5 border-t border-mist-100 pt-4">
              <p className="mb-2 text-[12px] font-semibold text-slate-600">
                {files.length === 1 ? "One attachment" : `${files.length} attachments`}
              </p>
              <ul className="flex flex-wrap gap-2">
                {files.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api${path}/attachments/${enc(a.id)}?name=${enc(a.filename)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-mist-200 px-2.5 py-1.5 text-[12.5px] text-plum-950 hover:bg-mist-50"
                    >
                      <Paperclip className="h-3.5 w-3.5 text-slate-550" aria-hidden="true" />
                      <span className="max-w-[14rem] truncate">{a.filename}</span>
                      <span className="text-slate-550">{bytes(a.sizeBytes)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="ghost" size="lg" onClick={() => onReply(m)}>
              <Reply className="h-4 w-4" aria-hidden="true" />
              Reply
            </Button>
            <Button variant="ghost" size="lg" onClick={() => onForward(m)}>
              <Forward className="h-4 w-4" aria-hidden="true" />
              Forward
            </Button>
          </div>
        </div>
      </article>
    </div>
  );
}
