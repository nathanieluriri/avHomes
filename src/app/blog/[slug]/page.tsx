import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { getInsights } from "@/lib/data";
import { Insight } from "@/lib/types";
import BlogCard, { authorFace, formatInsightDate } from "@/components/BlogCard";
import Reveal from "@/components/Reveal";
import { LinkedInIcon, InstagramIcon, FacebookIcon, XIcon } from "@/components/SocialIcons";

interface CategoryVariant {
  subheadA: string;
  subheadB: string;
  quote: string;
}

interface CategoryContent {
  variants: [CategoryVariant, CategoryVariant];
  bodyA: [string, string];
  bodyB: [string, string];
}

// Two subheading/quote variants per category, plus shared body paragraphs, so
// the two posts that currently share a category (both Buying Guide) still
// read differently from each other.
const CATEGORY_CONTENT: Record<string, CategoryContent> = {
  "Buying Guide": {
    variants: [
      {
        subheadA: "What buyers routinely get wrong",
        subheadB: "A simple framework for staying protected",
        quote: "A contract you have not read carefully is not a contract you actually understand.",
      },
      {
        subheadA: "Where good intentions go missing",
        subheadB: "Turning caution into a habit",
        quote: "The best time to ask a hard question is before you have fallen in love with the house.",
      },
    ],
    bodyA: [
      "Most of the disputes that surface after a purchase were visible earlier, to anyone who knew where to look. Sellers and developers are rarely acting in bad faith when a detail goes unmentioned. More often, nobody on the buying side asked the right question at the right time, and by the time the gap shows up it has already become expensive to fix.",
      "AVHomes advises clients to treat this stage of a purchase as a checklist exercise rather than a trust exercise. Ask for documentation before you ask for reassurance. A written confirmation, however plain, holds up far better than a verbal promise once a transaction has closed and memories of who said what have started to drift.",
    ],
    bodyB: [
      "None of this requires legal training to get right. A short, consistent process, applied the same way at every viewing and every negotiation, catches the overwhelming majority of issues before they become someone else's problem to explain away. Write the questions down in advance and bring them to every meeting, even the ones that feel informal.",
      "The specifics change depending on whether you are buying new construction, an existing home, or something still on the drawing board, but the discipline stays the same throughout. Treat every large figure in a contract as something to verify against a document, not something to accept because the person quoting it sounded confident.",
    ],
  },
  Investing: {
    variants: [
      {
        subheadA: "Reading the numbers the right way round",
        subheadB: "What separates a good deal from a good story",
        quote: "A projection is not a promise, no matter how confidently it is delivered.",
      },
      {
        subheadA: "Where the real risk usually hides",
        subheadB: "Making patience part of the strategy",
        quote: "The safest return is the one you calculated before you got excited, not after.",
      },
    ],
    bodyA: [
      "Every investment property is sold on a story about the future: the road that is coming, the neighbourhood that is turning over, the yield that will materialise once the estate fills up. Some of these stories are accurate. The work of an investor is separating the ones backed by a paper trail from the ones that are simply optimism repeated often enough to sound like fact.",
      "That paper trail usually exists in a handful of predictable places: title documents, prior transaction records, and the developer's own delivery history on earlier phases of the same project. None of these are exotic to request, and a serious counterparty will not hesitate to provide them.",
    ],
    bodyB: [
      "Patience is underrated as an investment strategy in this market. The properties that perform best over a multi year horizon are rarely the ones bought fastest, and the pressure to decide quickly is very often coming from the sales process rather than from the market itself.",
      "A useful habit is to price in the slow scenario before you commit: the handover that runs late, the tenant search that takes longer than expected, the service charge that rises faster than rent. If the numbers still work under those conditions, the deal was probably sound to begin with.",
    ],
  },
  Legal: {
    variants: [
      {
        subheadA: "Why the process runs long",
        subheadB: "What actually keeps a transaction moving",
        quote: "A delay you understand is manageable. A delay you cannot explain usually is not.",
      },
      {
        subheadA: "The paperwork nobody warns you about",
        subheadB: "How to keep momentum without cutting corners",
        quote: "In property law, slow and documented beats fast and assumed almost every time.",
      },
    ],
    bodyA: [
      "Property transactions in Nigeria involve more institutional steps than most buyers expect going in: verification at the land registry, consent processes that vary by state, and a chain of prior title that has to be confirmed rather than taken on faith. Each step is reasonable on its own. Stacked together, they explain why timelines regularly run past what an agent quotes on day one.",
      "None of this is unique to any one developer or any one part of the country. It is simply how the system is built, and the buyers who move through it with the least friction are the ones who plan for the paperwork from the outset instead of treating it as an afterthought once an offer is accepted.",
    ],
    bodyB: [
      "A good lawyer earns their fee at this stage more than any other. Their job is not just to review documents but to know, from experience, where a particular registry or a particular office tends to slow down, and to start those steps early rather than waiting for a problem to appear.",
      "Buyers can help their own case by responding quickly. Most delays that are actually within a buyer's control come down to slow paperwork on their end: a missing signature, an unconfirmed bank detail, an identification document that needs updating. These are small things, but they add real weeks when they are missed.",
    ],
  },
  "Market Report": {
    variants: [
      {
        subheadA: "What the headline numbers leave out",
        subheadB: "Reading a market instead of a single number",
        quote: "A single yield figure tells you almost nothing about how a property will actually perform.",
      },
      {
        subheadA: "Why comparisons need more context",
        subheadB: "Turning data into a decision",
        quote: "The market does not move as one thing. It moves as many small, different things at once.",
      },
    ],
    bodyA: [
      "Headline comparisons between cities or segments tend to flatten a lot of important detail. Two markets can post similar returns on paper while behaving completely differently in practice, once vacancy, running costs, and the reliability of rent collection are factored in properly.",
      "That is not a reason to distrust market reporting altogether. It is a reason to read it as a starting point for questions rather than a finished conclusion, and to ask what assumptions sit underneath any figure before treating it as decisive.",
    ],
    bodyB: [
      "The more useful exercise, in AVHomes' experience, is comparing like with like: similar unit types, similar locations, similar tenant profiles. Broad citywide averages tend to hide as much as they reveal, because they blend segments that do not actually compete with each other for the same tenant or buyer.",
      "None of this means data should be ignored. It means data works best alongside judgment, not instead of it, and the buyers who do well tend to be the ones asking what sits behind a number rather than the ones simply repeating it.",
    ],
  },
  Sustainability: {
    variants: [
      {
        subheadA: "Where the real savings come from",
        subheadB: "Making the investment case properly",
        quote: "The cheapest energy is the energy a well designed home never has to generate.",
      },
      {
        subheadA: "What changes once the power is reliable",
        subheadB: "Thinking about payback like an investor, not a hobbyist",
        quote: "Reliability changes how a household lives in a home, not just what it costs to run.",
      },
    ],
    bodyA: [
      "Energy costs are one of the few household expenses in Nigeria that a homeowner has real, direct control over, and the gap between a well specified system and a poorly specified one is larger than most first time buyers expect. Sizing, wiring quality, and battery chemistry all matter more than the panel count that tends to dominate the sales conversation.",
      "The households that get the most value tend to be the ones who start from actual usage patterns rather than a generic package. A home that runs air conditioning through the afternoon has a very different ideal setup from one that mostly needs power in the evening, and treating the two the same leads to systems that are either oversized or constantly short.",
    ],
    bodyB: [
      "Payback period is the number everyone asks about first, and it is a fair question, but it depends heavily on what it is being compared against. Measured against a household that was running a generator for several hours a day, the case is usually straightforward. Measured against a grid connection that was already reasonably reliable, it takes longer to prove out.",
      "There is also a quieter benefit that rarely makes it into the payback calculation: a home with dependable power is simply easier to live in and, over time, easier to sell or rent. That is worth something even before the fuel savings are counted.",
    ],
  },
};

