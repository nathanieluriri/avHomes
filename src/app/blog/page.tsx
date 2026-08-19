import Image from "next/image";
import Link from "next/link";
import { getInsights } from "@/lib/data";
import BlogCard, { authorFace, formatInsightDate } from "@/components/BlogCard";
import Reveal from "@/components/Reveal";

export const metadata = {
  title: "Insights | AVHomes",
};

export default async function BlogIndexPage() {
  const insights = await getInsights();
  const featured = insights.find((i) => i.featured) ?? insights[0];
  const rest = insights.filter((i) => i.id !== featured?.id);

  // "All" plus each category in first-seen order, deduped.
  const categories = ["All", ...Array.from(new Set(insights.map((i) => i.category)))];

  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            Insights
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
            Guides, Stories and <span className="accent">Market Reads</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Practical reads on buying, investing, and living well across Lagos and Abuja,
            from the AVHomes team and partners.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-14">
        <Reveal>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
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

        {featured && (
          <Reveal delay={80}>
            <Link
              href={`/blog/${featured.slug}`}
              className="card-soft group mt-12 grid gap-6 p-4 sm:p-6 md:grid-cols-2 md:gap-10 md:p-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl">
                <Image
                  src={featured.image}
                  alt={featured.title}
                  fill
                  priority
                  sizes="(min-width:768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
                />
              </div>

              <div className="flex flex-col justify-center">
                <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {featured.category}
                </span>
                <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-navy-950 sm:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {featured.excerpt}
                </p>

                <div className="mt-8 flex items-center gap-3 border-t border-mist-200 pt-6">
                  <Image
                    src={authorFace(featured)}
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
                    <span>{formatInsightDate(featured.publishedAt)}</span>
                    <span className="h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
                    <span>{featured.readMinutes} min read</span>
                  </div>
                </div>
              </div>
            </Link>
          </Reveal>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((insight, i) => (
            <Reveal key={insight.id} delay={(i % 3) * 80}>
              <BlogCard insight={insight} priority={i < 3} />
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
