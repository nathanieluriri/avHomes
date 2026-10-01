"use client";

import { useState } from "react";
import { OFF_MARKET_LABELS, OFF_MARKET_REASONS, type OffMarketReason, type Property } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet } from "../BottomSheet";
import { Button, ErrorNote, Field, inputClass } from "../ui";

/** Archives a listing with the reason it is no longer available, so the record says why. */
export function OffMarketSheet({
  open,
  onOpenChange,
  property,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Pick<Property, "id" | "title">;
  onDone: (property: Property) => void;
}) {
  const [reason, setReason] = useState<OffMarketReason>("elsewhere");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function reset() {
    setReason("elsewhere");
    setNote("");
    setError(null);
  }

  function change(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ property: Property }>(`/admin/properties/${property.id}/archive`, {
        offMarket: { reason, note: note.trim() },
      });
      reset();
      onDone(res.property);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={change}
      title="Take off the market"
      description={property.title}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => change(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Take it off the market
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-slate-600">
          It comes off the site and is kept on record with the reason below. If we sold or let it ourselves, cancel
          and use Record the sale instead, so the money and the commission are recorded too.
        </p>
        <Field label="Why is it no longer available?">
          <select
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value as OffMarketReason)}
          >
            {OFF_MARKET_REASONS.map((r) => (
              <option key={r} value={r}>
                {OFF_MARKET_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note" hint="Optional. Who sold it, when, or anything worth remembering.">
          <textarea
            className={`${inputClass} min-h-20`}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && <ErrorNote error={error} />}
      </div>
    </BottomSheet>
  );
}