const DEFAULT_CONTENT: CategoryContent = {
  variants: [
    {
      subheadA: "What this means in practice",
      subheadB: "Where to go from here",
      quote: "The details are rarely exciting, but they are almost always what decides the outcome.",
    },
    {
      subheadA: "The part most guides skip",
      subheadB: "Keeping the decision grounded",
      quote: "Good decisions in property are usually boring decisions, made early and in writing.",
    },
  ],
  bodyA: [
    "Every property decision looks simpler from a distance than it does once the details arrive. The gap between the two is rarely dramatic. It is usually just a matter of information that was available but not yet gathered, and the buyers who do well tend to be the ones patient enough to gather it before committing.",
    "AVHomes sees this pattern repeat across very different kinds of transactions. The specifics change, but the underlying discipline of asking questions early and getting answers in writing does not.",
  ],
  bodyB: [
    "None of this needs to slow a good decision down. If anything, a clear process speeds things up, because it removes the back and forth that happens when a question surfaces late and has to be resolved under pressure.",
    "The goal is a transaction that feels uneventful in hindsight: well documented, reasonably paced, and free of surprises once it is done.",
  ],
};

interface SynthesizedArticle {
  intro: string;
  subheadA: string;
  bodyA: [string, string];
  quote: string;
  subheadB: string;
  bodyB: [string, string];
  closing: string;
}

function firstSentence(text: string): string {
  const idx = text.indexOf(". ");
  return idx > -1 ? text.slice(0, idx + 1) : text;
}

function restOfExcerpt(text: string): string {
  const idx = text.indexOf(". ");
  return idx > -1 ? text.slice(idx + 2) : "";
}

/** Same slug always lands on the same variant, so re-renders stay stable. */
function seedVariant(slug: string): 0 | 1 {
  const sum = [...slug].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (sum % 2) as 0 | 1;
}

