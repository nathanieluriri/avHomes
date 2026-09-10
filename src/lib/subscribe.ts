"use client";

import { useState } from "react";

export type SubscribeStatus = "idle" | "sending" | "done" | "error";

/**
 * A public MUTATION, so it is NOT under the cacheable `/public/*` router even
 * though it starts with that word. See `audiencePublicRoutes`.
 */
const ENDPOINT = "/api/public/subscribe";

/**
 * The one spelling of what pressing Subscribe does.
 *
 * Two surfaces ask for an address: the banner under a post and the pill in the
 * site footer. They look nothing alike and should stay that way, but the
 * endpoint, the honeypot's name, and which HTTP status means which sentence are
 * not presentation. Written twice they drift, and the drift is invisible until
 * a rate-limited reader on one of them is told to check their address.
 *
 * So the fetch lives here and each surface owns only its markup.
 */
export function useSubscribe(source?: string) {
  const [status, setStatus] = useState<SubscribeStatus>("idle");
  const [problem, setProblem] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const website = String(data.get("website") ?? "").trim();
    if (email === "") return;

    setStatus("sending");
    setProblem("");

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          // Sent only when a bot filled it. An empty string on every request is
          // a field the schema has to keep accepting for nothing.
          ...(website === "" ? {} : { website }),
          ...(source ? { source } : {}),
        }),
      });

      if (res.ok) {
        setStatus("done");
        return;
      }

      setStatus("error");
      /*
       * Three answers, because a reader can act on three different things: fix
       * the address, wait, or try again later. Anything more specific would be
       * repeating an error code at somebody who cannot use one.
       */
      setProblem(
        res.status === 429
          ? "That is a few too many tries. Give it a minute and go again."
          : res.status === 400
            ? "That address does not look right. Check it and try again."
            : "Something went wrong at our end. Please try again shortly.",
      );
    } catch {
      // A refused fetch is offline, a blocked request or a dead deployment, and
      // the reader can only usefully be told to retry.
      setStatus("error");
      setProblem("We could not reach the server. Check your connection and try again.");
    }
  }

  return { status, problem, submit };
}
