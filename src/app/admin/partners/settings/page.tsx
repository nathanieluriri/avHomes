"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  PARTNER_LIMIT_HINT,
  PARTNER_LIMIT_KEYS,
  PARTNER_LIMIT_LABEL,
  type PartnerLimitKey,
  type PartnerSettings,
} from "@avhomes/contracts";
import { api, type ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { toApiError } from "@/lib/admin/marketing";
import { Button, Card, ErrorNote, Field, PageHeader, Skeleton, inputClass } from "@/components/admin/ui";

/** The limits a partner starts with, until AV Homes gives it its own. */
export default function PartnerSettingsPage() {
  const state = useAsync((signal) => api.get<{ settings: PartnerSettings }>("/admin/partner-settings", signal), []);
  if (state.error && !state.data) return <ErrorNote error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Skeleton className="h-48" />;
  return <Form settings={state.data.settings} />;
}

function Form({ settings }: { settings: PartnerSettings }) {
  const [draft, setDraft] = useState<Record<PartnerLimitKey, string>>({
    review: String(settings.limits.review),
    live: String(settings.limits.live),
    staff: String(settings.limits.staff),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch("/admin/partner-settings", {
        limits: { review: Number(draft.review), live: Number(draft.live), staff: Number(draft.staff) },
      });
      setSaved(true);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        icon={SlidersHorizontal}
        title="Partner settings"
        backTo="/admin/partners"
        backLabel="Partners"
        subtitle="Every partner starts with these. A partner's own page can set its own."
      />
      <Card>
        {error && (
          <div className="mb-3">
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
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value.replace(/[^0-9]/g, "") })}
              />
            </Field>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button disabled={busy || PARTNER_LIMIT_KEYS.some((key) => draft[key] === "")} onClick={() => void save()}>
            {busy ? "Saving..." : "Save"}
          </Button>
          {saved && <span className="text-[12px] text-slate-600">Saved.</span>}
        </div>
      </Card>
    </>
  );
}