/**
 * Insight has no body field. This builds demo-grade article copy at render
 * time from the post's own title, excerpt, and category, so it never
 * fabricates statistics or findings that were not already in the data.
 */
function synthesizeArticle(insight: Insight): SynthesizedArticle {
  const content = CATEGORY_CONTENT[insight.category] ?? DEFAULT_CONTENT;
  const variant = content.variants[seedVariant(insight.slug)];
  const lead = firstSentence(insight.excerpt);
  const rest = restOfExcerpt(insight.excerpt);
  const closingTail =
    "That is the standard worth holding any property decision to, and it is the standard AVHomes tries to hold its own listings to as well.";

  return {
    intro: `"${insight.title}" starts from a simple observation: ${lead} That is the thread this piece pulls on, and it is worth sitting with for a moment before the detail, because everything below exists to make that one line practical rather than aspirational.`,
    subheadA: variant.subheadA,
    bodyA: content.bodyA,
    quote: variant.quote,
    subheadB: variant.subheadB,
    bodyB: content.bodyB,
    closing: rest ? `${rest} ${closingTail}` : closingTail,
  };
}

export async function generateStaticParams() {
  const insights = await getInsights();
  return insights.map((insight) => ({ slug: insight.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const insights = await getInsights();
  const insight = insights.find((i) => i.slug === slug);
  return { title: insight ? `${insight.title} | AVHomes` : "Insight | AVHomes" };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const insights = await getInsights();
  const insight = insights.find((i) => i.slug === slug);
  if (!insight) notFound();

  const more = insights.filter((i) => i.id !== insight.id).slice(0, 3);
  const article = synthesizeArticle(insight);

  return (
    <>
      <nav aria-label="Breadcrumb" className="border-b border-mist-200 bg-white pb-3 pt-24">
        <div className="mx-auto flex max-w-3xl items-center gap-1.5 overflow-x-auto whitespace-nowrap px-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:px-10">
          <Link href="/" className="shrink-0 transition-colors hover:text-blue-600">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <Link href="/blog" className="shrink-0 transition-colors hover:text-blue-600">
            Insights
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <span className="truncate text-navy-950">{insight.title}</span>
        </div>
      </nav>

      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14 lg:px-10">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700">
            {insight.category}
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
            {insight.title}
          </h1>

          <div className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-6">
            <Image
              src={authorFace(insight)}
              alt={insight.author}
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="text-sm font-semibold text-navy-950">{insight.author}</span>
              <span className="h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
              <span>{formatInsightDate(insight.publishedAt)}</span>
              <span className="h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
              <span>{insight.readMinutes} min read</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14 lg:px-10">
        <Reveal>
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
            <Image
              src={insight.image}
              alt={insight.title}
              fill
              priority
              sizes="(min-width:1024px) 60vw, 92vw"
              className="object-cover"
            />
          </div>
        </Reveal>

        <Reveal delay={80}>
          <article className="mx-auto mt-10 max-w-3xl text-lg leading-relaxed text-ink/80">
            <p>{article.intro}</p>

            <h2 className="mt-10 text-2xl font-bold tracking-tight text-navy-950">
              {article.subheadA}
            </h2>
            <p className="mt-4">{article.bodyA[0]}</p>
            <p className="mt-6">{article.bodyA[1]}</p>

            <blockquote className="mt-10 border-l-2 border-blue-600 pl-6 text-xl italic text-navy-950">
              {article.quote}
            </blockquote>

            <h2 className="mt-10 text-2xl font-bold tracking-tight text-navy-950">
              {article.subheadB}
            </h2>
            <p className="mt-4">{article.bodyB[0]}</p>
            <p className="mt-6">{article.bodyB[1]}</p>

            <p className="mt-6">{article.closing}</p>
          </article>
        </Reveal>

        <div className="mx-auto mt-12 flex max-w-3xl items-center gap-4 border-t border-mist-200 pt-8">
          <span className="text-sm font-semibold text-navy-950">Share</span>
          <div className="flex items-center gap-3">
            <a
              href="#"
              aria-label="Share on LinkedIn"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-mist-200 text-slate-500 transition-colors hover:border-blue-600 hover:text-blue-600"
            >
              <LinkedInIcon className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Share on Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-mist-200 text-slate-500 transition-colors hover:border-blue-600 hover:text-blue-600"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Share on Facebook"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-mist-200 text-slate-500 transition-colors hover:border-blue-600 hover:text-blue-600"
            >
              <FacebookIcon className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Share on X"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-mist-200 text-slate-500 transition-colors hover:border-blue-600 hover:text-blue-600"
            >
              <XIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {more.length > 0 && (
        <section className="border-t border-mist-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tight text-navy-950 sm:text-3xl">
                More insights
              </h2>
            </Reveal>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((item, i) => (
                <Reveal key={item.id} delay={i * 90}>
                  <BlogCard insight={item} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
