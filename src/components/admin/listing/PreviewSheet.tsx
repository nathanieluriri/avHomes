"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Smartphone, X } from "lucide-react";
import type { Property } from "@avhomes/contracts";
import { PREVIEW_PATH, isPreviewMessage, type PreviewMessage, type PreviewView } from "@/lib/preview";

type Device = "desktop" | "phone";

const PILL =
  "c-tap inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors sm:h-8";

/**
 * The listing as a visitor will meet it, in a sheet over the editor.
 *
 * The site itself runs in the frame, so hover, the gallery and every layout
 * breakpoint behave for real. The draft goes in by postMessage on every edit and
 * the frame keeps every click to itself. Portalled to the body, because the
 * console's page transition transforms an ancestor, and a transformed ancestor
 * turns `position: fixed` into "fixed to that ancestor".
 */
export function PreviewSheet({ property, onClose }: { property: Property; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<PreviewView>("grid");
  const [device, setDevice] = useState<Device>("desktop");
  const [shown, setShown] = useState(false);

  function send(message: PreviewMessage) {
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
  }

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (!isPreviewMessage(e.data)) return;
      if (e.data.type === "avhomes-preview:ready") setReady(true);
      if (e.data.type === "avhomes-preview:view") setView(e.data.view);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Every edit reaches the frame; the string compare keeps a re-render that changed nothing quiet.
  const json = JSON.stringify(property);
  useEffect(() => {
    if (ready) send({ type: "avhomes-preview:draft", property: JSON.parse(json) as Property });
  }, [ready, json]);

  const closeOnEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  });
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement;
    closeRef.current?.focus();
    const frameId = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => closeOnEscape(e);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frameId);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  function go(next: PreviewView) {
    setView(next);
    send({ type: "avhomes-preview:view", view: next });
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Listing preview" className="fixed inset-0 z-[1000]">
      <button
        type="button"
        aria-label="Close the preview"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 bg-plum-950/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 top-3 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] sm:top-5 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-mist-200 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-plum-950">Preview</p>
            <p className="text-xs text-slate-600">Includes unsaved changes. Nothing here is public.</p>
          </div>

          <div role="group" aria-label="Screen" className="inline-flex rounded-lg bg-mist-100 p-0.5">
            {(
              [
                ["grid", "Listings grid"],
                ["detail", "Listing page"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => go(value)}
                className={`${PILL} ${view === value ? "bg-white text-plum-950 shadow-card" : "text-slate-600 hover:text-plum-950"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Screen width" className="inline-flex rounded-lg bg-mist-100 p-0.5">
            {(
              [
                ["desktop", "Desktop", Monitor],
                ["phone", "Phone", Smartphone],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={device === value}
                aria-label={label}
                title={label}
                onClick={() => setDevice(value)}
                className={`${PILL} ${device === value ? "bg-white text-plum-950 shadow-card" : "text-slate-600 hover:text-plum-950"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="c-tap inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 sm:h-8 sm:w-8"
            aria-label="Close the preview"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 justify-center bg-mist-100">
          <iframe
            ref={frame}
            src={PREVIEW_PATH}
            title="Listing preview"
            className={`h-full bg-white transition-[width] duration-300 ${
              device === "phone" ? "my-4 h-[calc(100%-2rem)] w-[390px] rounded-2xl border border-mist-200 shadow-card" : "w-full"
            }`}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
