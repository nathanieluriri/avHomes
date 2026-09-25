"use client";

import { useRef, useState } from "react";

export type Segment = "write" | "html" | "preview";
export type BodyFormat = "text" | "html";

/**
 * The Write, HTML and Preview switch, shared by the composer and the
 * signature editor.
 *
 * Preview is only a view: going into it or out of it never converts or asks.
 * Write to HTML converts the text and remembers both sides. HTML to Write is
 * silent while the HTML is still exactly what that conversion produced (or
 * what `unedited` recognises, for a draft restored with no memory of it), and
 * gives the text back as it was. Only HTML the member actually changed brings
 * up the choice, and that choice blocks nothing: Cancel leaves the body, the
 * format and the tab exactly as they were.
 */
export function useFormatSwitch({
  format,
  text,
  html,
  initial,
  toHtml,
  toText,
  unedited,
  onChange,
}: {
  format: BodyFormat;
  text: string;
  html: string;
  initial: Segment;
  toHtml: (text: string) => string;
  toText: (html: string) => string;
  /** Whether `html` is still the untouched conversion of `text`, with no switch remembered. */
  unedited?: (text: string, html: string) => boolean;
  onChange: (next: { format: BodyFormat; text?: string; html?: string }) => void;
}) {
  const [segment, setSegment] = useState<Segment>(initial);
  const [asking, setAsking] = useState(false);
  const origin = useRef<{ text: string; html: string } | null>(null);

  function pick(next: Segment) {
    setAsking(false);
    if (next === "preview") {
      setSegment("preview");
      return;
    }
    if (next === "html") {
      if (format === "text") {
        const made = toHtml(text);
        origin.current = { text, html: made };
        onChange({ format: "html", html: made });
      }
      setSegment("html");
      return;
    }
    if (format === "text") {
      setSegment("write");
      return;
    }
    const was = origin.current;
    if (was && was.html === html) {
      onChange({ format: "text", text: was.text });
      setSegment("write");
    } else if (!was && unedited?.(text, html)) {
      onChange({ format: "text", text });
      setSegment("write");
    } else {
      setAsking(true);
    }
  }

  /** The member chose plain text over their edited HTML. */
  function convert() {
    origin.current = null;
    setAsking(false);
    onChange({ format: "text", text: toText(html), html: "" });
    setSegment("write");
  }

  return {
    segment,
    pick,
    asking,
    cancel: () => setAsking(false),
    convert,
    /** For a body replaced wholesale (a template, a reset): nothing remembered applies to it. */
    reset(next: Segment) {
      origin.current = null;
      setAsking(false);
      setSegment(next);
    },
  };
}
