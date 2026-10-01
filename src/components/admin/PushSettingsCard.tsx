"use client";

import { useState } from "react";
import { BellRing, Check, Copy, MailWarning } from "lucide-react";
import type {
  MailFailuresResponse,
  MailWatchView,
  PushSettingsResponse,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { dateTime, relative } from "@/lib/admin/format";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfirmButton,
  ErrorNote,
  Field,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * Settings, Push notifications: the key pair every notification is signed
 * with, shown in full on purpose so it can be copied, plus a pasted pair or a
 * fresh one, what the last week of sending looks like, and whether new mail is
 * being announced. Owner and developer only, the same line the server draws.
 */

function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

function KeyField({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label} hint={hint} as="group">
      <div className="flex items-start gap-2">
        {/* Broken anywhere, so a key fills each line rather than breaking at its one hyphen. */}
        <textarea
          readOnly
          rows={value.length > 60 ? 3 : 2}
          value={value}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className={`${inputClass} min-w-0 flex-1 resize-none font-mono text-[12px] leading-relaxed [word-break:break-all]`}
        />
        <Button
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Field>
  );
}

const WATCH_LABEL: Record<MailWatchView["state"], string> = {
  on: "On",
  off: "Off",
  "no-key": "Needs a Hostinger key",
  "not-production": "Only on the live site",
};

