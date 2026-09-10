import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/admin/ConsoleShell";

/**
 * The console's route segment: a SERVER component that owns the tab title, over
 * a client shell that owns everything else.
 *
 * The split exists for the title and nothing else. Every console screen is a
 * client component, because the whole console is driven by the same
 * cookie-authenticated API the browser talks to, and a client component cannot
 * export `metadata`. So every admin tab inherited the marketing site's
 * "AVHomes | Buy. Sell. Rent." and two open console tabs were indistinguishable.
 *
 * Setting `document.title` from an effect in the shell does not work, and it is
 * worth writing down why: Next reconciles route metadata after hydration and
 * after each client navigation, so it overwrites the effect's value every time.
 * Measured, on both a cold load and a rail click. The title has to come from
 * metadata, which means it has to come from a server component, which means
 * each section names itself in its own `layout.tsx` and the template here
 * supplies the rest.
 */

export const metadata: Metadata = {
  title: {
    // `/admin` and anything without a section layout of its own.
    default: "Dashboard | AVHomes console",
    template: "%s | AVHomes console",
  },
  /*
   * Inherited by every console screen, and NOT the same job as the disallow in
   * `robots.ts`.
   *
   * That file asks a crawler not to fetch, is advisory, and is only seen by a
   * crawler that reads it first. This asks it not to INDEX, and it travels with
   * the page for anything that arrives by a link instead. Both are wanted here
   * because the console answers a 200 HTML shell to an anonymous request rather
   * than redirecting: the sign-in bounce happens after hydration, so a crawler
   * gets a page, not a 302.
   *
   * `nocache` and the Google-specific pair keep an already-indexed URL from
   * lingering as a stale snippet after it stops being served.
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
