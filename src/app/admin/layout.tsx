"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { hasDomain, type Domain } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useSession } from "@/lib/admin/hooks";
import { Spinner } from "@/components/admin/ui";

/**
 * The admin shell.
 *
 * A client component, because the whole console is driven by the same
 * cookie-authenticated API the browser talks to, and rendering the nav on the
 * server would mean a second, parallel way of asking who is signed in.
 *
 * The nav is filtered by the SAME `hasDomain` the server's permission gate
 * reads, so a link never appears for a screen whose API would 403. That is the
 * whole reason the matrix lives in @avhomes/contracts.
 */

interface NavItem {
  href: string;
  label: string;
  domain: Domain;
}

const NAV: readonly NavItem[] = [
  { href: "/admin", label: "Dashboard", domain: "analytics" },
  { href: "/admin/properties", label: "Listings", domain: "listings" },
  { href: "/admin/posts", label: "Journal", domain: "content" },
  { href: "/admin/enquiries", label: "Enquiries", domain: "enquiries" },
  { href: "/admin/images", label: "Images", domain: "media" },
  { href: "/admin/team", label: "Team", domain: "team" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();

  const isSignIn = pathname === "/admin/sign-in";

  useEffect(() => {
    if (session.status === "signed-out" && !isSignIn) router.replace("/admin/sign-in");
    if (session.status === "signed-in" && isSignIn) router.replace("/admin");
  }, [session.status, isSignIn, router]);

  // `unknown` renders nothing rather than a sign-in form, so an operator who is
  // already signed in never sees a login screen flash on navigation.
  if (session.status === "unknown") {
    return (
      <div className="grid min-h-screen place-items-center bg-mist-50">
        <Spinner />
      </div>
    );
  }

  if (isSignIn) return <div className="min-h-screen bg-mist-50">{children}</div>;
  if (session.status !== "signed-in") return null;

  const { user } = session;
  const visible = NAV.filter((item) => hasDomain(user.role, item.domain));

  return (
    <div className="min-h-screen bg-mist-50">
      <header className="border-b border-navy-800 bg-navy-950">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link href="/admin" className="text-sm font-bold tracking-tight text-white">
            AVHomes <span className="font-normal text-blue-100">admin</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {visible.map((item) => {
              // Compared on a SEGMENT BOUNDARY, so /admin/posts does not light up
              // for a future /admin/posts-archive, which a bare startsWith would.
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-blue-100 sm:inline">
              {user.displayName}
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">{user.role}</span>
            </span>
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              onClick={() => {
                // Logout never fails: an expired session and a live one both end
                // with the cookie gone, so the redirect is unconditional.
                void api.post("/auth/logout").finally(() => {
                  // A FULL navigation, not router.push. The session cookie just changed and
                  // the shell stays mounted across a client-side route change, so its
                  // useSession effect would never re-run and the app would render the old
                  // identity.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/admin/sign-in";
                });
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
