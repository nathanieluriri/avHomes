"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface MailToastState {
  /** A new id restarts the timer, even for the same words. */
  id: number;
  text: string;
  actions?: { label: string; onClick: () => void }[];
  /** Stays until replaced, for "Sending" while its undo window is open. */
  sticky?: boolean;
}

/** Gmail's snackbar: bottom centre on a desk, clear of the console nav and the compose windows; above the compose button on a phone. */
export function MailToast({
  toast,
  phone,
  onDismiss,
}: {
  toast: MailToastState | null;
  phone: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast || toast.sticky) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="console console-float">
      <div
        role="status"
        aria-live="polite"
        className={`fixed z-[80] ${
          phone ? "inset-x-3 bottom-[calc(5.5rem+var(--safe-b))]" : "bottom-6 left-1/2 w-max max-w-[min(32rem,calc(100vw-3rem))] -translate-x-1/2"
        }`}
      >
        {toast && (
          <div
            key={toast.id}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-plum-950 py-1.5 pl-4 pr-1.5 text-[13.5px] text-white shadow-pop animate-in fade-in-0 slide-in-from-bottom-2"
          >
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.actions?.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="c-tap h-9 shrink-0 rounded-lg px-3 text-[13px] font-semibold text-wine-300 hover:bg-white/10"
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className="c-tap grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
