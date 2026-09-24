"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import type { MailProvider, MailSettingsView, MailboxRef } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
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
  type Tone,
} from "@/components/admin/ui";

/**
 * Settings, Email delivery: the Hostinger API key and which mailbox the site
 * sends as. Owner and developer only, and saved on its own rather than through
 * the page's save bar, because a key is checked against Hostinger before it is
 * kept and that answer belongs next to the field.
 */

const PROVIDER: Record<MailProvider, { label: string; tone: Tone }> = {
  hostinger: { label: "Hostinger", tone: "green" },
  resend: { label: "Resend", tone: "neutral" },
  none: { label: "Not set up", tone: "amber" },
};

function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export function MailDeliveryCard({ defaultTestTo }: { defaultTestTo: string }) {
  const { data, error, loading, reload } = useAsync<{ mail: MailSettingsView }>(
    (signal) => api.get<{ mail: MailSettingsView }>("/admin/settings/mail", signal),
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardHead title="Email delivery" icon={Mail} />
        <Skeleton className="h-24 rounded-xl" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardHead title="Email delivery" icon={Mail} />
        <ErrorNote error={error} onRetry={reload} />
      </Card>
    );
  }
  if (!data) return null;
  return <MailDeliveryEditor initial={data.mail} defaultTestTo={defaultTestTo} />;
}

