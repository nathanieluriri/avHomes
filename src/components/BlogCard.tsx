import Image from "next/image";
import Link from "next/link";
import { Insight } from "@/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Portraits available for author avatars, indexed for a stable pick per post. */
const FACES = [
  "/images/library/person-01.jpg",
  "/images/library/person-02.jpg",
  "/images/library/person-03.jpg",
  "/images/library/person-04.jpg",
  "/images/library/person-05.jpg",
  "/images/library/person-06.jpg",
];

/**
 * "2026-08-04" becomes "4 Aug 2026". Built from a month-name array, never
 * toLocaleDateString, so server and client always render the same string.
 */
export function formatInsightDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Picks a face off the insight's own id, so an author keeps the same face wherever the card shows up. */
export function authorFace(insight: Insight): string {
  const n = parseInt(insight.id.replace(/[^0-9]/g, ""), 10);
  const index = Number.isNaN(n) ? 0 : (n - 1) % FACES.length;
  return FACES[index];
}

export default function BlogCard({
  insight,
  priority = false,
}: {
  insight: Insight;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/blog/${insight.slug}`}
      className="card-soft group flex h-full flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={insight.image}
          alt={insight.title}
          fill
          priority={priority}
          sizes="(min-width:1024px) 32vw, (min-width:768px) 46vw, 92vw"
          className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy-950 backdrop-blur">
          {insight.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-tight tracking-tight text-navy-950">
          {insight.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {insight.excerpt}
        </p>

        <div className="mt-auto flex items-center gap-3 border-t border-mist-200 pt-4">
          <Image
            src={authorFace(insight)}
            alt={insight.author}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-navy-950">
              {insight.author}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {insight.readMinutes} min read
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
