"use client";

import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/admin/client";

/**
 * The admin's small component set.
 *
 * Deliberately small: five primitives that every screen composes, rather than a
 * component per screen. The one that earns the most is `ErrorNote`, because the
 * whole point of the server's error table is lost if the client renders every
 * failure as the word "Error".
 */

/**
 * Renders a failure the way the error table intended.
 *
 * The sentence, then the named refusal code, then per-field issues, then a
 * copyable diagnostic carrying the requestId. An operator reporting a problem
 * can paste one line that ties their screen to a server log entry.
 */
export function ErrorNote({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const b = error.body;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">{error.message}</p>

      {b.issues && b.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-red-800">
          {b.issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>
              <code className="font-mono text-xs">{issue.path}</code>: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {b.hint && <p className="mt-2 text-red-800">{b.hint}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono">
          {error.status} {b.error}
        </span>
        {b.requestId && (
          <button
            type="button"
            className="font-mono text-red-700 underline underline-offset-2"
            onClick={() => {
              void navigator.clipboard.writeText(error.diagnostic);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "copied" : `requestId ${b.requestId.slice(0, 8)}`}
          </button>
        )}
        {onRetry && (
          <button type="button" className="text-red-700 underline underline-offset-2" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>

      {b.debug && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-red-700">
            {b.debug.name} at {b.debug.at}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-100 p-2 text-[11px] leading-relaxed">
            {b.debug.message}
            {"\n"}
            {b.debug.stack.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-mist-200 bg-white p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-navy-950 text-white hover:bg-navy-900 disabled:bg-mist-300",
  ghost: "border border-mist-200 bg-white text-navy-950 hover:bg-mist-50 disabled:text-mist-300",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300",
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-mist-200 bg-white px-3 py-2 text-sm text-navy-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "blue" | "red" }) {
  const tones = {
    neutral: "bg-mist-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  } as const;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-mist-300 p-10 text-center">
      <p className="font-semibold text-navy-950">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist-300 border-t-navy-950" />
      Loading
    </div>
  );
}
