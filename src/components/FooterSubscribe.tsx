"use client";

import { useId } from "react";
import { Check, Loader2 } from "lucide-react";

import { useSubscribe } from "@/lib/subscribe";

/**
 * The newsletter pill in the footer.
 *
 * It used to be a bare `<form>` in a server component with no action, no method
 * and no handler, which meant pressing Subscribe did a GET to whatever page the
 * reader was on with `?email=` appended. Nothing was stored and nothing was
 * said, and the address went into their browser history, into the access log,
 * and into the Referer header of every request the page made afterwards. A form
 * that silently does nothing is a bug; one that leaks the address while doing
 * nothing is a different and worse thing.
 *
 * The intake it should always have been posting to already existed and was
 * already being used correctly by the banner under a blog post. This is the
 * same call through `useSubscribe`, wearing the footer's clothes.
 */
/** One spelling, worn twice: as a real label over the field, as a heading without it. */
const LABEL_TEXT = "Sign Up To Our Newsletter";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-[0.18em] text-white/60";

export default function FooterSubscribe() {
  const fieldId = useId();
  const { status, problem, submit } = useSubscribe("footer");

  if (status === "done") {
    return (
      <div>
        {/* A span, not a label: there is no field left for it to point at. */}
        <span className={LABEL_CLASS}>{LABEL_TEXT}</span>
        <p
          role="status"
          className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-white/70 lg:justify-end"
        >
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-wine-500"
            strokeWidth={2.5}
            aria-hidden="true"
          />
          You are on the list. Every message carries an unsubscribe link.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={fieldId} className={LABEL_CLASS}>
        {LABEL_TEXT}
      </label>
      <div className="mt-3 flex items-center gap-1 rounded-full border border-white/20 bg-white/5 p-1.5 lg:ml-auto lg:w-full lg:max-w-sm">
        <input
          id={fieldId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          disabled={status === "sending"}
          placeholder="Your email address"
          aria-describedby={problem ? `${fieldId}-problem` : undefined}
          aria-invalid={status === "error" || undefined}
          className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-wine-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-wine-700 disabled:bg-wine-600/60"
        >
          {status === "sending" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Subscribing
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </div>

      {/* Hidden from people and from assistive technology, visible to a bot.
          Same name and contract as the contact form's and the post banner's. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${fieldId}-website`}>Leave this empty</label>
        <input
          id={`${fieldId}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {problem && (
        /* Assertive: the reader pressed a button and is waiting on an answer. */
        <p id={`${fieldId}-problem`} role="alert" className="mt-2 text-xs text-red-300 lg:text-right">
          {problem}
        </p>
      )}
    </form>
  );
}
