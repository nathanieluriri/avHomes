"use client";

import { useState } from "react";
import { formatBytes, type MediaUsage } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useSession } from "@/lib/admin/hooks";
import { Button, Card, ErrorNote, inputClass } from "./ui";

const GB = 1024 * 1024 * 1024;

/** How much of the upload allowance is used, and the owner's way to ask for more. */
export function StorageQuota({ refreshKey = 0 }: { refreshKey?: number }) {
  const { session } = useSession();
  const role = session.status === "signed-in" ? session.user.role : null;
  const { data, error, reload } = useAsync<{ usage: MediaUsage }>(
    (signal) => api.get<{ usage: MediaUsage }>("/admin/images/quota", signal),
    [refreshKey],
    { keepPrevious: true },
  );
  const [asking, setAsking] = useState(false);
  const [sizeGb, setSizeGb] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return null;
  const { usage } = data;
  const share = usage.limitBytes > 0 ? Math.min(1, usage.usedBytes / usage.limitBytes) : 1;
  const tone = share >= 0.9 ? "bg-red-600" : share >= 0.75 ? "bg-amber-500" : "bg-wine-600";

  async function submit() {
    const requestedBytes = Math.round(Number(sizeGb) * GB);
    if (!Number.isFinite(requestedBytes) || requestedBytes <= usage.limitBytes) {
      setActionError(
        new ApiError(400, { error: "bad_request", detail: `Ask for more than the current ${formatBytes(usage.limitBytes)}.` }),
      );
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.post("/admin/images/quota/requests", { requestedBytes, message });
      setAsking(false);
      setMessage("");
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-plum-950">Storage</p>
          <p className="text-[13px] text-slate-600">
            {formatBytes(usage.usedBytes)} of {formatBytes(usage.limitBytes)} used · {usage.fileCount} files
          </p>
        </div>
        {role === "owner" && !usage.pendingRequest && !asking && (
          <Button variant="ghost" onClick={() => setAsking(true)}>
            Request more space
          </Button>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist-100" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${share * 100}%` }} />
      </div>

      {usage.pendingRequest && (
        <p className="mt-3 text-[13px] text-slate-600">
          {usage.pendingRequest.requestedByName} asked for {formatBytes(usage.pendingRequest.requestedBytes)}. Waiting
          for the developer.
        </p>
      )}

      {asking && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-[13px] font-medium text-plum-950">
            New limit in GB
            <input
              type="number"
              min={1}
              step={1}
              value={sizeGb}
              onChange={(e) => setSizeGb(e.target.value)}
              placeholder={String(Math.ceil(usage.limitBytes / GB) * 2)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-[13px] font-medium text-plum-950">
            Note for the developer (optional)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={2}
              className={`${inputClass} mt-1`}
            />
          </label>
          {actionError && <ErrorNote error={actionError} />}
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={busy || sizeGb === ""}>
              {busy ? "Sending" : "Send request"}
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
