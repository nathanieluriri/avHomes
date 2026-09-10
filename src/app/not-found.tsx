import { Suspense } from "react";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NotFoundBody, { StillAvailable } from "@/components/NotFoundBody";

export const metadata = {
  title: "Page not found | AVHomes",
  description: "That page is not here. Search the listings or start again from the homepage.",
  /* `follow` stays on so a crawler that lands here walks the links out rather
     than treating a delisted property as a dead end. */
  robots: { index: false, follow: true },
  /*
   * Explicitly none. The root layout sets `canonical: "/"`, which every page
   * inherits, so this page was telling a crawler it was a duplicate of the
   * homepage. Harmless next to `noindex` on its own, but a noindex page whose
   * canonical points at an indexable one is a documented way to confuse the
   * target rather than this page.
   */
  alternates: { canonical: null },
};

/**
 * The only not-found in the tree, and SYNCHRONOUS on purpose.
 *
 * There was a second one under `(site)` so the group's layout would supply the
 * navbar and footer. It cost more than it gave: Next does not apply a nested
 * not-found's `metadata`, so every unknown listing and post rendered the
 * HOMEPAGE's title, and the whole 404 subtree, three property cards included,
 * was serialised into the flight payload of every page in the group, about
 * 15KB on `/contact`. One file, drawing its own chrome, fixes both.
 *
 * Synchronous matters just as much. While this awaited settings before
 * returning, the entire `<body>` came back as `<div hidden>` and everything
 * arrived from the RSC payload after hydration: on a slow connection the page
 * was blank until JavaScript ran, on a page whose whole job is being a way out.
 * So the shell renders immediately with no data, and the one part that needs a
 * database read streams in behind a boundary.
 *
 * The navbar's contact email and the social icons are dropped rather than
 * awaited. Neither is why anybody is on this page.
 */
export default function RootNotFound() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <NotFoundBody>
          <Suspense fallback={null}>
            <StillAvailable />
          </Suspense>
        </NotFoundBody>
      </main>
      <Footer />
    </>
  );
}