function MailDeliveryEditor({ initial, defaultTestTo }: { initial: MailSettingsView; defaultTestTo: string }) {
  const [mail, setMail] = useState(initial);
  const [key, setKey] = useState("");
  const [mailboxes, setMailboxes] = useState<MailboxRef[] | null>(null);
  const [sender, setSender] = useState({ mailboxId: initial.senderMailboxId, displayName: initial.displayName });
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [busy, setBusy] = useState<null | "key" | "clear" | "sender" | "test" | "send">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const usable = (mail.keySaved && !mail.keyUnreadable) || mail.envKey;
  const senderDirty = sender.mailboxId !== mail.senderMailboxId || sender.displayName !== mail.displayName;

  // The mailbox list comes from Hostinger, so it is fetched only once a key can reach it.
  useEffect(() => {
    if (!usable) return;
    let live = true;
    api
      .post<{ mailboxes: MailboxRef[] }>("/admin/settings/mail/test")
      .then((res) => {
        if (live) setMailboxes(res.mailboxes);
      })
      .catch((err: unknown) => {
        if (live) setError(toApiError(err));
      });
    return () => {
      live = false;
    };
  }, [usable, mail.keyLast4]);

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      setNote(await work());
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  function adopt(next: MailSettingsView) {
    setMail(next);
    setSender({ mailboxId: next.senderMailboxId, displayName: next.displayName });
  }

  const saveKey = () =>
    run("key", async () => {
      const res = await api.put<{ mail: MailSettingsView }>("/admin/settings/mail", { apiKey: key.trim() });
      adopt(res.mail);
      setKey("");
      const reach = await api.post<{ mailboxes: MailboxRef[] }>("/admin/settings/mail/test");
      setMailboxes(reach.mailboxes);
      return "Key saved. Hostinger accepted it.";
    });

  const clearKey = () =>
    run("clear", async () => {
      const res = await api.put<{ mail: MailSettingsView }>("/admin/settings/mail", { apiKey: null });
      adopt(res.mail);
      setMailboxes(null);
      return "Key removed.";
    });

  const saveSender = () =>
    run("sender", async () => {
      const res = await api.put<{ mail: MailSettingsView }>("/admin/settings/mail", {
        senderMailboxId: sender.mailboxId,
        displayName: sender.displayName.trim(),
      });
      adopt(res.mail);
      return "Sender saved.";
    });

  const testConnection = () =>
    run("test", async () => {
      const res = await api.post<{ mailboxes: MailboxRef[] }>("/admin/settings/mail/test");
      setMailboxes(res.mailboxes);
      const n = res.mailboxes.length;
      return `Connected. This key reaches ${n} ${n === 1 ? "mailbox" : "mailboxes"}.`;
    });

  const sendTest = () =>
    run("send", async () => {
      const res = await api.post<{ to: string }>("/admin/settings/mail/test-send", { to: testTo.trim() });
      return `Test email sent to ${res.to}.`;
    });

  const keyHint = mail.keyUnreadable
    ? "The saved key can no longer be read, usually because the deployment's session secret changed. Paste it again."
    : mail.keySaved
      ? `A key ending in ${mail.keyLast4 ?? "????"} is saved. Paste a new one to replace it.`
      : mail.envKey
        ? "Using the key set on the deployment. A key saved here takes over from it."
        : "In the Hostinger panel: Emails, then API. The key is checked with Hostinger before it is saved, and it is never shown again.";

  const provider = PROVIDER[mail.provider];

  return (
    <Card className="space-y-4">
      <CardHead title="Email delivery" icon={Mail} action={<Badge tone={provider.tone}>{provider.label}</Badge>} />
      <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
        Invites, enquiry replies and notifications go out from a Hostinger mailbox once a key is
        saved.{" "}
        {mail.resendConfigured
          ? "Resend stays set up as the fallback, and still carries newsletters and anything that needs a reply-to address."
          : "Without a key, nothing is sent."}
      </p>

      {error && <ErrorNote error={error} />}
      {note && (
        <p role="status" className="rounded-lg bg-mist-50 px-3 py-2 text-[12.5px] text-plum-950">
          {note}
        </p>
      )}

      <Field label="Hostinger API key" hint={keyHint}>
        <input
          className={inputClass}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          placeholder={mail.keySaved && !mail.keyUnreadable ? `Saved, ending ${mail.keyLast4 ?? ""}` : "Paste the API key"}
          onChange={(event) => setKey(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={key.trim() === "" || busy !== null} onClick={() => void saveKey()}>
          {busy === "key" ? "Checking" : mail.keySaved ? "Replace key" : "Save key"}
        </Button>
        {usable && (
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void testConnection()}>
            {busy === "test" ? "Testing" : "Test connection"}
          </Button>
        )}
        {mail.keySaved && (
          <ConfirmButton size="sm" confirmLabel="Yes, remove the key" disabled={busy !== null} onConfirm={() => void clearKey()}>
            Remove key
          </ConfirmButton>
        )}
      </div>

      {usable && (
        <>
          <Field label="Send as" hint="The mailbox every email from the site comes from.">
            <select
              className={inputClass}
              value={sender.mailboxId}
              disabled={mailboxes === null}
              onChange={(event) => setSender((s) => ({ ...s, mailboxId: event.target.value }))}
            >
              <option value="">
                {mailboxes === null ? "Loading mailboxes" : `First mailbox${mailboxes[0] ? ` (${mailboxes[0].address})` : ""}`}
              </option>
              {(mailboxes ?? []).map((m) => (
                <option key={m.resourceId} value={m.resourceId}>
                  {m.address}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sender name" hint="Shown beside the address in the recipient's inbox. Leave empty to show the address alone.">
            <input
              className={inputClass}
              value={sender.displayName}
              maxLength={80}
              placeholder="AV Homes"
              onChange={(event) => setSender((s) => ({ ...s, displayName: event.target.value }))}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!senderDirty || busy !== null} onClick={() => void saveSender()}>
              {busy === "sender" ? "Saving" : "Save sender"}
            </Button>
            <Link
              href="/admin/mail"
              className="inline-flex items-center rounded-lg px-3 text-[13px] font-semibold text-wine-700 hover:underline"
            >
              Open the mailboxes
            </Link>
          </div>
        </>
      )}

      {mail.provider !== "none" && (
        <Field label="Send a test email" hint="A real email through the same route invites and replies take." as="group">
          <div className="flex gap-2">
            <input
              className={inputClass}
              type="email"
              aria-label="Test email address"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={testTo.trim() === "" || busy !== null}
              onClick={() => void sendTest()}
            >
              {busy === "send" ? "Sending" : "Send"}
            </Button>
          </div>
        </Field>
      )}
    </Card>
  );
}
