"use client";

import { GraduationCap } from "lucide-react";
import type { Training } from "@avhomes/contracts";
import { dateTime } from "@/lib/admin/format";
import { ErrorNote, Field, Switch, inputClass } from "@/components/admin/ui";
import { FileAction, ToolsHeader, newToolId } from "@/components/admin/tools/ToolsTabs";
import { ToolListEditor, ToolsLoading, useTools } from "@/components/admin/tools/ToolList";
import { UrlField } from "@/components/admin/tools/UrlField";

/** A timestamp as the value a datetime-local input wants, in the reader's own time zone. */
function toLocalInput(at: number | null): string {
  if (at === null) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TrainingsPage() {
  const { data, error, reload, setData } = useTools();
  return (
    <>
      <ToolsHeader subtitle="Recorded lessons partners watch any time, and live sessions they join." />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <ToolsLoading />}
      {data && (
        <ToolListEditor
          list="trainings"
          noun="Training"
          icon={GraduationCap}
          tools={data}
          onSaved={setData}
          title={(t) => t.title}
          meta={(t) =>
            [t.liveAt ? `Live ${dateTime(t.liveAt)}` : "Watch any time", t.minutes ? `${t.minutes} min` : "", t.summary]
              .filter(Boolean)
              .join(" · ")
          }
          extra={(t) => <FileAction url={t.url} name={t.title} />}
          blank={(): Training => ({ id: newToolId("training"), title: "", summary: "", url: "", minutes: 0, liveAt: null, hidden: false })}
          ready={(t) => t.title.trim() !== "" && t.url.trim() !== ""}
          emptyHint="Add a recorded lesson, or a live session with its joining link."
          form={(t, set) => (
            <>
              <Field label="Title">
                <input className={inputClass} maxLength={140} value={t.title} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="What partners learn" hint="Optional.">
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  maxLength={400}
                  value={t.summary}
                  onChange={(e) => set({ summary: e.target.value })}
                />
              </Field>
              <UrlField
                label="Video or joining link"
                hint="A recording, or the Zoom or Google Meet link for a live session."
                value={t.url}
                onChange={(url) => set({ url })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How long, in minutes">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={600}
                    inputMode="numeric"
                    value={t.minutes || ""}
                    onChange={(e) => set({ minutes: Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0))) })}
                  />
                </Field>
                <Field label="Live session starts" hint="Leave empty for a recording.">
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={toLocalInput(t.liveAt)}
                    onChange={(e) => set({ liveAt: e.target.value ? new Date(e.target.value).getTime() : null })}
                  />
                </Field>
              </div>
              <Switch checked={!t.hidden} onChange={(shown) => set({ hidden: !shown })} label="Show to partners" />
            </>
          )}
        />
      )}
    </>
  );
}
