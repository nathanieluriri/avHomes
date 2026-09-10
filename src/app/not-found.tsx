import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NotFoundBody from "@/components/NotFoundBody";
import { getSiteSettings } from "@/lib/data";

export const metadata = {
  title: "Page not found | AVHomes",
  description: "That page is not here. Search the listings or start again from the homepage.",
  robots: { index: false, follow: true },
};

/**
 * The root 404, for a URL that matches no route at all.
 *
 * It draws the chrome itself. The navbar and footer live in the `(site)` route
 * group, and a root `not-found.tsx` renders in the ROOT layout, outside that
 * group, so without these two lines this page would be the branded body sitting
 * on a bare white page with no way out of it but the buttons.
 */
export default async function RootNotFound() {
  const site = await getSiteSettings();
  return (
    <>
      <Navbar contactEmail={site.contactEmail} social={site.social} />
      <main className="flex-1">
        <NotFoundBody />
      </main>
      <Footer social={site.social} />
    </>
  );
}
