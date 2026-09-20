import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import SitePulse from "@/components/SitePulse";
import ChatWidget from "@/components/chat/ChatWidget";
import ReferralCapture from "@/components/ReferralCapture";
import JsonLd from "@/components/JsonLd";
import { ChatProvider } from "@/lib/chat/provider";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import { getSiteSettings } from "@/lib/data";

/**
 * The picture a link to this site unfurls as, when the page has no better one.
 *
 * The hero photograph rather than the logo. A logo in a 1.91:1 frame is a mark
 * floating in whitespace, and the thing being shared is a house.
 */
const OG_IMAGE = "/images/library/exterior-02.jpg";

/**
 * The social card and the verification tag, for the marketing site only.
 *
 * HERE RATHER THAN IN THE ROOT LAYOUT, by the same rule as the navbar below:
 * the console is not a marketing page and has no business carrying og tags or
 * announcing itself to a crawler.
 *
 * NO `url` FIELD. og:url has to name the page it sits on, and one written at
 * this level would print the homepage's address on the contact page. The
 * canonical in each page's own metadata is what does that job.
 *
 * A page that sets its own `openGraph` REPLACES this object rather than merging
 * into it, which is why the listing and post pages repeat `siteName` for
 * themselves. What this covers is everything that does not: the homepage, the
 * listings index, the journal index, contact, terms and privacy, all of which
 * previously unfurled as a bare line of text.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();

  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      // en_NG, not en_GB or en_US. Most of the people this is written for read
      // it from outside the country; the market they are buying in is here.
      locale: "en_NG",
      images: [
        { url: OG_IMAGE, width: 1600, height: 1067, alt: "An AVHomes property at dusk" },
      ],
    },
    twitter: { card: "summary_large_image", images: [OG_IMAGE] },
    /*
     * Emitted only once somebody has actually verified the site. An invented
     * token is worse than no tag: Google rejects it silently and the owner is
     * left reading a line in their own page head that says they are verified.
     */
    ...(site.seo.googleVerification !== ""
      ? { verification: { google: site.seo.googleVerification } }
      : {}),
  };
}

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
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // One read for the whole group. Next dedupes it against the page's own call
  // within a request, so the homepage asking for the same settings costs nothing.
  const site = await getSiteSettings();

  /*
   * The organisation record, written once for the whole marketing site.
   *
   * `RealEstateAgent` rather than `Organization`, because it is a LocalBusiness
   * subtype: the same record then carries an address, a telephone and an area
   * served, and those three are what put an agency in a map result rather than
   * in a list of links.
   *
   * EVERY OPTIONAL FIELD IS CONDITIONAL, by the rule the contact page already
   * follows. A record that publishes a telephone the settings do not hold is a
   * fact asserted about the business that nobody in the business wrote, and it
   * is asserted to machines, where nobody will ever read it back and notice.
   */
  const sameAs = [
    ...Object.values(site.social).filter((url) => url !== ""),
    ...(site.seo.googleBusinessProfileUrl !== "" ? [site.seo.googleBusinessProfileUrl] : []),
  ];

  const organisation = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": `${SITE_DOMAIN}/#organisation`,
    name: SITE_NAME,
    url: SITE_DOMAIN,
    logo: `${SITE_DOMAIN}/brand/logo.png`,
    description:
      "Vetted homes for sale and to rent across Nigeria, checked on the ground before they go live, for buyers at home and in the diaspora.",
    // The claim the front page makes, in the one place a machine reads it.
    areaServed: { "@type": "Country", name: "Nigeria" },
    ...(site.contactPhone !== "" ? { telephone: site.contactPhone } : {}),
    ...(site.contactEmail !== "" ? { email: site.contactEmail } : {}),
    ...(site.offices.length > 0
      ? {
          address: site.offices.map((office) => ({
            "@type": "PostalAddress",
            streetAddress: office.address,
            addressLocality: office.label,
            addressCountry: "NG",
          })),
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  return (
    /*
     * The chat provider wraps the whole group rather than sitting beside it,
     * because "Contact agent" on a listing page has to be able to reach the same
     * conversation state the floating widget is showing. Two of them would mean
     * two pollers and two answers to "do I have an unread message".
     *
     * It is inside the site group and not the root layout for the same reason
     * the navbar is: the console has its own inbox and must not grow a customer
     * chat bubble over its sign-in form.
     */
    <ChatProvider>
      <JsonLd data={organisation} />
      <Navbar contactEmail={site.contactEmail} social={site.social} />
      <main className="flex-1">{children}</main>
      <Footer social={site.social} />
      <CookieBanner />
      {/* Counts storefront visits only, and only once the banner above is accepted. */}
      <SitePulse />
      {/* A marketer's `?ref=`, held for the session so an enquiry can carry it. */}
      <ReferralCapture />
      {/* Last, so it paints over everything, and portalled to the body from
          inside so a transformed section cannot become its containing block. */}
      <ChatWidget />
    </ChatProvider>
  );
}
