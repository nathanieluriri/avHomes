import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Property } from "@/lib/types";
import PropertyCard from "./PropertyCard";
import CategoryChips from "./CategoryChips";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

export default function FeaturedListings({ properties }: { properties: Property[] }) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Featured"
          lead="Discover Handpicked Homes That"
          accent="Define Elegance"
        />
      </Reveal>

      <Reveal delay={80}>
        <div className="mt-9">
          <CategoryChips scrollOnSelect />
        </div>
      </Reveal>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p, i) => (
          <Reveal key={p.id} delay={(i % 3) * 90}>
            {/* No `priority`. These sit below the fold on every viewport, and
                preloading three of them put them in contention with the hero,
                which is the LCP element. The hero is the only image on the
                homepage that earns a preload. */}
            <PropertyCard property={p} />
          </Reveal>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/listings"
          className="group inline-flex items-center gap-2 rounded-full border border-mist-200 px-8 py-3.5 text-sm font-semibold text-plum-950 transition-colors hover:border-wine-600 hover:text-wine-600"
        >
          Explore More
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            strokeWidth={2}
          />
        </Link>
      </div>
    </section>
  );
}
