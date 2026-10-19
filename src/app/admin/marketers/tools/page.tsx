"use client";

import { BookOpen } from "lucide-react";
import { GUIDE_KINDS, GUIDE_KIND_LABELS, type Guide } from "@avhomes/contracts";
import { ErrorNote, Field, Switch, inputClass } from "@/components/admin/ui";
import { FileAction, ToolsHeader, newToolId } from "@/components/admin/tools/ToolsTabs";
import { ToolListEditor, ToolsLoading, useTools } from "@/components/admin/tools/ToolList";
import { UrlField } from "@/components/admin/tools/UrlField";

export default function GuidesPage() {
  const { data, error, reload, setData } = useTools();
  return (
    <>
      <ToolsHeader subtitle="Guides, trainings and merch for partners, as the partner app shows them." />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <ToolsLoading />}
      {data && (
        <ToolListEditor
          list="guides"
          noun="Guide"
          icon={BookOpen}
          tools={data}
          onSaved={setData}
          title={(g) => g.title}
          meta={(g) => `${GUIDE_KIND_LABELS[g.kind]}${g.summary ? ` · ${g.summary}` : ""}`}
          extra={(g) => (g.kind === "file" || g.kind === "video" ? <FileAction url={g.url} name={g.title} /> : null)}
          blank={(): Guide => ({ id: newToolId("guide"), kind: "article", title: "", summary: "", body: "", url: "", hidden: false })}
          ready={(g) => g.title.trim() !== "" && (g.kind === "article" ? g.body.trim() !== "" : g.url.trim() !== "")}
          emptyHint="Write an article, or add a link, a file or a video partners can learn from."
          form={(g, set) => (
            <>
              <Field label="What kind of guide" as="group">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What kind of guide">
                  {GUIDE_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={g.kind === kind}
                      onClick={() => set({ kind })}
                      className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${
                        g.kind === kind ? "bg-wine-600 text-white" : "bg-mist-100 text-plum-950 hover:bg-mist-200"
                      }`}
                    >
                      {GUIDE_KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Title">
                <input className={inputClass} maxLength={140} value={g.title} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="One line on what it is for" hint="Optional. Shown under the title.">
                <input className={inputClass} maxLength={400} value={g.summary} onChange={(e) => set({ summary: e.target.value })} />
              </Field>
              {g.kind === "article" ? (
                <Field label="The article" hint="Leave a blank line between paragraphs.">
                  <textarea
                    className={`${inputClass} resize-y`}
                    rows={10}
                    maxLength={20000}
                    value={g.body}
                    onChange={(e) => set({ body: e.target.value })}
                  />
                </Field>
              ) : (
                <UrlField
                  label={g.kind === "link" ? "Link" : g.kind === "video" ? "Video link" : "File link"}
                  hint={
                    g.kind === "link"
                      ? "Any web page, such as a blog post or a YouTube video."
                      : "Uploaded files can be downloaded from the partner app and from here."
                  }
                  value={g.url}
                  onChange={(url) => set({ url })}
                  upload={g.kind !== "link"}
                />
              )}
              <Switch checked={!g.hidden} onChange={(shown) => set({ hidden: !shown })} label="Show to partners" />
            </>
          )}
        />
      )}
    </>
  );
}
