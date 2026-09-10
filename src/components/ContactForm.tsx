"use client";

import { useState } from "react";

const fieldClass =
  "mt-2 w-full rounded-xl border border-mist-200 bg-white px-4 py-3 text-sm text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600";
const labelClass = "block text-sm font-semibold text-plum-950";

const SUBJECTS = [
  { value: "general", label: "General enquiry" },
  { value: "viewing", label: "Book a viewing" },
  { value: "sell", label: "Sell my property" },
  { value: "rent", label: "Rent out my property" },
  { value: "partnership", label: "Partnership" },
] as const;

/**
 * The contact form, wired to POST /api/enquiries.
 *
 * That route is a PUBLIC MUTATION: it sits below the origin guard (so a
 * cross-origin post cannot drive it) and deliberately outside the cacheable
 * `/api/public/*` router, because a write inside a router whose responses a
 * shared cache may store is the confusion that split exists to prevent.
 *
 * The `website` field is a honeypot. It is hidden from people and from screen
 * readers; a bot that fills every input it finds gets a normal success response
 * and nothing is stored. Refusing loudly would only teach the next attempt.
 */
export default function ContactForm({
  propertyId,
  propertySlug,
  contactEmail = "",
}: {
  propertyId?: string;
  propertySlug?: string;
  /** Empty drops the "you can also email" line rather than printing a fake. */
  contactEmail?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    setError(null);

    /* The LABEL, not the stored value. This put "[viewing]" at the head of
       the message an operator reads, where "[Book a viewing]" was meant. */
    const subjectValue = String(form.get("subject") ?? "general");
    const subject =
      SUBJECTS.find((s) => s.value === subjectValue)?.label ?? subjectValue;
    const message = String(form.get("message") ?? "");

    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("fullName") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? "") || undefined,
          // The subject is a form concept, not an API field. Prefixing keeps it
          // in the one place an operator actually reads it.
          message: `[${subject}] ${message}`,
          website: String(form.get("website") ?? ""),
          ...(propertyId ? { propertyId } : {}),
          ...(propertySlug ? { propertySlug } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          retryAfter?: number;
          requestId?: string;
        };

        /*
         * A VISITOR IS TOLD ONLY WHAT A VISITOR CAN ACT ON.
         *
         * The admin console renders the server's own `detail` and `hint`,
         * because an operator needs them. This form must not: a misconfigured
         * deployment answers 501 with "set MONGODB_URI to your Atlas connection
         * string", and printing that on a public page hands a stranger our
         * infrastructure. Only the two codes a visitor can do something about
         * get a specific sentence; everything else gets one honest fallback.
         *
         * The requestId still goes to the browser console, so an operator
         * looking over someone's shoulder can match it to a log line.
         */
        if (body.requestId) {
          console.warn(`[contact] ${res.status} ${body.error} requestId=${body.requestId}`);
        }
        setError(
          body.error === "rate_limited"
            ? `Too many messages from this connection. Try again in ${body.retryAfter ?? 60} seconds.`
            : body.error === "bad_request"
              ? "Please check the fields and try again."
              : "We could not send that right now. Please email us directly.",
        );
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("We could not reach the server. Please check your connection or email us directly.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-8 lg:p-10">
        <h2 className="text-lg font-bold tracking-tight text-plum-950">Message received</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Thank you. A member of the team will respond within one business day. If it is urgent, call
          the Lagos office on the number in the panel beside this form.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-8 lg:p-10">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="full-name" className={labelClass}>
            Full name
          </label>
          <input
            id="full-name"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            placeholder="Adaeze Okafor"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+234 800 000 0000"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="subject" className={labelClass}>
            How can we help?
          </label>
          <select id="subject" name="subject" defaultValue="general" className={fieldClass}>
            {SUBJECTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="message" className={labelClass}>
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          placeholder="Tell us what you are looking for, or how we can help."
          className={`${fieldClass} resize-none`}
        />
      </div>

      {/* Hidden from people and from assistive technology, visible to a bot. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 disabled:bg-mist-300 sm:w-auto"
      >
        {state === "sending" ? "Sending" : "Send message"}
      </button>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        We reply within one business day.
        {contactEmail !== "" && (
          <>
            {" "}
            You can also email{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-semibold text-wine-600 transition-colors hover:text-wine-700"
            >
              {contactEmail}
            </a>
            .
          </>
        )}
      </p>
    </form>
  );
}
