import { getEnv, siteOrigin } from "@avhomes/core";

export type AuthDoor = "clerk" | "password";

export interface DoorStatus {
  door: AuthDoor;
  /** The publishable key the sign-in screen needs, or "" under the password door. */
  clerkPublishableKey: string;
  /** Why the Clerk door is closed, when it is. Empty when it is open. */
  clerkUnavailableReason: string;
}

/**
 * Which door is live, and EXACTLY ONE is.
 *
 * An always-available password endpoint alongside Clerk is a standing bypass of
 * whatever MFA Clerk is enforcing. So the inactive door answers 501, and this
 * function is the single place that decides which one that is.
 *
 * Three conditions, each earning its place:
 *
 *  - **Both keys, not just the secret.** A door the server believes is open but
 *    the browser cannot render is worse than no door at all.
 *  - **Not a `*.vercel.app` origin.** Clerk's production publishable key refuses
 *    to load on a deploy alias, and the failure is a blank sign-in screen with
 *    nothing anywhere naming the cause. Setting the keys before the custom
 *    domain is live would otherwise lock everyone out.
 *  - **Read at RUNTIME, not baked at build.** The publishable key is a build-time
 *    value for the browser bundle, so a screen that decided from it alone would
 *    need a redeploy to notice a dashboard change. Asking the server instead
 *    means the answer is always current.
 */
export function doorStatus(): DoorStatus {
  const env = getEnv();
  const origin = siteOrigin();

  if (env.CLERK_SECRET_KEY === "") {
    return closed("CLERK_SECRET_KEY is not set");
  }
  if (env.CLERK_PUBLISHABLE_KEY === "") {
    return closed("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set");
  }
  if (isDeployAlias(origin)) {
    return closed(
      `Clerk keys refuse to load on a deploy alias (${origin}). Set SITE_ORIGIN to the custom domain.`,
    );
  }
  return {
    door: "clerk",
    clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY,
    clerkUnavailableReason: "",
  };
}

function closed(reason: string): DoorStatus {
  return { door: "password", clerkPublishableKey: "", clerkUnavailableReason: reason };
}

/**
 * A production Clerk key is bound to a configured domain. `*.vercel.app` and
 * localhost are never that domain.
 */
function isDeployAlias(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host.endsWith(".vercel.app");
  } catch {
    // An unparseable SITE_ORIGIN is a misconfiguration, and falling back to the
    // password door keeps somebody able to sign in and fix it.
    return true;
  }
}

export function activeDoor(): AuthDoor {
  return doorStatus().door;
}
