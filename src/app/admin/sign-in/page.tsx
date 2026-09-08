"use client";

import { useState } from "react";
import type { AuthUser } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { homeFor } from "@/components/admin/nav";
import { useAsync } from "@/lib/admin/hooks";
import { Button, Card, ErrorNote, Field, Spinner, inputClass } from "@/components/admin/ui";

interface DoorStatus {
  door: "clerk" | "password";
  clerkPublishableKey: string;
  clerkUnavailableReason: string;
}

/**
 * The sign-in screen.
 *
 * It asks the SERVER which door is live rather than reading a build-time
 * publishable key. That matters because the key bakes into the browser bundle at
 * build time, so a screen that decided from it alone would need a redeploy to
 * notice a dashboard change, and the symptom would be a blank form.
 */
export default function SignInPage() {
  const { data, error, loading, reload } = useAsync<DoorStatus>(
    (signal) => api.get<DoorStatus>("/auth/door", signal),
    [],
  );

  return (
    /* `svh`, not `vh`, and the vertical pad is part of the same fix. `100vh` is
       the LARGE viewport, which includes the space a mobile browser's URL bar is
       currently occupying, so the card centres against a box taller than the
       screen and sits low. On a 360x640 Android with the chrome showing that put
       the submit button of the claim variant, which draws a third field, below
       the fold on a page that looks like it fits. `svh` measures what is
       actually visible, and the padding gives the taller form somewhere to
       scroll instead of clipping the centring. */
    <div className="grid min-h-[100svh] place-items-center px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xl font-bold tracking-tight text-plum-950">AVHomes</p>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to the admin</p>
        </div>

        {loading && <Spinner />}
        {error && <ErrorNote error={error} onRetry={reload} />}
        {data?.door === "password" && <PasswordDoor reason={data.clerkUnavailableReason} />}
        {data?.door === "clerk" && <ClerkDoor />}
      </div>
    </div>
  );
}

function PasswordDoor({ reason }: { reason: string }) {
  const [mode, setMode] = useState<"login" | "claim">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await api.post<{ user: AuthUser }>("/auth/password/login", { email, password })
          : await api.post<{ user: AuthUser }>("/auth/password/claim", {
              email,
              password,
              ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
            });
      // Not "/admin". The dashboard needs the `analytics` domain, so an editor
      // sent there signs in and lands on a screen whose own API refuses them.
      // The response already carries the role, so the destination is known
      // before the navigation rather than after it.
      // A FULL navigation, not router.push. The session cookie just changed and
      // the shell stays mounted across a client-side route change, so its
      // useSession effect would never re-run and the app would render the old
      // identity.
      window.location.href = homeFor(res.user.role);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {mode === "claim" && (
          <Field label="Your name" hint="Shown on the listings and posts you publish.">
            <input
              className={inputClass}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
        )}

        <Field
          label="Password"
          hint={mode === "claim" ? "At least 12 characters. Length is the only rule." : undefined}
        >
          <input
            className={inputClass}
            type="password"
            autoComplete={mode === "claim" ? "new-password" : "current-password"}
            required
            minLength={mode === "claim" ? 12 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <ErrorNote error={error} />}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Working" : mode === "login" ? "Sign in" : "Accept invite"}
        </Button>

        {/* A real box, not an underlined run of text. This is the only route to
            the invite-acceptance flow, which is how every new colleague first
            reaches the console, and as a bare 12px line its hit box was about
            16px tall on the sparsest screen in the product. It keeps the
            underline, because with no border at rest that is the only thing
            saying it is a control, and it keeps its quieter 12px size from `sm`
            up where a mouse is already accurate. */}
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center rounded-lg text-center text-[13px] text-muted-foreground underline underline-offset-2 transition-colors hover:bg-mist-50 sm:min-h-0 sm:py-1 sm:text-xs"
          onClick={() => {
            setMode(mode === "login" ? "claim" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "I have an invite and no password yet" : "I already have a password"}
        </button>
      </form>

      {reason && (
        <p className="mt-5 border-t border-mist-200 pt-4 text-xs text-muted-foreground">
          Single sign-on is off: {reason}
        </p>
      )}
    </Card>
  );
}

/**
 * The Clerk door.
 *
 * Clerk's own component tree is not installed in this build. The exchange route
 * is live and tested; what is missing is only the widget that produces a token.
 * Saying so plainly beats rendering an empty box, because the person meeting
 * this screen needs to know whether to wait or to change configuration.
 *
 * TODO(test): once @clerk/nextjs is added, cover the exchange against a fake
 * verifier through the real createApp().
 */
function ClerkDoor() {
  return (
    <Card>
      <p className="text-sm font-semibold text-plum-950">Single sign-on is configured</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The server is ready to exchange a Clerk token for a session. The sign-in widget is not part of
        this build yet, so install <code className="font-mono text-xs">@clerk/nextjs</code>, mount its
        provider here, and post the session token to
        <code className="ml-1 font-mono text-xs">/api/auth/clerk/exchange</code>.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        To sign in with a password instead, unset CLERK_SECRET_KEY and redeploy.
      </p>
    </Card>
  );
}
