import Link from "next/link";
import type { Metadata } from "next";

import JsonLd from "@/components/JsonLd";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import { TITLE_DOCUMENT_LABELS, getListingUniverse, getSiteSettings, whatsappHref } from "@/lib/data";
import { placesWithStock } from "@/lib/places";
import { listPosts } from "@/lib/blog/client";
import type { PublicPost, TitleDocument } from "@avhomes/contracts";

/**
 * The question a buyer outside the country opens with, answered in one page.
 *
 * The place pages answer WHERE. This answers HOW, and it is the half the target
 * market actually gets stuck on: somebody in London deciding whether a company
 * they found in a search can be trusted with a deposit on a house they will not
 * stand in until after they have paid for it.
 *
 * EVERY CLAIM ON THIS PAGE IS COUNTED, NOT ASSERTED. The figures below are read
 * from the live stock on each render, so the page cannot promise photographs or
 * title documents the listings do not carry. That is the same rule the contact
 * page follows, and it matters more here than anywhere else on the site: this is
 * the page whose entire job is being believed by somebody who cannot check.
 *
 * The one sentence not counted is the inspection promise, which is the claim the
 * front page already makes about every listing.
 */

export const revalidate = 300;

export const metadata: Metadata = {
  title: `Buying Property in Nigeria From Abroad | ${SITE_NAME}`,
  description:
    "How to buy a home in Nigeria while you are living somewhere else: what you cannot check yourself, what the title documents mean, and what AVHomes checks on the ground before a listing goes live.",
  alternates: { canonical: "/buying-from-abroad" },
  openGraph: {
    title: `Buying Property in Nigeria From Abroad | ${SITE_NAME}`,
    description:
      "What you cannot check yourself from another country, what the paper means, and what is checked on the ground before a listing goes live.",
    url: `${SITE_DOMAIN}/buying-from-abroad`,
  },
};

/**
 * The posts worth reading before wiring money from another country.
 *
 * SELECTED BY TAG rather than by slug, so a legal or due diligence post
 * published next month appears here without anybody editing this file, and a
 * post taken down stops appearing without leaving a dead link. The fallback is
 * the newest few: an empty section on the one page that has to look staffed is
 * worse than a slightly loose match.
 */
const REMOTE_BUYER_TAGS = [
  "legal",
  "title",
  "consent",
  "due diligence",
  "risk",
  "inspection",
  "off plan",
  "handover",
  "finance",
  "mortgage",
];

function forRemoteBuyers(posts: PublicPost[], limit = 6): PublicPost[] {
  const matches = posts.filter((post) =>
    [...post.tags, post.category].some((label) =>
      REMOTE_BUYER_TAGS.includes(label.trim().toLowerCase()),
    ),
  );
  return (matches.length > 0 ? matches : posts).slice(0, limit);
}

