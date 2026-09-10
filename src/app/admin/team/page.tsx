"use client";

import { useState } from "react";
import {
  ASSIGNABLE_ROLES,
  ROLE_INFO,
  canAssign,
  canManage,
  type AssignableRole,
  type AuthUser,
  type Role,
  type TeamInvite,
  type TeamUser,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useSession } from "@/lib/admin/hooks";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  ErrorNote,
  Field,
  PageHeader,
  Spinner,
  inputClass,
  inputClassCompact,
} from "@/components/admin/ui";

/**
 * The team screen.
 *
 * Seniority is the SERVER's table, mirrored here by absence: `canManage` decides
 * whether a row offers any controls at all, and `canAssign` decides which roles
 * a picker lists. Both come from @avhomes/contracts, the same file the server's
 * gate reads, so what a role is described as doing and what it is allowed to do
 * cannot drift apart.
 *
 * The server still refuses independently. This only avoids offering a button
 * whose answer is already known to be 403.
 *
 * NOT GATED ON A WIDE SCREEN, and that was a real decision rather than an
 * omission. Deciding who can sign in is exactly the thing an owner does from a
 * phone, usually the moment somebody joins or leaves, and the "role matrix" that
 * normally forces a gate is not a matrix here: it is one card per person, so it
 * stacks. What it needed instead was for its three consequential controls to
 * stop firing on the first tap. All three now arm and commit through
 * `ConfirmButton`.
 */
export default function TeamPage() {
  const { session } = useSession();
  const [actionError, setActionError] = useState<ApiError | null>(null);

  /* `keepPrevious`, because every control on this screen reloads both lists.
     Without it a role change or a disable blanks the whole People card to a
     spinner and the page collapses to a fraction of its height, which on a
     phone yanks the console's scroller back to the top and away from the row
     that was just acted on. */
  const users = useAsync<{ items: TeamUser[] }>(
    (signal) => api.get<{ items: TeamUser[] }>("/admin/users", signal),
    [],
    { keepPrevious: true },
  );
  const invites = useAsync<{ items: TeamInvite[] }>(
    (signal) => api.get<{ items: TeamInvite[] }>("/admin/invites", signal),
    [],
    { keepPrevious: true },
  );

  const actor = session.status === "signed-in" ? session.user : null;

  async function run(work: () => Promise<unknown>) {
    setActionError(null);
    try {
      await work();
      users.reload();
      invites.reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    }
  }

  return (
    <>
      <PageHeader title="Team" subtitle="Membership is invite only. Roles decide which screens exist." />

      {actionError && (
        <div className="mb-4">
          <ErrorNote error={actionError} />
        </div>
      )}

      {/* The order flip is hand-rolled rather than taken from `PageColumns`,
          because this is not the record layout: it is a 2/3 and 1/3 split at
          `gap-6`, not a fluid column beside a fixed aside, and passing a
          competing `grid-cols` through `className` would leave which of the two
          wins up to Tailwind's own sort order. The flip itself follows the same
          convention `PageColumns` encodes.

          Invite first on a phone. It is the one thing this screen does that is
          not already visible elsewhere, and collapsed in source order it sat
          below two full card lists, roughly two screens down, with nothing on
          the page hinting it was there. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="order-2 space-y-6 lg:order-none lg:col-span-2">
          <Card padded={false}>
            <h2 className="border-b border-mist-200 px-4 py-4 text-sm font-semibold text-plum-950 sm:px-5">
              People
            </h2>
            {/* Only while there is nothing to show. With `keepPrevious` the
                rows survive a reload, and a spinner above them would push the
                whole list down on every action. */}
            {users.loading && !users.data && (
              <div className="px-4 sm:px-5">
                <Spinner />
              </div>
            )}
            {users.error && (
              <div className="p-4 sm:p-5">
                <ErrorNote error={users.error} onRetry={users.reload} />
              </div>
            )}
            <ul>
              {users.data?.items.map((user) => (
                <PersonRow
                  key={user.id}
                  user={user}
                  actor={actor}
                  manageable={actor ? canManage(actor.role, user.role) : false}
                  onRun={run}
                />
              ))}
            </ul>
          </Card>

          <Card padded={false}>
            <h2 className="border-b border-mist-200 px-4 py-4 text-sm font-semibold text-plum-950 sm:px-5">
              Open invites
            </h2>
            {invites.error && (
              <div className="p-4 sm:p-5">
                <ErrorNote error={invites.error} onRetry={invites.reload} />
              </div>
            )}
            {invites.data?.items.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">No open invites.</p>
            )}
            <ul>
              {invites.data?.items.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-col items-start gap-3 border-b border-mist-100 px-4 py-4 last:border-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-plum-950 [overflow-wrap:anywhere]">
                      {invite.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_INFO[invite.role].label} · invited by {invite.invitedByName} ·{" "}
                      {/* The SERVER's verdict, never re-derived from the clock here:
                          a client comparing expiresAt against its own clock labels
                          "open" a row the sign-in flow refuses. */}
                      {invite.state}
                    </p>
                  </div>
                  {/* Two taps, and the trigger stays neutral so only the armed
                      state is loud. Revoking destroys the ONLY link by which
                      this person can reach an invite-only console, and it fired
                      straight from a 32px onClick sitting under a thumb. */}
                  <ConfirmButton
                    variant="ghost"
                    confirmLabel="Yes, revoke the link"
                    onConfirm={() => void run(() => api.del(`/admin/invites/${invite.id}`))}
                  >
                    Revoke
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="order-1 lg:order-none">
          {actor && <InviteForm actor={actor.role} onDone={() => invites.reload()} />}
        </div>
      </div>
    </>
  );
}

