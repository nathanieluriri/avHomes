import { Suspense } from "react";
import Hero from "@/components/Hero";
import SearchStrip from "@/components/SearchStrip";
import FeaturedListings from "@/components/FeaturedListings";
import WhyChooseUs from "@/components/WhyChooseUs";
import LogoMarquee from "@/components/LogoMarquee";
import Testimonials from "@/components/Testimonials";
import CTABanner from "@/components/CTABanner";
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

  return (
    <>
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
