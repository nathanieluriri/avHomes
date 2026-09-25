"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Forward, Mail, MoreVertical, Paperclip, Reply, Star, Trash2 } from "lucide-react";
import type { MailAddress, MailFolder, MailMessageDetail, MailThread } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, relative } from "@/lib/admin/format";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { Badge, Button, ConfirmButton, ErrorNote, Skeleton } from "@/components/admin/ui";
import { useMailActions } from "./MessageList";
import { prepareEmailHtml, snippetOf, splitTextQuote } from "./quote";
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
  keyOf,
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

/** Gmail's "•••": the quoted history, folded. */
function QuoteToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? "Hide trimmed content" : "Show trimmed content"}
      title={open ? "Hide trimmed content" : "Show trimmed content"}
      onClick={onToggle}
      className="c-tap my-2 inline-flex h-3.5 items-center rounded-full bg-mist-200 px-2 text-[12px] leading-none tracking-[1px] text-slate-600 hover:bg-mist-300"
    >
      •••
    </button>
  );
}

/**
 * A received HTML body. The frame runs no script (the sandbox has no
 * allow-scripts, and the HTML is scrubbed before it gets there); same origin
 * only so it can be sized to what it holds, including when the quote unfolds.
 */
function HtmlBody({ html, phone }: { html: string; phone: boolean }) {
  const prepared = useMemo(() => prepareEmailHtml(html), [html]);
  const [height, setHeight] = useState(phone ? 160 : 120);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <iframe
      title="Message"
      srcDoc={prepared.doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ height }}
      onLoad={(event) => {
        const doc = event.currentTarget.contentDocument;
        if (!doc?.body) return;
        // The body, not the document: the document is never shorter than the frame, so it could not shrink.
        const measure = () => setHeight(Math.max(40, Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height))));
        measure();
        observer.current?.disconnect();
        observer.current = new ResizeObserver(measure);
        observer.current.observe(doc.body);
      }}
      className="block w-full border-0 bg-white"
    />
  );
}

function TextBody({ text }: { text: string }) {
  const { body, quote } = splitTextQuote(text);
  const [open, setOpen] = useState(false);
  return (
    <div>
      {body !== "" && (
        <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-plum-950">{body}</pre>
      )}
      {quote !== "" && (
        <>
          <QuoteToggle open={open} onToggle={() => setOpen((v) => !v)} />
          {open && (
            <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-slate-600">{quote}</pre>
          )}
        </>
      )}
    </div>
  );
}

function Attachments({ m, base }: { m: MailMessageDetail; base: string }) {
  const files = m.attachments.filter((a) => !a.inline);
  if (files.length === 0) return null;
  const path = `${base}/folders/${enc(m.folder)}/messages/${m.uid}`;
  return (
    <div className="mt-4 border-t border-mist-100 pt-3">
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
  );
}

/** One message of the conversation, unfolded: who, when, to whom, the body and its files. */
function OpenMessage({
  m,
  phone,
  mailboxAddress,
  base,
  onFold,
  onReply,
  foldable,
}: {
  m: MailMessageDetail;
  phone: boolean;
  mailboxAddress: string;
  base: string;
  onFold: () => void;
  onReply: () => void;
  foldable: boolean;
}) {
  const [details, setDetails] = useState(false);
  const at = Date.parse(m.date);

  return (
    <article className={phone ? "py-3" : "py-4"} aria-label={`Message from ${who(m)}`}>
      <div className="flex items-start gap-3">
        <LetterAvatar text={who(m)} toneKey={m.from?.address ?? who(m)} />
        <div className="min-w-0 flex-1">
          <div
            className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${foldable ? "cursor-pointer" : ""}`}
            onClick={foldable ? onFold : undefined}
          >
            <span className={`font-semibold text-plum-950 ${phone ? "text-[15px]" : "text-[13.5px]"}`}>{who(m)}</span>
            {!phone && m.from && m.from.name && (
              <span className="min-w-0 truncate text-[12px] text-slate-600">&lt;{m.from.address}&gt;</span>
            )}
            <span className="ml-auto shrink-0 text-[12px] text-slate-600">
              {phone ? listDate(m.date) : `${dateTime(at)} (${relative(at)})`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={details}
              onClick={() => setDetails((v) => !v)}
              className="c-tap mt-0.5 inline-flex min-w-0 max-w-full items-center gap-1 rounded text-[12.5px] text-slate-600 hover:text-plum-950"
            >
              <span className="truncate">{toLine(m, mailboxAddress)}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${details ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <span className="flex-1" />
            <ToolIcon size={phone ? "touch" : "desk"} label="Reply to this message" icon={Reply} onClick={onReply} />
          </div>
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
      <div className={phone ? "mt-3" : "mt-3 pl-[3.25rem]"}>
        {m.html ? <HtmlBody html={m.html} phone={phone} /> : <TextBody text={m.text} />}
        <Attachments m={m} base={base} />
      </div>
    </article>
  );
}

/** One folded message: sender, the first line of what they wrote, the date. */
function FoldedMessage({ m, onOpen, phone }: { m: MailMessageDetail; onOpen: () => void; phone: boolean }) {
  const snippet = useMemo(() => snippetOf(m), [m]);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show message from ${who(m)}, ${listDate(m.date)}`}
      className={`c-tap flex w-full min-w-0 items-center gap-3 text-left hover:bg-mist-50 ${phone ? "px-4 py-3" : "px-6 py-2.5 xl:px-8"}`}
    >
      <LetterAvatar text={who(m)} toneKey={m.from?.address ?? who(m)} size="sm" />
      <span className={`shrink-0 truncate text-[13.5px] text-plum-950 ${phone ? "max-w-[40%]" : "w-44"} ${m.unseen ? "font-semibold" : "font-medium"}`}>
        {who(m)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">{snippet}</span>
      <span className="shrink-0 text-[12px] text-slate-600">{listDate(m.date)}</span>
    </button>
  );
}

