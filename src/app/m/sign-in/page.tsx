"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@avhomes/contracts";
import {
  AuthDoor,
  DoorTitle,
  Passport,
  PasswordInput,
} from "@/components/marketer/account/AuthFrame";
import { ErrorNote, Field, PrimaryButton, inputCls } from "@/components/marketer/ui";
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

  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /* Derived, not synced. `last` is null on the server and until the client has
     read storage, so an effect copying it into state would render the field
     empty and then fill it, and would fight anything typed in between. */
  const known = last !== null;
  const email = known ? last.email : typed;
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
    setTyped("");
    setPassword("");
    setError(null);
  }

  return (
    <AuthDoor
      head={
        known ? (
          <Passport
            name={firstName(last.name) || last.email}
            email={maskEmail(last.email)}
            onForget={useAnotherAccount}
          />
        ) : (
          <DoorTitle
            title="Welcome back"
            hint="Sign in to see your money, your buyers and your team."
          />
        )
      }
      foot={
        <p className="text-center text-[14.5px] text-m-muted">
          No account yet?{" "}
          <Link href="/m/join" className="m-tap m-link font-semibold">
            Join AV Homes
          </Link>
        </p>
      }
    >
      <form
        className="space-y-5"
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
              onChange={(event) => setTyped(event.target.value)}
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
            placeholder="Enter your password"
          />
        </Field>

        {error && <ErrorNote error={error} onRetry={() => void signIn()} />}

        <PrimaryButton type="submit" busy={busy} disabled={!ready}>
          Sign in
        </PrimaryButton>
      </form>
    </AuthDoor>
  );
}
