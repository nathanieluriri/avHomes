import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./m.css";

/**
 * The marketer app's segment: a SERVER component that owns the tab title and
 * the one wrapper every screen is drawn inside.
 *
 * `.m-app` is doing two jobs. It carries the Night plum palette and the page
 * ground, and it is the hook globals.css checks before deleting every
 * box-shadow in the tree. Without the class on an ancestor the bottom bar, the
 * cards and the sheets all lose their edges.
 *
 * Every screen below is a client component, because the whole app is driven by
 * the same cookie-authenticated API the browser talks to, and a client component
 * cannot export metadata. So the title is set once, here.
 */

/* The browser bar takes the hero's wine, and `dark` stops the white first frame
   a light colour scheme paints before the stylesheet lands. */
export const viewport: Viewport = {
  themeColor: "#7d2c40",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "AV Homes Marketers",
  /*
   * Not indexed, and not the same job as the disallow in robots.ts. That file
   * asks a crawler not to fetch and is only seen by one that reads it first;
   * this asks it not to index, and travels with the page for anything arriving
   * by a link instead. The app answers a 200 HTML shell to an anonymous request
   * rather than redirecting, because the sign-in bounce happens after hydration.
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function MarketerLayout({ children }: { children: ReactNode }) {
  return <div className="m-app">{children}</div>;
}
