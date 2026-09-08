"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import type { AuthUser } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useSession } from "@/lib/admin/hooks";
import ImagePicker from "@/components/admin/ImagePicker";
import { SaveBar } from "@/components/admin/SaveBar";
import {
  Card,
  CardHead,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * Your own card, as a buyer meets it.
 *
 * This screen exists because of the chat. Before it, an account was a name and
 * a role in a table nobody outside the building ever saw. Now the same record
 * signs replies in a conversation on the public site, so the photo and the job
 * title are not vanity fields: they are what tells somebody asking about a
 * ₦4m house that a person is answering them.
 *
 * It edits ONLY the signed-in account. There is deliberately no "edit that
 * person's profile" for an admin: a photo of somebody is theirs to choose, and
 * the one legitimate case, removing an inappropriate one, is served by
 * disabling the account.
 */

interface Draft {
  displayName: string;
  title: string;
  phone: string;
  avatarUrl: string;
}

function toDraft(user: AuthUser): Draft {
  return {
    displayName: user.displayName,
    title: user.title,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
  };
}

export default function ProfilePage() {
  const { session, refresh } = useSession();

  if (session.status !== "signed-in") {
    return (
      <>
        <PageHeader icon={UserRound} title="Your profile" />
        <div aria-busy="true">
          <span className="sr-only">Loading your profile</span>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </>
    );
  }

  // Keyed on the id so a different account never inherits the last one's draft.
  return <ProfileEditor key={session.user.id} initial={session.user} onSaved={refresh} />;
}

function ProfileEditor({ initial, onSaved }: { initial: AuthUser; onSaved: () => void }) {
  const [user, setUser] = useState<AuthUser>(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Derived, never a flag set by each handler. See the listing editor for why.
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(user));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ user: AuthUser }>("/auth/me", draft);
      setUser(res.user);
      setDraft(toDraft(res.user));
      /*
       * Re-reads the session, which is what takes the nag banner down.
       * The shell renders the banner from the session it holds, so saving a
       * photo without this leaves the warning on screen until a reload, which
       * reads as a save that did not work.
       */
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SaveBar
        when={dirty}
        saving={busy}
        onDiscard={() => {
          setDraft(toDraft(user));
          setError(null);
        }}
        onSave={() => void save()}
      />

      <PageHeader
        icon={UserRound}
        title="Your profile"
        subtitle="This is what someone sees when you answer their enquiry."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="space-y-4">
            <Field label="Photo" hint="A clear headshot. Buyers reply more often to a face.">
              <ImagePicker
                value={draft.avatarUrl ? [draft.avatarUrl] : []}
                onChange={(urls) => set("avatarUrl", urls[0] ?? "")}
                max={1}
                coverLabel="Profile photo"
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <Field label="Display name">
              <input
                className={inputClass}
                value={draft.displayName}
                onChange={(event) => set("displayName", event.target.value)}
              />
            </Field>
            <Field label="Job title" hint="The line under your name. Not your access role.">
              <input
                className={inputClass}
                value={draft.title}
                placeholder="Senior Property Consultant"
                onChange={(event) => set("title", event.target.value)}
              />
            </Field>
            <Field label="Phone" hint="Shown on listings you own. Never shown in a chat.">
              <input
                className={inputClass}
                value={draft.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </Field>
          </Card>
        </div>

        <aside className="space-y-4">
          {/* A live preview, because the fields above are abstract and this is
              the concrete thing they add up to. */}
          <Card>
            <CardHead title="How you appear" />
            <div className="flex items-center gap-3 rounded-xl bg-mist-50 p-3">
              <Avatar name={draft.displayName} url={draft.avatarUrl} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-plum-950">
                  {draft.displayName || "Your name"}
                </p>
                <p className="truncate text-[12px] text-slate-600">
                  {draft.title || "No job title yet"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
              Your email address and access role are never shown to a buyer.
            </p>
          </Card>

          <Card>
            <CardHead title="Account" />
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">Email</dt>
                <dd className="truncate font-medium text-plum-950">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">Role</dt>
                <dd className="font-medium text-plum-950">{user.role}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-mist-100 pt-3 text-[12px] text-slate-600">
              Only an owner or developer can change these, from Team.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

/** A plain img: the source is an API path today and a blob host under the other
 *  store, and next/image would need a remotePattern per store. */
function Avatar({ name, url }: { name: string; url: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-wine-50 text-sm font-bold text-wine-700">
        {name.trim().slice(0, 1).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="h-11 w-11 shrink-0 rounded-full object-cover"
    />
  );
}
