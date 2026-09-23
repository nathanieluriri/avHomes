"use client";

import { useState } from "react";
import { UsersRound } from "lucide-react";
import type { CompanyView } from "@avhomes/contracts";
import { api, type ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { relative } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import {
  Badge,
  Button,
  Card,
  CardHead,
  ConfirmButton,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/** Who works on the company's listings. Everyone sees it; the main account changes it. */
export default function StaffPage() {
  const state = useAsync((signal) => api.get<CompanyView>("/admin/company/staff", signal), []);
  const [view, setView] = useState<CompanyView | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const current = view ?? state.data ?? null;

  if (state.error && !current) return <ErrorNote error={state.error} onRetry={state.reload} />;
  if (!current) return <Skeleton className="h-64" />;

  const main = current.viewer.partnerRole === "main";
  const mainName = current.accounts.find((a) => a.partnerRole === "main")?.displayName ?? "your main account";

  async function act(key: string, call: () => Promise<CompanyView & { url?: string }>) {
    setBusy(key);
    setError(null);
    setLink(null); // The last invite's link is not this action's answer.
    try {
      const next = await call();
      setView(next);
      if (next.url) {
        setLink(next.url);
        setEmail("");
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        icon={UsersRound}
        title="Staff"
        subtitle={`${current.usage.staff} of ${current.limits.staff} staff seats in use.`}
      />
      {error && (
        <div className="mb-3">
          <ErrorNote error={error} />
        </div>
      )}
      <div className="space-y-3">
        {main && (
          <Card>
            <CardHead title="Add someone" />
            <Field label="Email" hint="They sign in with this address. The invite lasts seven days.">
              <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <div className="mt-2">
              <Button
                disabled={busy !== null || email.trim() === ""}
                onClick={() =>
                  void act("invite", () =>
                    api.post<CompanyView & { url: string }>("/admin/company/staff/invites", { email: email.trim() }),
                  )
                }
              >
                {busy === "invite" ? "Inviting..." : "Invite"}
              </Button>
            </div>
            {link && (
              <p className="mt-2 break-all text-[12px] text-wine-700">
                Their sign-in link, if the mail does not arrive: {link}
              </p>
            )}
          </Card>
        )}
        <Card>
          <CardHead title="Team" />
          <ul className="divide-y divide-mist-100">
            {current.accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                <span className="text-[13px] font-medium text-plum-950">{account.displayName}</span>
                <span className="break-all text-[12px] text-slate-600">{account.email}</span>
                <Badge tone={account.partnerRole === "main" ? "wine" : "neutral"}>
                  {account.partnerRole === "main" ? "Main" : "Staff"}
                </Badge>
                {account.disabledAt !== null && <Badge tone="red">Removed</Badge>}
                {account.lastActiveAt && (
                  <span className="text-[11px] text-slate-550">Active {relative(account.lastActiveAt)}</span>
                )}
                {main && account.partnerRole === "staff" && account.disabledAt === null && (
                  <span className="ml-auto">
                    <ConfirmButton
                      size="sm"
                      confirmLabel="Yes, remove"
                      disabled={busy !== null}
                      onConfirm={() =>
                        void act(`rm:${account.id}`, () =>
                          api.post<CompanyView>(`/admin/company/staff/${account.id}/remove`),
                        )
                      }
                    >
                      Remove
                    </ConfirmButton>
                  </span>
                )}
              </li>
            ))}
            {current.invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                <span className="break-all text-[13px] text-plum-950">{invite.email}</span>
                <Badge tone="amber">Invited</Badge>
                {main && (
                  <span className="ml-auto">
                    <ConfirmButton
                      size="sm"
                      confirmLabel="Yes, revoke"
                      disabled={busy !== null}
                      onConfirm={() =>
                        void act(`inv:${invite.id}`, () =>
                          api.del<CompanyView>(`/admin/company/staff/invites/${invite.id}`),
                        )
                      }
                    >
                      Revoke
                    </ConfirmButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!main && (
            <p className="mt-2 text-[12px] text-slate-550">Only {mainName} can add or remove staff.</p>
          )}
          {main && (
            <p className="mt-2 text-[11px] text-slate-550">
              Removing someone signs them out and hands their listings to you.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
