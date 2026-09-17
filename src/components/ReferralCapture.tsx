"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { rememberReferral } from "@/lib/referral";

/**
 * Keeps a shared link's `?ref=` for the session. Renders nothing.
 *
 * `window.location` in an effect, NOT `useSearchParams`. The listing pages are
 * prerendered, and a client hook that reads the query string there has to sit
 * under a Suspense boundary or the production build fails. Reading it after
 * mount changes nothing about how the page renders. Keyed on the path, so a
 * link followed inside the site is read too.
 */
export default function ReferralCapture() {
  const pathname = usePathname();

  useEffect(() => {
    rememberReferral(window.location.search);
  }, [pathname]);

  return null;
}
