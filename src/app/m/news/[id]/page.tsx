"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NewsArticle } from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import { ErrorNote, Skeleton } from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { whenLabel } from "@/lib/marketer/api";

/**
 * A newsletter, read inside the app.
 *
 * The email itself, drawn in a frame: the letter was written for a white page
 * and its own styles, and restyling it for the dark screen would change what
 * the office signed off. The frame grows to the letter's height, so the screen
 * scrolls as one page rather than a page with a scrolling box in it.
 */
export default function NewsPage() {
  const { id } = useParams<{ id: string }>();
  const read = useAsync((signal) => api.get<NewsArticle>(`/marketing/news/${id}`, signal), [id]);
  const article = read.data;

  return (
    <AppShell
      title={article?.subject ?? "Newsletter"}
      hint={article ? `Sent ${whenLabel(article.sentAt).toLowerCase()}` : undefined}
      back="/m/alerts"
    >
      <div className="px-4 pt-5">
        {read.error && <ErrorNote error={read.error} onRetry={read.reload} />}
        {!article && read.loading && (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" radius="18px" />
            <Skeleton className="h-64 w-full" radius="18px" />
          </div>
        )}
        {article && <LetterFrame html={article.html} />}
      </div>
    </AppShell>
  );
}

/** Links open in the browser, never inside the frame, and nothing in it may run. */
function framed(html: string): string {
  const base = '<base target="_blank">';
  return /<head\b[^>]*>/iu.test(html) ? html.replace(/<head\b[^>]*>/iu, (tag) => `${tag}${base}`) : `${base}${html}`;
}

function LetterFrame({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const doc = node.contentDocument;
      const root = doc?.documentElement;
      if (!root) return;
      setHeight(Math.max(120, Math.ceil(root.scrollHeight)));
      if (!observer && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(root);
        if (doc.body) observer.observe(doc.body);
      }
    };
    node.addEventListener("load", measure);
    measure();
    return () => {
      node.removeEventListener("load", measure);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={frame}
      title="Newsletter"
      srcDoc={framed(html)}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ height }}
      className="block w-full rounded-[18px] bg-white"
    />
  );
}
