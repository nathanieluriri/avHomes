"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@avhomes/contracts";
import { AuthFrame, OtherDoor, PasswordInput } from "@/components/marketer/account/AuthFrame";
import { IconAccount } from "@/components/marketer/icons3d";
import { Card, ErrorNote, Field, PrimaryButton, inputCls } from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";

/**
 * The marketer's own door.
 *
 * Separate from the console's on purpose: which door the console uses is a
 * deployment setting, and a marketer has to be able to get in either way.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const ready = email.trim() !== "" && password !== "";

  async function signIn() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<{ user: AuthUser }>("/public/marketing/sign-in", {
        email: email.trim(),
        password,
      });
      router.replace("/m");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Welcome back"
      hint="Sign in to see your money and report a deal."
      tab="Sign in"
      art={<IconAccount size={96} />}
    >
      <Card className="m-card--lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoCapitalize="off"
              placeholder="you@example.com"
              className={inputCls}
            />
          </Field>

          <Field label="Password" as="group">
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="Your password"
            />
          </Field>

          {error && <ErrorNote error={error} onRetry={() => void signIn()} />}

          <PrimaryButton type="submit" busy={busy} disabled={!ready}>
            Sign in
          </PrimaryButton>
        </form>
      </Card>

      <OtherDoor question="No account yet?" href="/m/join" action="Join AV Homes" />
    </AuthFrame>
  );
}
