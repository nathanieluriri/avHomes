import { Suspense } from "react";
import Hero from "@/components/Hero";
import SearchStrip from "@/components/SearchStrip";
import FeaturedListings from "@/components/FeaturedListings";
import WhyChooseUs from "@/components/WhyChooseUs";
import LogoMarquee from "@/components/LogoMarquee";
import Testimonials from "@/components/Testimonials";
import CTABanner from "@/components/CTABanner";
import JsonLd from "@/components/JsonLd";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import {
  getFeaturedProperties,
  getSiteSettings,
  getStats,
  getTestimonials,
} from "@/lib/data";

export default async function Home() {
  const [properties, stats, testimonials, site] = await Promise.all([
    getFeaturedProperties(),
    getStats(),
    getTestimonials(),
    getSiteSettings(),
  ]);

  /*
   * The site record, on the front door only.
   *
   * The organisation lives in the layout because it is true on every page. This
   * is not: `potentialAction` is the sitelinks search box, and a search box
   * declared on every page is a claim that each of them is the site's entry
   * point. `publisher` points back at the `@id` the layout minted, so the two
   * records are one graph rather than two unrelated assertions.
   *
   * The target is the real URL the search bar submits to. If `/listings` ever
   * stops reading `?q=`, this line becomes a lie that nothing type checks.
   */
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_DOMAIN}/#website`,
    url: SITE_DOMAIN,
    name: SITE_NAME,
    publisher: { "@id": `${SITE_DOMAIN}/#organisation` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_DOMAIN}/listings?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <JsonLd data={website} />
      <Hero />
      {/* SearchStrip reads search params, so it needs a Suspense boundary */}
      <Suspense fallback={<div className="h-24" />}>
        <SearchStrip />
      </Suspense>
      {/* No boundary here any more: it made the whole section client-rendered
          for the sake of one chip row. FeaturedListings wraps that row itself. */}
      <FeaturedListings properties={properties} />
      <LogoMarquee clients={site.clientLogos.map((c) => ({ name: c.name, logo: c.imageUrl }))} />
      <WhyChooseUs stats={stats} />
      <Testimonials testimonials={testimonials} />
      <CTABanner />
    </>
  );
}
