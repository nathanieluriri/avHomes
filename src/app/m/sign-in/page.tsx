"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthUser } from "@avhomes/contracts";
import {
  AuthFrame,
  OtherDoor,
  Passport,
  PasswordInput,
} from "@/components/marketer/account/AuthFrame";
import { IconAccount } from "@/components/marketer/icons3d";
import { Card, ErrorNote, Field, PrimaryButton, inputCls } from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import {
  firstName,
  forgetAccount,
  maskEmail,
  rememberAccount,
  useLastAccount,
} from "@/lib/marketer/last-account";

/**
 * The marketer's own door.
 *
 * Separate from the console's on purpose: which door the console uses is a
 * deployment setting, and a marketer has to be able to get in either way.
 *
 * Two shapes, one screen. A phone that has signed somebody in before opens as
 * their passport with one field under it; a fresh phone gets the ordinary two
 * field form. The difference is a keyboard saving, never a security one: the
 * password is asked for every time and the cookie is still the only thing the
 * server trusts.
 */
export default function SignInPage() {
  const router = useRouter();
  const last = useLastAccount();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // `last` is null until the client has read storage, so the field fills in on
  // mount rather than being wrong during hydration.
  useEffect(() => {
    if (last) setEmail(last.email);
  }, [last]);

  const known = last !== null;
  const ready = email.trim() !== "" && password !== "";

  async function signIn() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: AuthUser }>("/public/marketing/sign-in", {
        email: email.trim(),
        password,
      });
      rememberAccount({ name: user.displayName || email.trim(), email: user.email || email.trim() });
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

  function useAnotherAccount() {
    forgetAccount();
    setEmail("");
    setPassword("");
    setError(null);
  }

  return (
    <AuthFrame
      title="Welcome back"
      hint="Sign in to see your money and report a deal."
      tab={known ? "Your password" : "Sign in"}
      art={<IconAccount size={96} />}
      head={
        known ? (
          <Passport
            name={firstName(last.name) || last.email}
            email={maskEmail(last.email)}
            onForget={useAnotherAccount}
          />
        ) : undefined
      }
    >
      <Card className="m-card--lg">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          {!known && (
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
          )}

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
