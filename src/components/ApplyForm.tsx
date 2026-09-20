"use client";

import { useState } from "react";
import { PhoneInput } from "@/components/PhoneInput";

const fieldClass =
  "mt-2 w-full rounded-xl border border-mist-200 bg-white px-4 py-3 text-sm text-plum-950 outline-none transition-colors placeholder:text-slate-500 focus:border-wine-600";
const labelClass = "block text-sm font-semibold text-plum-950";

const PORTFOLIO = ["Just one", "Two to five", "Six to twenty", "More than twenty"] as const;

/**
 * Applying for a partner account, wired to POST /api/public/partner-applications.
 *
 * That route is a PUBLIC MUTATION, below the origin guard and outside the cacheable
 * `/api/public/*` router, for the same reason the enquiry intake is: a write whose
 * response a shared cache may store is the confusion that split prevents.
 */
export function ApplyForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  /* Controlled, because `PhoneInput` formats as you type and needs to own the
     value. The rest of the form is read from FormData on submit. */
  const [phone, setPhone] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = new FormData(event.currentTarget);
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/public/partner-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          phone,
          company: String(form.get("company") ?? ""),
          about: String(form.get("about") ?? ""),
          portfolio: String(form.get("portfolio") ?? ""),
        }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;
      setState("error");
      /* A duplicate is not a failure worth an apology: they already applied, and the
         useful thing to say is that it is already with us. */
      setMessage(
        body?.error === "duplicate"
          ? "You have already applied with that address. We still have it, and you will hear back."
          : body?.error === "rate_limited"
            ? "That is a few applications in one go. Try again in a little while."
            : "Something went wrong sending that. Try again in a moment.",
      );
    } catch {
      setState("error");
      setMessage("That did not reach us. Check your connection and try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-wine-100 bg-wine-50 p-6">
        <h2 className="font-serif text-2xl text-plum-950">That is with us</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-wine-700">
          We have sent a note to the address you gave. Somebody here reads every
          application and you will hear back either way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="apply-name">
          Your name
        </label>
        <input id="apply-name" name="name" required minLength={2} className={fieldClass} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="apply-email">
            Email
          </label>
          <input
            id="apply-email"
            name="email"
            type="email"
            required
            className={fieldClass}
            /* The address the account is minted against, so it is worth saying. */
            aria-describedby="apply-email-hint"
          />
          <p id="apply-email-hint" className="mt-1.5 text-xs text-slate-500">
            Your account will be tied to this address.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="apply-phone">
            Phone
          </label>
          <PhoneInput name="phone" value={phone} onChange={setPhone} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="apply-company">
          Company, if you have one
        </label>
        <input id="apply-company" name="company" className={fieldClass} />
      </div>

      <div>
        <label className={labelClass} htmlFor="apply-portfolio">
          How much property
        </label>
        <select id="apply-portfolio" name="portfolio" className={fieldClass} defaultValue="Just one">
          {PORTFOLIO.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="apply-about">
          What do you have?
        </label>
        <textarea
          id="apply-about"
          name="about"
          required
          minLength={10}
          rows={5}
          className={fieldClass}
          placeholder="A four bedroom duplex in Lekki Phase 1, and two shortlets in Ikoyi."
        />
      </div>

      {state === "error" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-xl bg-wine-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 disabled:opacity-60 sm:w-auto"
      >
        {state === "sending" ? "Sending..." : "Apply to list"}
      </button>
    </form>
  );
}