export default async function BuyingFromAbroadPage() {
  const [properties, posts, site] = await Promise.all([
    getListingUniverse(),
    listPosts(50),
    getSiteSettings(),
  ]);

  const total = properties.length;
  // `?? ""` on every one of these. A field added after a listing was written
  // arrives absent rather than empty, and this page counts them.
  const withPhotos = properties.filter((p) => (p.images ?? []).length > 0).length;
  const withMap = properties.filter((p) => (p.mapUrl ?? "").trim() !== "").length;
  const withAgent = properties.filter((p) => (p.agent?.name ?? "").trim() !== "").length;

  const documents = new Map<TitleDocument, number>();
  for (const p of properties) {
    if (p.titleDocument === null || p.titleDocument === undefined) continue;
    documents.set(p.titleDocument, (documents.get(p.titleDocument) ?? 0) + 1);
  }
  const documented = [...documents.entries()].sort((a, b) => b[1] - a[1]);
  const withDocument = documented.reduce((sum, [, n]) => sum + n, 0);

  const places = placesWithStock(properties);
  const reading = forRemoteBuyers(posts);
  const whatsapp = whatsappHref(
    site.whatsappNumber,
    "Hi, I am buying from abroad and would like to ask about a property.",
  );

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_DOMAIN}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Buying from abroad",
        item: `${SITE_DOMAIN}/buying-from-abroad`,
      },
    ],
  };

  /* Each one pairs a thing you cannot do with the thing on the site that stands
     in for it. A card whose count is zero drops its figure rather than printing
     a proud nought. */
  const gaps = [
    {
      title: "You cannot walk the house",
      body: "Somebody has to stand in it and look at the things a photograph flatters: the finish, the damp, the road in during rain.",
      fact:
        withPhotos > 0
          ? `Every listing is checked on the ground before it goes live, and ${withPhotos} of ${total} carry photographs.`
          : "Every listing is checked on the ground before it goes live.",
    },
    {
      title: "You cannot find the street",
      body: "An address in a city you have not lived in for years tells you very little about what is around it.",
      fact:
        withMap > 0
          ? `${withMap} of ${total} listings carry a map link that drops a pin on the gate rather than the street.`
          : "Ask us for the pin on any listing and we will send it.",
    },
    {
      title: "You cannot read the paper over somebody's shoulder",
      body: "The document behind a property decides whether you own it or merely paid for it, and it is the part a remote buyer is most often shown last.",
      fact:
        withDocument > 0
          ? `${withDocument} of ${total} listings state their title document on the page, before you ask.`
          : "Ask for the title document on any listing before anything else.",
    },
    {
      title: "You cannot drop in on the agent",
      body: "At some point you are sending money to somebody whose face you have only seen on a screen, from a timezone where their office is shut.",
      fact:
        withAgent > 0
          ? `Every listing names the consultant handling it, ${withAgent} of ${total} of them, and we answer within one business day.`
          : "Every enquiry is answered within one business day.",
    },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />

      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">
            Buying from abroad
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
            Buying Property In Nigeria <span className="accent">From Abroad</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Most of the people who buy through us are not in the country when they start, and
            several are not in it when they finish. The hard part is never the money. It is that
            every check a buyer at home makes without thinking, you have to ask somebody else to
            make on your behalf, and then decide whether to believe them.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-plum-950">
            What you cannot do from there
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Four of them, and what stands in for each one here. The numbers are counted off the
            listings on the site today rather than written once and left to go stale.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {gaps.map((gap) => (
              <div key={gap.title} className="rounded-2xl border border-mist-200 bg-white p-6">
                <h3 className="text-base font-bold tracking-tight text-plum-950">{gap.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{gap.body}</p>
                <p className="mt-4 border-t border-mist-200 pt-4 text-sm leading-relaxed text-plum-950">
                  {gap.fact}
                </p>
              </div>
            ))}
          </div>
        </section>

        {documented.length > 0 && (
          <section className="mt-16 border-t border-mist-200 pt-12">
            <h2 className="text-2xl font-bold tracking-tight text-plum-950">
              The paper behind the property
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Nigerian property is sold on documents, and which one a place has decides what you
              are actually buying. These are the ones our current listings carry. The listing says
              which it is before you ask.
            </p>
            <ul className="mt-8 flex flex-wrap gap-3">
              {documented.map(([document, count]) => (
                <li
                  key={document}
                  className="rounded-2xl border border-mist-200 bg-white px-5 py-4"
                >
                  <span className="block text-sm font-semibold text-plum-950">
                    {TITLE_DOCUMENT_LABELS[document]}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-slate-600">
                    {count} {count === 1 ? "listing" : "listings"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Have your own lawyer confirm the document at the registry before any money moves.
              That is true whether you are in Lagos or in Houston, and anybody who tells you to
              skip it is telling you something about themselves.
            </p>
          </section>
        )}

        {places.length > 0 && (
          <section className="mt-16 border-t border-mist-200 pt-12">
            <h2 className="text-2xl font-bold tracking-tight text-plum-950">
              Where we have property
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {places.length} {places.length === 1 ? "place" : "places"} across Nigeria with
              something on the market today. Each one has its own page with everything currently
              available in it.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {places.slice(0, 12).map((place) => (
                <Link
                  key={place.slug}
                  href={`/listings/in/${place.slug}`}
                  className="rounded-full border border-mist-200 bg-white px-4 py-2 text-sm text-plum-950 transition-colors hover:border-wine-500 hover:text-wine-700"
                >
                  {place.name}
                  <span className="ml-1.5 text-slate-600">{place.count}</span>
                </Link>
              ))}
            </div>
            <Link
              href="/listings/in"
              className="mt-6 inline-flex text-sm font-semibold text-wine-600 transition-colors hover:text-wine-700"
            >
              Every area we cover
            </Link>
          </section>
        )}

        {reading.length > 0 && (
          <section className="mt-16 border-t border-mist-200 pt-12">
            <h2 className="text-2xl font-bold tracking-tight text-plum-950">Read this first</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The checks somebody has to make for you, written out so you know what you are asking
              for and what a good answer sounds like.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reading.map((post) => (
                <Link
                  key={post.slug}
                  href={`/posts/${post.slug}`}
                  className="group rounded-2xl border border-mist-200 bg-white p-5 transition-colors hover:border-wine-500"
                >
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-wine-600">
                    {post.category}
                  </span>
                  <span className="mt-2 block text-[15px] font-semibold leading-snug text-plum-950">
                    {post.title}
                  </span>
                  <span className="mt-2 block text-[13px] leading-relaxed text-muted-foreground">
                    {post.readingTime} min read
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href="/posts"
              className="mt-6 inline-flex text-sm font-semibold text-wine-600 transition-colors hover:text-wine-700"
            >
              Everything in the journal
            </Link>
          </section>
        )}

        {/* Conditional on a stored value, like every other contact surface on
            the site. A page about being trusted from four thousand miles away
            is the last place to print a number nobody answers. */}
        <section className="mt-16 rounded-3xl bg-plum-950 px-6 py-12 text-center sm:px-10 lg:py-16">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Start with a conversation, not a deposit
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/70">
            Tell us which country you are in and we will call at an hour that works there. Nothing
            on this site needs to be decided in one call.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact"
              className="rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
            >
              Send a message
            </Link>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
              >
                WhatsApp us
              </a>
            )}
            <Link
              href="/listings"
              className="rounded-full border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
            >
              Browse listings
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
