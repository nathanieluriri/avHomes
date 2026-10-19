"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  MARKETER_EXPORT_FIELDS,
  MARKETER_EXPORT_FIELD_INFO,
  type MarketerExportField,
  type MarketingSettings,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { BottomSheet } from "./BottomSheet";
import { Button, ErrorNote, Switch } from "./ui";

/** Every partner as a zip of a styled workbook and a CSV, in the columns the admin ticks. */
export function ExportMarketers() {
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<MarketerExportField[] | null>(null);
  const [picked, setPicked] = useState<Set<MarketerExportField>>(new Set());
  const [fullNumbers, setFullNumbers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function show() {
    setOpen(true);
    setError(null);
    try {
      const res = await api.get<{ settings: MarketingSettings }>("/admin/marketing/settings");
      const exportable = MARKETER_EXPORT_FIELDS.filter((f) => res.settings.exportableFields.includes(f));
      setAllowed(exportable);
      setPicked(new Set(exportable.filter((f) => res.settings.exportFields.includes(f))));
    } catch (err) {
      // An accountant may export but not read marketing settings. The server still drops disallowed fields.
      if (err instanceof ApiError && err.status === 403) {
        setAllowed([...MARKETER_EXPORT_FIELDS]);
        setPicked(new Set(MARKETER_EXPORT_FIELDS));
        return;
      }
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    }
  }

  function toggle(field: MarketerExportField) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/marketing/marketers/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: MARKETER_EXPORT_FIELDS.filter((f) => picked.has(f)),
          fullAccountNumbers: fullNumbers,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "upstream_failed" }));
        throw new ApiError(res.status, body);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/u.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "av-partners.zip";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="flex gap-2">
      <Button onClick={() => void run()} disabled={busy || picked.size === 0}>
        {busy ? "Preparing" : "Download zip"}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );

  return (
    <>
      <Button variant="ghost" onClick={() => void show()}>
        <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Export
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Export partners"
        description="A zip with a spreadsheet and a CSV of every partner. Your choice of fields is remembered."
        footer={footer}
      >
        {allowed === null ? (
          !error && <div className="h-40 animate-pulse rounded-lg bg-mist-100" aria-label="Loading fields" />
        ) : allowed.length === 0 ? (
          <p className="text-[12px] text-slate-600">No fields may be exported. Turn some on under Commission settings.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 text-[12px] font-semibold text-wine-700">
              <button type="button" onClick={() => setPicked(new Set(allowed))}>
                Select all
              </button>
              <button type="button" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {allowed.map((field) => (
                <label key={field} className="flex items-center gap-2 text-[13px] text-plum-950">
                  <input type="checkbox" checked={picked.has(field)} onChange={() => toggle(field)} />
                  {MARKETER_EXPORT_FIELD_INFO[field].label}
                </label>
              ))}
            </div>
            {picked.has("accountNumber") && (
              <Switch
                checked={fullNumbers}
                onChange={setFullNumbers}
                label="Show full account numbers"
                description="Off, only the last four digits are shown."
              />
            )}
          </div>
        )}
        {error && (
          <div className="mt-3">
            <ErrorNote error={error} />
          </div>
        )}
      </BottomSheet>
    </>
  );
}
