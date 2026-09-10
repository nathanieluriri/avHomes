import NotFoundBody from "@/components/NotFoundBody";

export const metadata = {
  title: "Page not found | AVHomes",
  description: "That page is not here. Search the listings or start again from the homepage.",
  /* `follow` stays true so a crawler that lands here walks the links out
     instead of treating a delisted property as a dead end. */
  robots: { index: false, follow: true },
};

/**
 * Catches `notFound()` from anywhere inside the marketing site, which is every
 * unknown or delisted listing and every missing post. The group's layout gives
 * it the navbar and footer for free.
 */
export default function SiteNotFound() {
  return <NotFoundBody />;
}
