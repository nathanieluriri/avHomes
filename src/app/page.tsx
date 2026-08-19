import { Suspense } from "react";
import Hero from "@/components/Hero";
import SearchStrip from "@/components/SearchStrip";
import FeaturedListings from "@/components/FeaturedListings";
import WhyChooseUs from "@/components/WhyChooseUs";
import LogoMarquee from "@/components/LogoMarquee";
import Insights from "@/components/Insights";
import Testimonials from "@/components/Testimonials";
import CTABanner from "@/components/CTABanner";
import {
  getFeaturedProperties,
  getStats,
  getTestimonials,
  getInsights,
} from "@/lib/data";

export default async function Home() {
  const [properties, stats, testimonials, insights] = await Promise.all([
    getFeaturedProperties(),
    getStats(),
    getTestimonials(),
    getInsights(),
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
      <LogoMarquee />
      <WhyChooseUs stats={stats} />
      <Insights insights={insights} />
      <Testimonials testimonials={testimonials} />
      <CTABanner />
    </>
  );
}
