import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";

/**
 * The marketing site's chrome.
 *
 * It lives in a route GROUP rather than in the root layout, because Next.js
 * composes layouts downward and there is no way for a child to opt out of one.
 * With the navbar, footer and cookie banner at the root, the admin console
 * rendered a "Find Property" button and a consent banner over its own sign-in
 * form. The group is the only way to say "these routes, and not those".
 *
 * The root layout keeps html, body, fonts and globals, which every route wants.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CookieBanner />
    </>
  );
}
