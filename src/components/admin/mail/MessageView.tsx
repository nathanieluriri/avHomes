"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Forward, Mail, MoreVertical, Paperclip, Reply, Star, Trash2 } from "lucide-react";
import type { MailAddress, MailFolder, MailMessageDetail } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, relative } from "@/lib/admin/format";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { Badge, Button, ConfirmButton, ErrorNote, Skeleton } from "@/components/admin/ui";
import {
  LetterAvatar,
  MenuRow,
  MoveMenu,
  ToolIcon,
  announceMailChange,
  asApiError,
  bytes,
  enc,
  folderLabel,
  listDate,
  who,
} from "./shared";

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
  phone = false,
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
  /** Gmail's app reading view: icon bar, full-width body, Reply and Forward pinned at the foot. */
  phone?: boolean;
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
  const size = phone ? "touch" : "desk";
  const m = detail.data?.message ?? null;
  const isFlagged = flagged ?? m?.flagged ?? false;
  const toggleStar = () =>
    void act(async () => {
      await api.patch(path, { flagged: !isFlagged });
      setFlagged(!isFlagged);
    }, false);
  const deleteForever = (inTrash || !trash) && (
    <ConfirmButton size="sm" confirmLabel="Yes, delete forever" disabled={busy} onConfirm={() => void act(() => api.del(path), true)}>
      Delete forever
    </ConfirmButton>
  );

  const toolbar = (
    <div
      className={`flex shrink-0 items-center gap-0.5 border-b border-mist-100 ${
        phone ? "h-14 bg-white px-1.5" : "min-h-12 px-1.5 py-1 sm:px-2.5"
      }`}
    >
      <ToolIcon size={size} label="Back to list" icon={ArrowLeft} onClick={onBack} />
      {m && (
        <>
          {phone ? <span className="flex-1" /> : <span className="mx-1 h-5 w-px bg-mist-200" aria-hidden="true" />}
          <MoveMenu size={size} targets={folders.filter((f) => f.path !== folderPath)} disabled={busy} onMove={move} />
          {trash && !inTrash && <ToolIcon size={size} label="Move to trash" icon={Trash2} disabled={busy} onClick={() => move(trash.path)} />}
          <ToolIcon
            size={size}
            label="Mark as unread"
            icon={Mail}
            disabled={busy}
            onClick={() => void act(() => api.patch(path, { read: false }), true)}
          />
          {!phone && (
            <ToolIcon size={size} label={isFlagged ? "Remove star" : "Star"} icon={Star} active={isFlagged} disabled={busy} onClick={toggleStar} />
          )}
          <ResponsiveMenu
            title="More"
            align="end"
            trigger={
              <button
                type="button"
                aria-label="More"
                title="More"
                className={`c-tap grid shrink-0 place-items-center rounded-full text-slate-600 hover:bg-mist-100 hover:text-plum-950 ${
                  phone ? "h-11 w-11" : "h-11 w-11 sm:h-8 sm:w-8 sm:rounded-lg"
                }`}
              >
                <MoreVertical className={phone ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
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
                {phone && (
                  <MenuRow kind={kind} onSelect={toggleStar}>
                    <Star className="h-4 w-4 text-slate-550" aria-hidden="true" />
                    {isFlagged ? "Remove star" : "Add star"}
                  </MenuRow>
                )}
              </>
            )}
          />
          {!phone && deleteForever && <span className="ml-auto">{deleteForever}</span>}
        </>
      )}
    </div>
  );

  const frame = "flex min-h-0 min-w-0 flex-1 flex-col";

  if (detail.loading) {
    return (
      <div className={frame}>
        {toolbar}
        <div aria-busy="true" className="space-y-3 p-4 sm:p-6">
          <span className="sr-only">Loading message</span>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (detail.error || !m) {
    return (
      <div className={frame}>
        {toolbar}
        <div className="p-4">{detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}</div>
      </div>
    );
  }

  const files = m.attachments.filter((a) => !a.inline);
  const at = Date.parse(m.date);

  const addressBook = details && (
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
  );

  const toggle = (
    <button
      type="button"
      aria-expanded={details}
      onClick={() => setDetails((v) => !v)}
      className="c-tap mt-0.5 inline-flex max-w-full items-center gap-1 rounded text-[12.5px] text-slate-600 hover:text-plum-950"
    >
      <span className="truncate">{toLine(m, mailboxAddress)}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${details ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );

  const body = (
    <>
      {/* Sandboxed with no permissions: a received email is somebody else's HTML, so
          it runs no script and cannot reach this origin. */}
      {m.html ? (
        <iframe
          title="Message"
          srcDoc={m.html}
          sandbox=""
          className={`w-full bg-white ${phone ? "h-[70dvh]" : "h-[max(32rem,calc(100dvh-22rem))] rounded-lg border border-mist-200"}`}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-plum-950">{m.text}</pre>
      )}

      {files.length > 0 && (
        <div className="mt-5 border-t border-mist-100 pt-4">
          <p className="mb-2 text-[12px] font-semibold text-slate-600">
            {files.length === 1 ? "One attachment" : `${files.length} attachments`}
          </p>
          <ul className="flex flex-wrap gap-2">
            {files.map((a) => (
              <li key={a.id} className="min-w-0 max-w-full">
                <a
                  href={`/api${path}/attachments/${enc(a.id)}?name=${enc(a.filename)}`}
                  className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-mist-200 px-2.5 py-1.5 text-[12.5px] text-plum-950 hover:bg-mist-50 sm:min-h-0"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-hidden="true" />
                  <span className="min-w-0 max-w-[14rem] truncate">{a.filename}</span>
                  <span className="shrink-0 text-slate-550">{bytes(a.sizeBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  if (phone) {
    return (
      <div className={`${frame} bg-white`}>
        {toolbar}
        <article className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
          {problem && (
            <div className="mb-3">
              <ErrorNote error={problem} />
            </div>
          )}
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[21px] font-medium leading-snug text-plum-950 [overflow-wrap:anywhere]">
              {m.subject || "(no subject)"}{" "}
              <span className="relative -top-0.5 ml-1 inline-block align-middle">
                <Badge>{folderLabel(here, folderPath)}</Badge>
              </span>
            </h2>
            <ToolIcon size="touch" label={isFlagged ? "Remove star" : "Star"} icon={Star} active={isFlagged} disabled={busy} onClick={toggleStar} />
          </div>

          <div className="mt-4 flex items-start gap-3">
            <LetterAvatar text={who(m)} toneKey={m.from?.address ?? who(m)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-[15px] font-semibold text-plum-950">{who(m)}</span>
                <span className="shrink-0 text-[12px] text-slate-600">{listDate(m.date)}</span>
              </div>
              {toggle}
            </div>
          </div>
          {addressBook}

          <div className="mt-5">{body}</div>
          {deleteForever && <div className="mt-6">{deleteForever}</div>}
        </article>

        <div className="flex shrink-0 gap-3 border-t border-mist-100 bg-white px-4 pb-[calc(0.75rem+var(--safe-b))] pt-3">
          <button
            type="button"
            onClick={() => onReply(m)}
            className="c-tap flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-mist-300 text-[14px] font-semibold text-plum-950 active:bg-mist-100"
          >
            <Reply className="h-4 w-4" aria-hidden="true" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => onForward(m)}
            className="c-tap flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-mist-300 text-[14px] font-semibold text-plum-950 active:bg-mist-100"
          >
            <Forward className="h-4 w-4" aria-hidden="true" />
            Forward
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={frame}>
      {toolbar}
      <article className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 xl:px-8">
        {problem && (
          <div className="mb-3">
            <ErrorNote error={problem} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h2 className="min-w-0 text-xl font-semibold leading-snug text-plum-950 [overflow-wrap:anywhere]">
            {m.subject || "(no subject)"}
          </h2>
          <Badge>{folderLabel(here, folderPath)}</Badge>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <LetterAvatar text={who(m)} toneKey={m.from?.address ?? who(m)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[13.5px] font-semibold text-plum-950">{who(m)}</span>
              {m.from && m.from.name && (
                <span className="min-w-0 truncate text-[12px] text-slate-600">&lt;{m.from.address}&gt;</span>
              )}
              <span className="ml-auto shrink-0 text-[12px] text-slate-600">
                {dateTime(at)} ({relative(at)})
              </span>
            </div>
            {toggle}
            {addressBook}
          </div>
        </div>

        <div className="mt-5 max-w-[60rem] pl-[3.25rem]">
          {body}
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
