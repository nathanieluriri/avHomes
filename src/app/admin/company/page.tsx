"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import {
  PARTNER_LIMIT_HINT,
  PARTNER_LIMIT_KEYS,
  PARTNER_LIMIT_LABEL,
  type CompanyView,
} from "@avhomes/contracts";
import { api, type ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { toApiError } from "@/lib/admin/marketing";
import {
  Button,
  Card,
  CardHead,
  DRow,
  DefinitionList,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/** The company, its limits and how much of each is used. */
export default function CompanyPage() {
  const state = useAsync((signal) => api.get<CompanyView>("/admin/company", signal), []);
  const [view, setView] = useState<CompanyView | null>(null);
  const current = view ?? state.data ?? null;

  if (state.error && !current) return <ErrorNote error={state.error} onRetry={state.reload} />;
  if (!current) return <Skeleton className="h-64" />;

  const main = current.viewer.partnerRole === "main";
  return (
    <>
      <PageHeader icon={Building2} title={current.partner.name} subtitle="Your company on AV Homes." />
      <div className="space-y-3">
        <Card>
          <CardHead title="Limits" />
          <DefinitionList>
            {PARTNER_LIMIT_KEYS.map((key) => (
              <DRow key={key} label={`${PARTNER_LIMIT_LABEL[key]}. ${PARTNER_LIMIT_HINT[key]}`}>
                {current.usage[key]} of {current.limits[key]}
              </DRow>
            ))}
          </DefinitionList>
          {PARTNER_LIMIT_KEYS.some((key) => current.usage[key] > current.limits[key]) && (
            <p className="mt-2 text-[12px] text-slate-600">
              You are over a limit. Nothing is taken down, but nothing new can be added there until
              you are back under it.
            </p>
          )}
        </Card>
        {/* Keyed by revision, so its draft restarts from the record whenever the record changes. */}
        <ContactCard key={current.partner.revision} view={current} editable={main} onChanged={setView} />
      </div>
    </>
  );
}

function ContactCard({
  view,
  editable,
  onChanged,
}: {
  view: CompanyView;
  editable: boolean;
  onChanged: (next: CompanyView) => void;
}) {
  const p = view.partner;
  const [contactName, setContactName] = useState(p.contactName);
  const [contactEmail, setContactEmail] = useState(p.contactEmail);
  const [contactPhone, setContactPhone] = useState(p.contactPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onChanged(
        await api.patch<CompanyView>("/admin/company", {
          baseRevision: p.revision,
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
        }),
      );
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead title="Contact" />
      {error && (
        <div className="mb-2">
          <ErrorNote error={error} />
        </div>
      )}
      <p className="mb-3 text-[12px] text-slate-600">
        AV Homes mails review decisions here. The company name on your listings is changed by AV Homes.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input className={inputClass} value={contactName} disabled={!editable} onChange={(e) => setContactName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={contactEmail} disabled={!editable} onChange={(e) => setContactEmail(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={contactPhone} disabled={!editable} onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
      </div>
      {editable ? (
        <div className="mt-3">
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-slate-550">Only your company&apos;s main account can change these.</p>
      )}
    </Card>
  );
}
