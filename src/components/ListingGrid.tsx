import PropertyCard from "@/components/PropertyCard";
import Reveal from "@/components/Reveal";
import type { Property } from "@/lib/types";

/**
 * The three-up grid, shared by the listings index and the place pages.
 *
 * `priorityCount` is how many images are fetched eagerly: the ones above the
 * fold on the widest layout, and nothing after them. Marking the whole grid
 * priority makes every card compete for the same bandwidth as the first three,
 * which is how a page gets slower by being told to hurry.
 */
export default function ListingGrid({
  properties,
  priorityCount = 3,
  className = "",
}: {
  properties: Property[];
  priorityCount?: number;
  className?: string;
}) {
  return (
    <div className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {properties.map((p, i) => (
        <Reveal key={p.id} delay={(i % 3) * 80}>
          <PropertyCard property={p} priority={i < priorityCount} />
        </Reveal>
      ))}
    </div>
  );
}