/**
 * A conversation, the way Gmail reads one: every message in it from Inbox and
 * Sent, oldest first, older ones folded to a line and the newest (and any
 * that were unread) open. The toolbar acts on the conversation's messages in
 * the folder it was opened from; Reply and Forward at the foot answer the
 * newest message.
 */
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
  const base = `/admin/mail/mailboxes/${enc(mailbox)}`;
  const path = `${base}/folders/${enc(folderPath)}/messages/${uid}`;
  const loaded = useAsync<{ thread: MailThread }>((signal) => api.get(`${path}/thread`, signal), [path]);
  const thread = loaded.data?.thread ?? null;
  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const [opened, setOpened] = useState<Set<string> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [starred, setStarred] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = useMailActions(mailbox, () => {});

  // Opening marks the conversation read upstream; the rail's counts and the nav badge follow.
  const ready = thread !== null;
  useEffect(() => {
    if (!ready) return;
    announceMailChange();
    onChanged();
    // Once per conversation opened, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const latest = messages[messages.length - 1] ?? null;
  // The newest open, and whatever was unread before this visit.
  const open =
    opened ?? new Set(messages.filter((m, i) => i === messages.length - 1 || m.unseen).map(keyOf));
  const toggle = (m: MailMessageDetail) => {
    const next = new Set(open);
    if (next.has(keyOf(m))) next.delete(keyOf(m));
    else next.add(keyOf(m));
    setOpened(next);
  };

  // The toolbar's messages: this conversation's copies in the folder it was opened from.
  const here = messages.filter((m) => m.folder === folderPath);
  const targets = here.length > 0 ? here : latest ? [latest] : [];
  const trash = folders.find((f) => f.specialUse === "\\Trash") ?? null;
  const inTrash = trash !== null && trash.path === folderPath;
  const home = folders.find((f) => f.path === folderPath) ?? null;
  const isStarred = starred ?? messages.some((m) => m.flagged);
  const size = phone ? "touch" : "desk";
  const working = busy || actions.busy;

  async function run(work: () => Promise<unknown>, thenBack: boolean) {
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

  // A failed bulk call shows its own note, from useMailActions, and stays put.
  const move = (target: string) =>
    void (async () => {
      setProblem(null);
      if (await actions.move(targets, target)) onBack();
    })();
  const markUnread = () =>
    void (async () => {
      setProblem(null);
      if (await actions.flags(targets, { read: false })) onBack();
    })();
  // Gmail stars the newest message, and unstarring clears every star in the conversation.
  const toggleStar = () =>
    void (async () => {
      setProblem(null);
      const list = isStarred ? messages.filter((m) => m.flagged) : [latest!];
      if (await actions.flags(list, { flagged: !isStarred })) {
        setStarred(!isStarred);
        onChanged();
      }
    })();
  const deleteForever = (inTrash || !trash) && (
    <ConfirmButton
      size="sm"
      confirmLabel={targets.length > 1 ? `Yes, delete ${targets.length} messages forever` : "Yes, delete forever"}
      disabled={working}
      onConfirm={() =>
        void run(
          () => Promise.all(targets.map((m) => api.del(`${base}/folders/${enc(m.folder)}/messages/${m.uid}`))),
          true,
        )
      }
    >
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
      {latest && (
        <>
          {phone ? <span className="flex-1" /> : <span className="mx-1 h-5 w-px bg-mist-200" aria-hidden="true" />}
          <MoveMenu size={size} targets={folders.filter((f) => f.path !== folderPath)} disabled={working} onMove={move} />
          {trash && !inTrash && (
            <ToolIcon size={size} label="Move to trash" icon={Trash2} disabled={working} onClick={() => move(trash.path)} />
          )}
          <ToolIcon size={size} label="Mark as unread" icon={Mail} disabled={working} onClick={markUnread} />
          {!phone && (
            <ToolIcon size={size} label={isStarred ? "Remove star" : "Star"} icon={Star} active={isStarred} disabled={working} onClick={toggleStar} />
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
                <MenuRow kind={kind} onSelect={() => onReply(latest)}>
                  <Reply className="h-4 w-4 text-slate-550" aria-hidden="true" />
                  Reply
                </MenuRow>
                <MenuRow kind={kind} onSelect={() => onForward(latest)}>
                  <Forward className="h-4 w-4 text-slate-550" aria-hidden="true" />
                  Forward
                </MenuRow>
                {phone && (
                  <MenuRow kind={kind} onSelect={toggleStar}>
                    <Star className="h-4 w-4 text-slate-550" aria-hidden="true" />
                    {isStarred ? "Remove star" : "Add star"}
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

  if (loaded.loading) {
    return (
      <div className={frame}>
        {toolbar}
        <div aria-busy="true" className="space-y-3 p-4 sm:p-6">
          <span className="sr-only">Loading conversation</span>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (loaded.error || !thread || !latest) {
    return (
      <div className={frame}>
        {toolbar}
        <div className="p-4">{loaded.error && <ErrorNote error={loaded.error} onRetry={loaded.reload} />}</div>
      </div>
    );
  }

  // Gmail's "N older messages": with many folded, only the first and the last few stay listed.
  const collapsedRun = !showAll && messages.length >= 5 ? { from: 1, to: messages.length - 2 } : null;
  const gutter = phone ? "px-4" : "px-6 xl:px-8";

  const rows = messages.map((m, i) => {
    if (collapsedRun && i >= collapsedRun.from && i < collapsedRun.to) {
      if (i !== collapsedRun.from) return null;
      const hidden = collapsedRun.to - collapsedRun.from;
      return (
        <li key="more" className="relative flex items-center py-1.5">
          <span className="absolute inset-x-0 top-1/2 border-t border-mist-200" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`c-tap relative ml-4 grid h-9 min-w-9 place-items-center rounded-full border border-mist-200 bg-white px-2 text-[12.5px] font-semibold text-slate-600 hover:bg-mist-50 ${phone ? "" : "xl:ml-6"}`}
            aria-label={`Show ${hidden} older messages`}
            title={`Show ${hidden} older messages`}
          >
            {hidden}
          </button>
        </li>
      );
    }
    const isOpen = open.has(keyOf(m));
    return (
      <li key={keyOf(m)} className="border-b border-mist-100 last:border-b-0">
        {isOpen ? (
          <div className={gutter}>
            <OpenMessage
              m={m}
              phone={phone}
              mailboxAddress={mailboxAddress}
              base={base}
              foldable={messages.length > 1}
              onFold={() => toggle(m)}
              onReply={() => onReply(m)}
            />
          </div>
        ) : (
          <FoldedMessage m={m} phone={phone} onOpen={() => toggle(m)} />
        )}
      </li>
    );
  });

  const subject = (
    <>
      {thread.subject || "(no subject)"}
      {messages.length > 1 && <span className="ml-2 align-middle text-[13px] font-normal text-slate-600">{messages.length}</span>}
    </>
  );

  const notes = (problem || actions.problem) && (
    <div className={`${gutter} pt-3`}>
      <ErrorNote error={(problem ?? actions.problem)!} />
    </div>
  );

  if (phone) {
    return (
      <div className={`${frame} bg-white`}>
        {toolbar}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          {notes}
          <div className="flex items-start gap-2 px-4 pt-4">
            <h2 className="min-w-0 flex-1 text-[21px] font-medium leading-snug text-plum-950 [overflow-wrap:anywhere]">
              {subject}{" "}
              <span className="relative -top-0.5 ml-1 inline-block align-middle">
                <Badge>{folderLabel(home, folderPath)}</Badge>
              </span>
            </h2>
            <ToolIcon size="touch" label={isStarred ? "Remove star" : "Star"} icon={Star} active={isStarred} disabled={working} onClick={toggleStar} />
          </div>
          <ul className="mt-2">{rows}</ul>
          {deleteForever && <div className="mt-4 px-4">{deleteForever}</div>}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-mist-100 bg-white px-4 pb-[calc(0.75rem+var(--safe-b))] pt-3">
          <button
            type="button"
            onClick={() => onReply(latest)}
            className="c-tap flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-mist-300 text-[14px] font-semibold text-plum-950 active:bg-mist-100"
          >
            <Reply className="h-4 w-4" aria-hidden="true" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => onForward(latest)}
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {notes}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-6 pb-1 pt-5 xl:px-8">
          <h2 className="min-w-0 text-xl font-semibold leading-snug text-plum-950 [overflow-wrap:anywhere]">{subject}</h2>
          <Badge>{folderLabel(home, folderPath)}</Badge>
        </div>
        <ul className="max-w-[64rem]">{rows}</ul>
        <div className="mt-2 flex flex-wrap gap-2 px-6 pl-[4.75rem] xl:px-8 xl:pl-[5.25rem]">
          <Button variant="ghost" size="lg" onClick={() => onReply(latest)}>
            <Reply className="h-4 w-4" aria-hidden="true" />
            Reply
          </Button>
          <Button variant="ghost" size="lg" onClick={() => onForward(latest)}>
            <Forward className="h-4 w-4" aria-hidden="true" />
            Forward
          </Button>
        </div>
      </div>
    </div>
  );
}
