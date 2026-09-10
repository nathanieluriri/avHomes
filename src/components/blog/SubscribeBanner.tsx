"use client";

import { useId } from "react";
import { Check, Loader2, Mail } from "lucide-react";

import { SITE_NAME } from "@/lib/blog/config";
import { useSubscribe } from "@/lib/subscribe";

/**
 * The ask at the foot of a post.
 *
 * Placed here rather than over the article, because the reader who has just
 * finished reading is the one worth asking and the reader who has just arrived
 * is the one a dialog drives away. It is also why this is a banner in the flow
 * and not a modal: nothing here is worth taking the page away from someone.
 *
 * The fetch itself lives in `useSubscribe`, shared with the footer's pill, so
 * the endpoint and the error sentences have one spelling.
 */
export default function SubscribeBanner({
  /** The post's slug, stored so an operator can see which writing earns readers. */
  source,
}: {
  source?: string;
}) {
  const fieldId = useId();
  const { status, problem, submit } = useSubscribe(source);

  return (
    <aside className="sub" aria-labelledby={`${fieldId}-title`}>
      <span className="sub__mark" aria-hidden="true">
        {status === "done" ? <Check size={20} strokeWidth={2.5} /> : <Mail size={20} />}
      </span>

      <div className="sub__copy">
        <h2 className="sub__title" id={`${fieldId}-title`}>
          {status === "done" ? "You are on the list" : "Get the next one by email"}
        </h2>
        <p className="sub__body">
          {status === "done"
            ? `The next post from ${SITE_NAME} lands in your inbox. No other mail, and every message carries an unsubscribe link.`
            : `New listings, market notes and buying guides from ${SITE_NAME}. One email when there is something worth reading, and never more than that.`}
        </p>
      </div>

      {status !== "done" && (
        <form className="sub__form" onSubmit={submit} noValidate>
          <label className="sub__label" htmlFor={fieldId}>
            Email address
          </label>
          <div className="sub__row">
            <input
              id={fieldId}
              className="sub__input"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              disabled={status === "sending"}
              aria-describedby={problem ? `${fieldId}-problem` : undefined}
              aria-invalid={status === "error" || undefined}
            />
            <button className="sub__submit" type="submit" disabled={status === "sending"}>
              {status === "sending" ? (
                <>
                  <Loader2 className="sub__spin" size={16} aria-hidden="true" />
                  Subscribing
                </>
              ) : (
                "Subscribe"
              )}
            </button>
          </div>

          {/*
            The honeypot. Hidden from people by the stylesheet and from screen
            readers by aria-hidden, and left out of the tab order, so the only
            thing that ever fills it is something reading the markup.
          */}
          <input
            className="sub__trap"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          {/* Assertive: the reader pressed a button and is waiting on an answer. */}
          <p className="sub__problem" id={`${fieldId}-problem`} role="alert">
            {problem}
          </p>
        </form>
      )}
    </aside>
  );
}
