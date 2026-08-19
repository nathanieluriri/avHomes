import Image from "next/image";
import { Insight } from "@/lib/types";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

const CATEGORIES = [
  "All",
  "Buying Guide",
  "Investing",
  "Legal",
  "Market Report",
  "Sustainability",
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Portrait per card, indexed so each of the six insights gets a distinct face. */
const FACES = [
  "/images/library/person-01.jpg",
  "/images/library/person-02.jpg",
  "/images/library/person-03.jpg",
  "/images/library/person-04.jpg",
  "/images/library/person-05.jpg",
  "/images/library/person-06.jpg",
];

/**
 * "2026-08-04" becomes "4 Aug 2026". Built manually from a month-name array
 * (never toLocaleDateString) so the server and client always agree.
 */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export default function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  const featured = insights.find((i) => i.featured) ?? insights[0];
  const rest = insights.filter((i) => i.id !== featured.id).slice(0, 5);

  return (
    <section id="insights" className="bg-mist-50 py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow="Insights"
            lead="The Latest From AVHomes:"
            accent="Guides and Market Reads"
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((c) => (
              <span
                key={c}
                className={`rounded-full px-5 py-2.5 text-sm font-medium ${
                  c === "All"
                    ? "bg-navy-950 text-white"
                    : "bg-mist-100 text-slate-500 hover:bg-mist-200 hover:text-navy-950"
                }`}
              >
                {c}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <article className="card-soft mt-12 grid gap-6 p-4 sm:p-6 md:grid-cols-2 md:gap-10 md:p-8">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl">
              <Image
                src={featured.image}
                alt={featured.title}
                fill
                sizes="(min-width:768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>

            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {featured.category}
              </span>
              <h3 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-navy-950 sm:text-3xl">
                {featured.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {featured.excerpt}
              </p>

              <div className="mt-8 flex items-center gap-3 border-t border-mist-200 pt-6">
                <Image
                  src="/images/library/person-05.jpg"
                  alt={featured.author}
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="text-sm font-semibold text-navy-950">
                    {featured.author}
                  </span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
                  <span>{formatDate(featured.publishedAt)}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
                  <span>{featured.readMinutes} min read</span>
                </div>
              </div>
            </div>
          </article>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((insight, i) => (
            <Reveal key={insight.id} delay={(i % 3) * 80}>
              <article className="card-soft group flex h-full flex-col overflow-hidden">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={insight.image}
                    alt={insight.title}
                    fill
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
                      src={FACES[i % FACES.length]}
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
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