export function PushSettingsCard() {
  const push = useAsync((signal) => api.get<PushSettingsResponse>("/admin/push", signal), []);
  const watch = useAsync((signal) => api.get<{ watch: MailWatchView }>("/admin/mail/watch", signal), []);
  const [view, setView] = useState<PushSettingsResponse | null>(null);
  const [watchView, setWatchView] = useState<MailWatchView | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pair, setPair] = useState({ publicKey: "", privateKey: "" });
  const [busy, setBusy] = useState<null | "save" | "new" | "watch">(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const data = view ?? push.data;
  const mailWatch = watchView ?? watch.data?.watch ?? null;

  async function run(kind: "save" | "new", call: () => Promise<PushSettingsResponse>, done: string) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      setView(await call());
      setPasting(false);
      setPair({ publicKey: "", privateKey: "" });
      setNote(done);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function reconnect(off: boolean) {
    setBusy("watch");
    setError(null);
    try {
      const res = off
        ? await api.del<{ watch: MailWatchView }>("/admin/mail/watch")
        : await api.post<{ watch: MailWatchView }>("/admin/mail/watch", {});
      setWatchView(res.watch);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  if (push.loading) {
    return (
      <Card>
        <CardHead title="Push notifications" icon={BellRing} />
        <Skeleton className="h-40 rounded-xl" />
      </Card>
    );
  }
  if (push.error || !data) {
    return (
      <Card>
        <CardHead title="Push notifications" icon={BellRing} />
        {push.error && <ErrorNote error={push.error} onRetry={push.reload} />}
      </Card>
    );
  }

  const { keys, devices, week, opened } = data;
  const sent = week.delivered + week.partial + week.failed + week["no-device"];

  return (
    <Card className="space-y-4">
      <CardHead
        title="Push notifications"
        icon={BellRing}
        action={<Badge tone={keys.source === "pasted" ? "wine" : "neutral"}>{keys.source === "pasted" ? "Your pair" : "Made by the site"}</Badge>}
      />
      <p className="-mt-2 text-[12.5px] leading-relaxed text-slate-600">
        Every notification to the partner app and the console is signed with this VAPID key pair. Browsers only
        accept notifications signed by the key a device subscribed with.
        {keys.updatedAt > 0 && ` Last changed ${dateTime(keys.updatedAt)}.`}
      </p>

      <KeyField label="Public key" value={keys.publicKey} hint="Handed to every browser that turns notifications on." />
      <KeyField label="Private key" value={keys.privateKey} hint="Signs every notification. Stored encrypted." />

      {pasting ? (
        <div className="space-y-3 rounded-xl bg-mist-50 p-3">
          <Field label="New public key">
            <input
              value={pair.publicKey}
              onChange={(event) => setPair((p) => ({ ...p, publicKey: event.target.value }))}
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} font-mono`}
              placeholder="BP..."
            />
          </Field>
          <Field label="New private key">
            <input
              value={pair.privateKey}
              onChange={(event) => setPair((p) => ({ ...p, privateKey: event.target.value }))}
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy !== null || pair.publicKey.trim() === "" || pair.privateKey.trim() === ""}
              onClick={() =>
                void run(
                  "save",
                  () => api.put<PushSettingsResponse>("/admin/push/keys", { publicKey: pair.publicKey.trim(), privateKey: pair.privateKey.trim() }),
                  "Saved. Every device switches back on by itself the next time it opens the app.",
                )
              }
            >
              {busy === "save" ? "Checking the pair" : "Save this pair"}
            </Button>
            <Button variant="ghost" onClick={() => setPasting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setPasting(true)}>
            Paste a key pair
          </Button>
          <ConfirmButton
            variant="ghost"
            confirmLabel="Yes, make a new pair"
            disabled={busy !== null}
            onConfirm={() =>
              void run(
                "new",
                () => api.post<PushSettingsResponse>("/admin/push/keys/new", {}),
                "New pair made. Every device switches back on by itself the next time it opens the app.",
              )
            }
          >
            {busy === "new" ? "Making a pair" : "Make a new pair"}
          </ConfirmButton>
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-slate-600">
        Changing the pair stops notifications to every device until that device next opens the app, when it turns
        them back on by itself.
      </p>

      <div className="grid grid-cols-2 gap-3 border-t border-mist-100 pt-4 sm:grid-cols-4">
        <Stat label="Partner phones" value={devices.m} />
        <Stat label="Console devices" value={devices.admin} />
        <Stat label="Sent this week" value={sent} hint={sent > 0 ? `${opened} opened` : undefined} />
        <Stat
          label="Reached nobody"
          value={week["no-device"] + week.failed}
          hint={week.failed > 0 ? `${week.failed} failed` : "No devices on"}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-mist-100 pt-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-plum-950">
            New mail notifications <Badge tone={mailWatch?.state === "on" ? "green" : "neutral"}>{mailWatch ? WATCH_LABEL[mailWatch.state] : "Checking"}</Badge>
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
            {mailWatch?.state === "on"
              ? `Hostinger tells the console the moment mail lands in ${mailWatch.mailboxes.map((m) => m.address).join(", ")}.`
              : mailWatch?.state === "no-key"
                ? "Save a Hostinger API key under Email delivery first."
                : mailWatch?.state === "not-production"
                  ? "Hostinger can only reach the live site, so this is switched on from there."
                  : "Switches on by itself when an owner or developer turns notifications on from the live site."}
            {mailWatch && mailWatch.updatedAt > 0 && ` Checked ${relative(mailWatch.updatedAt)}.`}
          </p>
        </div>
        {mailWatch && (mailWatch.state === "on" || mailWatch.state === "off") && (
          <div className="flex gap-2">
            <Button variant="ghost" disabled={busy !== null} onClick={() => void reconnect(false)}>
              {busy === "watch" ? "Connecting" : mailWatch.state === "on" ? "Reconnect" : "Turn on"}
            </Button>
            {mailWatch.state === "on" && (
              <ConfirmButton variant="ghost" confirmLabel="Yes, stop" disabled={busy !== null} onConfirm={() => void reconnect(true)}>
                Stop
              </ConfirmButton>
            )}
          </div>
        )}
      </div>

      {error && <ErrorNote error={error} />}
      {note && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
          {note}
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-plum-950">{value}</p>
      {hint && <p className="text-[12px] text-slate-600">{hint}</p>}
    </div>
  );
}

/** Settings, Unsent email: every send the provider refused, newest first. */
export function UnsentMailCard() {
  const { data, error, loading, reload } = useAsync(
    (signal) => api.get<MailFailuresResponse>("/admin/mail/failures", signal),
    [],
  );
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      await api.post("/admin/mail/failures/clear", {});
      reload();
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card className="space-y-3">
      <CardHead
        title="Email that did not send"
        icon={MailWarning}
        action={data && data.open > 0 ? <Badge tone="red">{data.open} new</Badge> : undefined}
      />
      {loading && <Skeleton className="h-16 rounded-xl" />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          Nothing has failed. If the mail provider ever refuses a message, it is listed here with its reason, and the
          owner and developers are notified.
        </p>
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="divide-y divide-mist-100">
            {data.items.map((item) => (
              <li key={item.id} className="py-2.5">
                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-plum-950">{item.subject || "(no subject)"}</p>
                  {item.at > data.clearedAt && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="New" />}
                  <span className="shrink-0 text-[12px] text-slate-600">{relative(item.at)}</span>
                </div>
                <p className="text-[12px] text-slate-600 [overflow-wrap:anywhere]">To {item.to}</p>
                <p className="mt-1 rounded-md bg-mist-50 px-2 py-1 font-mono text-[11.5px] text-slate-700 [overflow-wrap:anywhere]">
                  {item.reason}
                </p>
              </li>
            ))}
          </ul>
          {data.open > 0 && (
            <Button variant="ghost" disabled={clearing} onClick={() => void clear()}>
              {clearing ? "Marking" : "Mark all as seen"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
