"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A button, not an automatic unsubscribe on load: mail scanners open every link
 * in a message, and would otherwise unsubscribe people who never clicked.
 */
export default function UnsubscribeConfirm({ subscriberId, token }: { subscriberId: string; token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">(
    subscriberId && token ? "idle" : "failed",
  );

  async function confirm() {
    setState("busy");
    try {
      const res = await fetch(
        `/api/public/unsubscribe?s=${encodeURIComponent(subscriberId)}&t=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="bg-mist-50">
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <div className="rounded-2xl border border-mist-200 bg-white p-8" aria-live="polite">
          {state === "done" ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-plum-950">You are unsubscribed</h1>
              <p className="mt-2 text-sm text-muted-foreground">We will not email you again. You can subscribe again from the site any time.</p>
            </>
          ) : state === "failed" ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-plum-950">This link is not valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Use the unsubscribe link from one of our emails, or{" "}
                <Link href="/contact" className="font-semibold text-wine-600 underline underline-offset-2">
                  contact us
                </Link>{" "}
                and we will remove you.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-plum-950">Stop getting our emails?</h1>
              <p className="mt-2 text-sm text-muted-foreground">You will no longer receive the AVHomes newsletter.</p>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={state === "busy"}
                className="mt-6 inline-flex h-12 items-center rounded-full bg-wine-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-wine-700 disabled:opacity-60"
              >
                {state === "busy" ? "Unsubscribing" : "Unsubscribe"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
