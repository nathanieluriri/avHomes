"use client";

import { useState } from "react";
import {
  ASSIGNABLE_ROLES,
  ROLE_INFO,
  canAssign,
  canManage,
  type AssignableRole,
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
  ErrorNote,
  Field,
  PageHeader,
  Spinner,
  inputClass,
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
 */
export default function TeamPage() {
  const { session } = useSession();
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const users = useAsync<{ items: TeamUser[] }>(
    (signal) => api.get<{ items: TeamUser[] }>("/admin/users", signal),
    [],
  );
  const invites = useAsync<{ items: TeamInvite[] }>(
    (signal) => api.get<{ items: TeamInvite[] }>("/admin/invites", signal),
    [],
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-0">
            <h2 className="border-b border-mist-200 px-5 py-4 text-sm font-semibold text-plum-950">
              People
            </h2>
            {users.loading && (
              <div className="px-5">
                <Spinner />
              </div>
            )}
            {users.error && (
              <div className="p-5">
                <ErrorNote error={users.error} onRetry={users.reload} />
              </div>
            )}
            <ul>
              {users.data?.items.map((user) => {
                const manageable = actor ? canManage(actor.role, user.role) : false;
                return (
                  <li
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-100 px-5 py-4 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-plum-950">
                        {user.displayName}
                        {user.id === actor?.id && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {user.listingCount} listings · {user.postCount} posts
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={user.disabledAt ? "red" : "neutral"}>
                        {user.disabledAt ? "disabled" : ROLE_INFO[user.role].label}
                      </Badge>

                      {manageable && user.role !== "owner" && (
                        <select
                          className={`${inputClass} w-auto py-1 text-xs`}
                          value={user.role}
                          onChange={(e) =>
                            void run(() =>
                              api.patch(`/admin/users/${user.id}/role`, { role: e.target.value }),
                            )
                          }
                        >
                          {ASSIGNABLE_ROLES.filter((r) => actor && canAssign(actor.role, r)).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_INFO[r].label}
                            </option>
                          ))}
                        </select>
                      )}

                      {manageable && user.id !== actor?.id && (
                        <Button
                          variant={user.disabledAt ? "ghost" : "danger"}
                          onClick={() =>
                            void run(() =>
                              api.post(
                                `/admin/users/${user.id}/${user.disabledAt ? "enable" : "disable"}`,
                              ),
                            )
                          }
                        >
                          {user.disabledAt ? "Enable" : "Disable"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-0">
            <h2 className="border-b border-mist-200 px-5 py-4 text-sm font-semibold text-plum-950">
              Open invites
            </h2>
            {invites.error && (
              <div className="p-5">
                <ErrorNote error={invites.error} onRetry={invites.reload} />
              </div>
            )}
            {invites.data?.items.length === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground">No open invites.</p>
            )}
            <ul>
              {invites.data?.items.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-mist-100 px-5 py-4 last:border-0"
                >
                  <div>
                    <p className="font-semibold text-plum-950">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_INFO[invite.role].label} · invited by {invite.invitedByName} ·{" "}
                      {/* The SERVER's verdict, never re-derived from the clock here:
                          a client comparing expiresAt against its own clock labels
                          "open" a row the sign-in flow refuses. */}
                      {invite.state}
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => void run(() => api.del(`/admin/invites/${invite.id}`))}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div>{actor && <InviteForm actor={actor.role} onDone={() => invites.reload()} />}</div>
      </div>
    </>
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
          <input
            className={inputClass}
            type="email"
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
          <p className="mt-1 break-all font-mono text-xs">{result.url}</p>
          <p className="mt-1 text-xs">
            The link carries no credential. They sign in with the address you invited.
          </p>
        </div>
      )}
    </Card>
  );
}
