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
      <Suspense fallback={<div className="h-96" />}>
        <FeaturedListings properties={properties} />
      </Suspense>
      <LogoMarquee clients={site.clientLogos.map((c) => ({ name: c.name, logo: c.imageUrl }))} />
      <WhyChooseUs stats={stats} />
      <Testimonials testimonials={testimonials} />
      <CTABanner />
    </>
  );
}
