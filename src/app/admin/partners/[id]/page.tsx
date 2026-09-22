"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  PARTNER_LIMIT_HINT,
  PARTNER_LIMIT_KEYS,
  PARTNER_LIMIT_LABEL,
  PARTNER_STATUS_LABEL,
  type PartnerAccount,
  type PartnerDetail,
  type PartnerLimitKey,
} from "@avhomes/contracts";
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

/** One partner company: its limits, its team and every action on it. */
export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsync((signal) => api.get<PartnerDetail>(`/admin/partners/${id}`, signal), [id]);
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const current = detail ?? state.data ?? null;

  if (state.error && !current) return <ErrorNote error={state.error} onRetry={state.reload} />;
  if (!current) return <Skeleton className="h-64" />;

  return (
    <>
      <PageHeader
        icon={Building2}
        title={current.partner.name}
        backTo="/admin/partners"
        backLabel="Partners"
        badge={
          <Badge tone={current.partner.status === "active" ? "green" : "red"}>
            {PARTNER_STATUS_LABEL[current.partner.status]}
          </Badge>
        }
      />
      <div className="space-y-3">
        <TeamCard detail={current} onChanged={setDetail} />
        {/* Keyed by revision, so a card's draft restarts from the record whenever the record changes. */}
        <LimitsCard key={`limits-${current.partner.revision}`} detail={current} onChanged={setDetail} />
        <NameCard key={`name-${current.partner.revision}`} detail={current} onChanged={setDetail} />
        <AccessCard key={`access-${current.partner.revision}`} detail={current} onChanged={setDetail} />
      </div>
    </>
  );
}

type Changed = (next: PartnerDetail) => void;

/** Runs one action, holding its error and its busy flag. */
function useAction(onChanged: Changed) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  async function run(key: string, call: () => Promise<PartnerDetail>) {
    setBusy(key);
    setError(null);
    try {
      onChanged(await call());
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, run };
}

function TeamCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
  const { busy, error, run } = useAction(onChanged);
  const base = `/admin/partners/${detail.partner.id}`;
  return (
    <Card>
      <CardHead title="Team" />
      {error && (
        <div className="mb-2">
          <ErrorNote error={error} />
        </div>
      )}
      <ul className="divide-y divide-mist-100">
        {detail.accounts.map((account: PartnerAccount) => (
          <li key={account.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
            <span className="min-w-0 text-[13px] font-medium text-plum-950">{account.displayName}</span>
            <span className="min-w-0 break-all text-[12px] text-slate-600">{account.email}</span>
            <Badge tone={account.partnerRole === "main" ? "wine" : "neutral"}>
              {account.partnerRole === "main" ? "Main" : "Staff"}
            </Badge>
            {account.disabledAt !== null && <Badge tone="red">Disabled</Badge>}
            <span className="text-[11px] text-slate-550">
              {account.lastActiveAt ? `Active ${relative(account.lastActiveAt)}` : "Never signed in"}
            </span>
            <span className="ml-auto flex gap-1.5">
              {account.partnerRole === "staff" && account.disabledAt === null && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(`main:${account.id}`, () =>
                      api.post<PartnerDetail>(`${base}/main`, { userId: account.id }),
                    )
                  }
                >
                  Make main
                </Button>
              )}
              {account.partnerRole === "staff" &&
                (account.disabledAt === null ? (
                  <ConfirmButton
                    size="sm"
                    confirmLabel="Yes, disable"
                    disabled={busy !== null}
                    onConfirm={() =>
                      void run(`off:${account.id}`, () =>
                        api.post<PartnerDetail>(`${base}/accounts/${account.id}/disable`),
                      )
                    }
                  >
                    Disable
                  </ConfirmButton>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`on:${account.id}`, () =>
                        api.post<PartnerDetail>(`${base}/accounts/${account.id}/enable`),
                      )
                    }
                  >
                    Enable
                  </Button>
                ))}
            </span>
          </li>
        ))}
        {detail.invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
            <span className="min-w-0 break-all text-[13px] text-plum-950">{invite.email}</span>
            <Badge tone="amber">Invited</Badge>
            <span className="text-[11px] text-slate-550">Expires {relative(invite.expiresAt)}</span>
            <span className="ml-auto">
              <ConfirmButton
                size="sm"
                confirmLabel="Yes, revoke"
                disabled={busy !== null}
                onConfirm={() =>
                  void run(`inv:${invite.id}`, () => api.del<PartnerDetail>(`${base}/invites/${invite.id}`))
                }
              >
                Revoke
              </ConfirmButton>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-550">
        Disabling a staff account hands its listings to the main account. The main account cannot be
        disabled on its own: make someone else main first, or suspend the company.
      </p>
    </Card>
  );
}

function LimitsCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
  const { busy, error, run } = useAction(onChanged);
  const [draft, setDraft] = useState<Record<PartnerLimitKey, string>>(() => ({
    review: detail.partner.limits.review?.toString() ?? "",
    live: detail.partner.limits.live?.toString() ?? "",
    staff: detail.partner.limits.staff?.toString() ?? "",
  }));
  // Empty means "use the default", which is what null stores.
  const parse = (value: string) => (value.trim() === "" ? null : Number(value));
  return (
    <Card>
      <CardHead title="Limits" />
      {error && (
        <div className="mb-2">
          <ErrorNote error={error} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {PARTNER_LIMIT_KEYS.map((key) => (
          <Field key={key} label={PARTNER_LIMIT_LABEL[key]} hint={PARTNER_LIMIT_HINT[key]}>
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft[key]}
              placeholder={`Default, ${detail.defaults[key]}`}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value.replace(/[^0-9]/g, "") })}
            />
            <span className="mt-1 block text-[11px] text-slate-550">
              Using {detail.usage[key]} of {detail.limits[key]}
            </span>
          </Field>
        ))}
      </div>
      <div className="mt-3">
        <Button
          disabled={busy !== null}
          onClick={() =>
            void run("limits", () =>
              api.patch<PartnerDetail>(`/admin/partners/${detail.partner.id}`, {
                baseRevision: detail.partner.revision,
                limits: { review: parse(draft.review), live: parse(draft.live), staff: parse(draft.staff) },
              }),
            )
          }
        >
          {busy === "limits" ? "Saving..." : "Save limits"}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-550">
        Lowering a limit takes nothing down. It stops new ones until they are back under it.
      </p>
    </Card>
  );
}

function NameCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
  const { busy, error, run } = useAction(onChanged);
  const [name, setName] = useState(detail.partner.name);
  const p = detail.partner;
  return (
    <Card>
      <CardHead title="Company" />
      {error && (
        <div className="mb-2">
          <ErrorNote error={error} />
        </div>
      )}
      <Field label="Name" hint="Printed on their listings. Only AV Homes changes it.">
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="mt-2">
        <Button
          variant="ghost"
          disabled={busy !== null || name.trim() === p.name}
          onClick={() =>
            void run("name", () =>
              api.patch<PartnerDetail>(`/admin/partners/${p.id}`, { baseRevision: p.revision, name: name.trim() }),
            )
          }
        >
          {busy === "name" ? "Saving..." : "Save name"}
        </Button>
      </div>
      {/* [overflow-wrap:anywhere]: a contact email has no natural break, and a long
          one would otherwise push this line into horizontal scroll on a phone. */}
      <p className="mt-3 text-[12px] text-slate-600 [overflow-wrap:anywhere]">
        {p.contactName || "No contact name"} · {p.contactEmail || "no email"} · {p.contactPhone || "no phone"}
      </p>
    </Card>
  );
}

function AccessCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
  const { busy, error, run } = useAction(onChanged);
  const [reason, setReason] = useState("");
  const suspended = detail.partner.status === "suspended";
  const path = `/admin/partners/${detail.partner.id}/${suspended ? "reinstate" : "suspend"}`;
  return (
    <Card>
      <CardHead title="Access" />
      {error && (
        <div className="mb-2">
          <ErrorNote error={error} />
        </div>
      )}
      {detail.partner.statusReason && (
        <p className="mb-2 text-[12px] text-slate-600">Last change: {detail.partner.statusReason}</p>
      )}
      <Field
        label="Why"
        hint={
          suspended
            ? "They are told this when their access comes back."
            : "They are told this. Suspending signs every account out and takes their listings off the site."
        }
      >
        <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <div className="mt-2">
        <ConfirmButton
          variant={suspended ? "primary" : "danger"}
          confirmLabel={suspended ? "Yes, reinstate" : "Yes, suspend"}
          disabled={busy !== null || reason.trim().length < 3}
          onConfirm={() => void run("access", () => api.post<PartnerDetail>(path, { reason: reason.trim() }))}
        >
          {suspended ? "Reinstate" : "Suspend"}
        </ConfirmButton>
      </div>
    </Card>
  );
}
