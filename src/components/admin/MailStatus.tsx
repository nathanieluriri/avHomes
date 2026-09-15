"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { MailWarning } from "lucide-react";
import { api } from "@/lib/admin/client";

interface MailStatus {
  configured: boolean;
  hint: string | null;
}

export const MAIL_OFF_REASON = "Email is not set up yet, so nothing can be sent.";

// One request per page load, shared by every banner and button on the screen.
let cached: Promise<MailStatus> | null = null;

function fetchStatus(): Promise<MailStatus> {
  cached ??= api.get<MailStatus>("/admin/mail-status").catch(() => {
    cached = null;
    // Unknown is treated as working, so a flaky request never locks the send buttons.
    return { configured: true, hint: null };
  });
  return cached;
}

/** Null while loading, then whether mail can be sent. */
export function useMailConfigured(): MailStatus | null {
  const [status, setStatus] = useState<MailStatus | null>(null);
  useEffect(() => {
    let live = true;
    void fetchStatus().then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return status;
}

/** The alert at the top of every screen that sends email. Renders nothing when mail works. */
export function MailNotConfiguredAlert() {
  const status = useMailConfigured();
  if (!status || status.configured) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="text-sm text-amber-900">
        <p className="font-semibold">Email is not set up, so sending is turned off</p>
        <p className="mt-0.5 text-[13px] text-amber-900/90">
          You can still write and preview. {status.hint ?? "Ask the developer to configure the mail provider."}
        </p>
      </div>
    </div>
  );
}

/**
 * Wraps a send control. When mail is off the control is disabled and hovering or
 * focusing the wrapper says why: a disabled button fires no pointer events of its
 * own, so the explanation has to live on something that does.
 */
export function MailGate({
  children,
  className = "",
}: {
  children: (disabled: boolean) => ReactNode;
  className?: string;
}) {
  const status = useMailConfigured();
  const tipId = useId();
  const off = status !== null && !status.configured;
  const [show, setShow] = useState(false);

  if (!off) return <>{children(false)}</>;
  return (
    <span
      className={`relative inline-flex ${className}`}
      tabIndex={0}
      aria-describedby={tipId}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span className="pointer-events-none contents">{children(true)}</span>
      <span
        id={tipId}
        role="tooltip"
        className={`absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg bg-plum-950 px-2.5 py-1.5 text-center text-[12px] font-medium leading-snug text-white shadow-pop transition-opacity ${
          show ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {MAIL_OFF_REASON}
      </span>
    </span>
  );
}
