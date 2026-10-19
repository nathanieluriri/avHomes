"use client";

import { Download } from "lucide-react";
import { downloadLink, type TutorialId } from "@avhomes/contracts";
import { TUTORIAL_MEDIA } from "@/lib/admin/tutorial-steps";
import { TUTORIALS } from "@/lib/admin/tutorials";
import { HELP_TOPICS } from "@/lib/marketer/help";
import { Button, Card, CardHead } from "@/components/admin/ui";

interface Clip {
  id: TutorialId;
  title: string;
  app: string;
  href: string;
  filename: string;
}

function clips(): Clip[] {
  const titles = new Map<TutorialId, { title: string; app: string }>();
  for (const t of TUTORIALS) titles.set(t.id, { title: t.title, app: "Console" });
  for (const t of HELP_TOPICS) if (!titles.has(t.id)) titles.set(t.id, { title: t.title, app: "Partner app" });
  const out: Clip[] = [];
  for (const [id, media] of Object.entries(TUTORIAL_MEDIA) as [TutorialId, { video: string }][]) {
    const named = titles.get(id) ?? { title: id, app: "Console" };
    const link = downloadLink(media.video, `AV Homes - ${named.title}`);
    if (link) out.push({ id, ...named, ...link });
  }
  return out.sort((a, b) => a.app.localeCompare(b.app) || a.title.localeCompare(b.title));
}

export function tutorialDownload(video: string, title: string) {
  return downloadLink(video, `AV Homes - ${title}`);
}

/** Every rendered tutorial, console and partner app alike, ready to save and post to YouTube. */
export function VideoDownloads() {
  const all = clips();

  /* One click per file, a beat apart: browsers ask once to allow several downloads and drop a burst. */
  function downloadAll() {
    all.forEach((clip, index) => {
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = clip.href;
        a.download = clip.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, index * 700);
    });
  }

  return (
    <Card className="mt-6">
      <CardHead
        title="Every video, to post on YouTube"
        action={
          <Button size="sm" variant="ghost" onClick={downloadAll}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Download all {all.length}
          </Button>
        }
      />
      <p className="-mt-1 mb-3 text-[13px] text-slate-600">
        The console&apos;s tutorials and the partner app&apos;s help videos, as MP4 files. Your browser may ask once to allow
        several downloads.
      </p>
      <ul className="divide-y divide-mist-100">
        {all.map((clip) => (
          <li key={clip.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-plum-950">{clip.title}</span>
              <span className="block text-[12px] text-slate-500">{clip.app}</span>
            </span>
            <a
              href={clip.href}
              download={clip.filename}
              className="c-tap inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-wine-700 hover:bg-wine-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span aria-hidden="true">Download</span>
              <span className="sr-only">{`Download ${clip.title}`}</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
