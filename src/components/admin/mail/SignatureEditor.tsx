"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  customSignature,
  signatureHtmlToText,
  textToEmailHtml,
  type RenderedSignature,
  type SignaturePrefs,
} from "@avhomes/contracts";
import { Button } from "@/components/admin/ui";
import { ModeSwitch } from "./Composer";
import { type Segment, useFormatSwitch } from "./formatSwitch";

/**
 * Pick the standard signature or write your own, with the composer's Write,
 * HTML and Preview switch. Used for a member's own signature on Profile and
 * for the team's in Settings.
 */

/** The signature as a mail client draws it: white ground, the client's own sans. */
export function SignaturePreview({ html, title }: { html: string; title: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:4px 16px 16px;background:#ffffff;font-family:Arial,Helvetica,sans-serif">${html}</body></html>`;
  const [height, setHeight] = useState(184);
  return (
    // No scripts or forms. Same origin only so the frame can be sized to what it holds.
    <iframe
      title={title}
      srcDoc={doc}
      sandbox="allow-same-origin"
      style={{ height }}
      onLoad={(event) => {
        const inner = event.currentTarget.contentDocument?.documentElement.scrollHeight;
        if (inner) setHeight(Math.min(Math.max(inner, 96), 640));
      }}
      className="block w-full rounded-xl border border-mist-200 bg-white"
    />
  );
}

export function SignatureEditor({
  value,
  onChange,
  standard,
  standardLabel,
  standardBlurb,
  name,
}: {
  value: SignaturePrefs;
  onChange: (next: SignaturePrefs) => void;
  /** The standard signature as it renders right now. */
  standard: RenderedSignature;
  standardLabel: string;
  standardBlurb: string;
  /** Radio group name, unique per page. */
  name: string;
}) {
  const custom = value.mode === "custom";
  const shown = custom ? customSignature(value).html || standard.html : standard.html;
  // One body field: in HTML it holds the HTML, and the text it came from is remembered by the switch.
  const format = useFormatSwitch({
    format: value.format,
    text: value.format === "text" ? value.body : "",
    html: value.format === "html" ? value.body : "",
    initial: value.format === "html" ? "html" : "write",
    toHtml: (text) => (text.trim() === "" ? "" : textToEmailHtml(text)),
    toText: signatureHtmlToText,
    unedited: (_, html) => html.trim() === "",
    onChange: (next) =>
      onChange({ ...value, format: next.format, body: (next.format === "html" ? next.html : next.text) ?? "" }),
  });
  const segment: Segment = format.segment;
  const pick = format.pick;

  const choices = [
    { mode: "default" as const, label: standardLabel, blurb: standardBlurb },
    {
      mode: "custom" as const,
      label: "Custom",
      blurb: "Write your own. It replaces the standard one on every email, and is not updated when details change.",
    },
  ];

  return (
    <div className="space-y-3">
      <SignaturePreview html={shown} title="Signature preview" />

      <div className="space-y-2" role="radiogroup" aria-label="Which signature">
        {choices.map((choice) => (
          <label
            key={choice.mode}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
              value.mode === choice.mode ? "border-wine-500 bg-wine-50/50" : "border-mist-200 hover:bg-mist-50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={choice.mode}
              checked={value.mode === choice.mode}
              onChange={() => onChange({ ...value, mode: choice.mode })}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-plum-950">{choice.label}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-600">{choice.blurb}</span>
            </span>
          </label>
        ))}
      </div>

      {custom && (
        <div className="overflow-hidden rounded-xl border border-mist-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-mist-100 bg-white px-2.5 py-2">
            <ModeSwitch value={segment} onPick={pick} label="Signature format" />
            {value.body.trim() === "" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  format.reset("html");
                  onChange({ ...value, format: "html", body: standard.html.replace(/<!--[\s\S]*?-->\s*/u, "") });
                }}
              >
                Start from the standard one
              </Button>
            )}
          </div>
          {format.asking && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-950"
            >
              <p className="flex min-w-0 flex-1 items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                You edited the HTML. Plain text keeps the words and links, not the formatting.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={format.cancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={format.convert}>
                  Convert to plain text
                </Button>
              </div>
            </div>
          )}
          {segment === "preview" ? (
            <div className="bg-mist-50/60 p-2">
              {value.body.trim() === "" ? (
                <p className="p-6 text-center text-[13px] text-slate-600">
                  Nothing to preview yet. Write your signature under Write or HTML.
                </p>
              ) : (
                <SignaturePreview html={customSignature(value).html} title="Custom signature preview" />
              )}
            </div>
          ) : (
            <textarea
              aria-label={segment === "html" ? "Signature HTML" : "Signature"}
              spellCheck={segment !== "html"}
              value={value.body}
              rows={segment === "html" ? 10 : 6}
              placeholder={
                segment === "html"
                  ? "Paste or write HTML. Scripts and forms are removed when you save."
                  : "Ada Obi\nSenior Property Consultant | AV Homes Ltd\n+234 803 000 0000"
              }
              onChange={(event) => onChange({ ...value, body: event.target.value })}
              className={`block w-full resize-y px-3 py-2.5 text-plum-950 outline-none placeholder:text-slate-550 ${
                segment === "html" ? "bg-mist-50/60 font-mono text-[12.5px] leading-relaxed" : "bg-transparent text-[13px] leading-relaxed"
              }`}
            />
          )}
        </div>
      )}

      {(custom || value.body !== "") && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              format.reset("write");
              onChange({ mode: "default", format: "text", body: "" });
            }}
          >
            Reset to default
          </Button>
        </div>
      )}
    </div>
  );
}