/**
 * One person, as a card rather than as a row that happens to wrap.
 *
 * The identity block and the control cluster are stacked below `sm` and share a
 * line from `sm` up. They wrapped before, which mostly worked and put the role
 * picker directly beside a name it did not belong to whenever the wrap landed
 * mid-cluster.
 *
 * The role picker STAGES rather than commits. It used to PATCH from `onChange`,
 * so one scroll that caught the select silently changed which screens a
 * colleague could open, with no undo anywhere in the UI. Now a changed value
 * reveals a confirm beside it, and re-picking the current role puts it away.
 */
function PersonRow({
  user,
  actor,
  manageable,
  onRun,
}: {
  user: TeamUser;
  actor: AuthUser | null;
  manageable: boolean;
  onRun: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [pending, setPending] = useState<AssignableRole | null>(null);
  const staged = pending && pending !== user.role ? pending : null;

  return (
    <li className="flex flex-col gap-3 border-b border-mist-100 px-4 py-4 last:border-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="font-semibold text-plum-950">
          {user.displayName}
          {user.id === actor?.id && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
          )}
        </p>
        {/* Wrapped on a phone, one clean line in the desktop row. Where two
            colleagues share a display name the address is the only thing
            telling them apart, so hiding its domain behind an ellipsis hides
            the answer. */}
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere] sm:truncate">
          {user.email}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {user.listingCount} {user.listingCount === 1 ? "listing" : "listings"} ·{" "}
          {user.postCount} {user.postCount === 1 ? "post" : "posts"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={user.disabledAt ? "red" : "neutral"}>
          {user.disabledAt ? "disabled" : ROLE_INFO[user.role].label}
        </Badge>

        {manageable && user.role !== "owner" && (
          /* `inputClassCompact`, not `inputClass` plus overrides. The old
             `${inputClass} w-auto py-1 text-xs` set two values for three
             properties, and Tailwind v4 sorts its own output, so the rendered
             height of the most consequential control on the screen was decided
             by build order rather than by this file. `min-h-11` is additive
             (the compact class declares no height at all) so it is the one
             utility that can safely be appended here. */
          <select
            className={`${inputClassCompact} min-h-11 sm:min-h-0`}
            aria-label={`Role for ${user.displayName}`}
            value={pending ?? user.role}
            onChange={(e) => setPending(e.target.value as AssignableRole)}
          >
            {ASSIGNABLE_ROLES.filter((r) => actor && canAssign(actor.role, r)).map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </select>
        )}

        {staged && (
          <ConfirmButton
            confirmLabel={`Yes, set to ${ROLE_INFO[staged].label}`}
            onConfirm={() =>
              void onRun(() => api.patch(`/admin/users/${user.id}/role`, { role: staged })).then(
                () => setPending(null),
              )
            }
          >
            Change role
          </ConfirmButton>
        )}

        {manageable &&
          user.id !== actor?.id &&
          /* Enable is not destructive and asks nothing. Disable locks a
             colleague out of the console the moment it lands, with no undo
             path on the screen, so it arms first. */
          (user.disabledAt ? (
            <Button
              variant="ghost"
              onClick={() => void onRun(() => api.post(`/admin/users/${user.id}/enable`))}
            >
              Enable
            </Button>
          ) : (
            <ConfirmButton
              variant="danger"
              confirmLabel="Yes, remove their access"
              onConfirm={() => void onRun(() => api.post(`/admin/users/${user.id}/disable`))}
            >
              Disable
            </ConfirmButton>
          ))}
      </div>
    </li>
  );
}

function InviteForm({ actor, onDone }: { actor: Role; onDone: () => void }) {
  const assignable = ASSIGNABLE_ROLES.filter((r) => canAssign(actor, r));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>(assignable[0] ?? "agent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);

  if (assignable.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">Your role cannot invite anyone.</p>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ invite: { url: string }; emailed: boolean }>("/admin/invites", {
        email,
        role,
      });
      setResult({ url: res.invite.url, emailed: res.emailed });
      setEmail("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-plum-950">Invite someone</h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Email">
          {/* No autofill token. `type="email"` already raises the right
              keyboard, and an `email` token here offers the operator their OWN
              saved address for a field that names somebody else. */}
          <input
            className={inputClass}
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role" hint={ROLE_INFO[role].description}>
          <select
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </select>
        </Field>

        {error && <ErrorNote error={error} />}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Sending" : "Send invite"}
        </Button>
      </form>

      {result && (
        <div className="mt-4 rounded-xl border border-wine-100 bg-wine-50 p-3 text-sm text-wine-700">
          {/* The URL is returned whether or not the mail went, because an invite
              is the only way a second person reaches an invite-only instance and
              a mail outage must not lock the team out of growing. */}
          <p className="font-semibold">
            {result.emailed ? "Invite sent." : "Invite created, but no email was sent."}
          </p>
          <InviteLink url={result.url} />
          <p className="mt-1 text-xs">
            The link carries no credential. They sign in with the address you invited.
          </p>
        </div>
      )}
    </Card>
  );
}

/**
 * The invite URL, with a way to get it off the screen.
 *
 * It was static text, so the only route out of it on a phone was a long press,
 * a drag of two selection handles across a wrapped mono string, and a hope that
 * the selection had not taken the sentence underneath as well. Losing a
 * character out of the middle of a signed link fails silently at the far end.
 *
 * The label only says "Copied" once the clipboard write has actually resolved.
 * A page served over plain http, or a browser that refuses the API, rejects it,
 * and claiming success for the one artefact that lets a colleague in would be
 * the worst possible lie on this screen. The URL stays selectable either way.
 */
function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-1 flex items-start gap-2">
      <p className="min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere]">{url}</p>
      <Button
        variant="ghost"
        onClick={() => {
          // `?.` short-circuits the whole chain, which is what a page served
          // over plain http needs: there `navigator.clipboard` is undefined,
          // not merely refusing.
          void navigator.clipboard?.writeText(url).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
