import Link from "next/link";
import Image from "next/image";
import type { SocialPlatform } from "@avhomes/contracts";

/** Nothing linked. For a surface that renders before settings are read. */
const EMPTY_SOCIAL: Record<SocialPlatform, string> = {
  linkedin: "",
  instagram: "",
  facebook: "",
  x: "",
};
import { socialLinksFrom } from "./SocialIcons";
import FooterSubscribe from "./FooterSubscribe";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "About Us",
    links: [
      /* Our Story, Careers and Press were href="#". An honest short column
         beats a long one where most of it does nothing: a reader who clicks
         two dead links stops trusting the third. Put them back when the pages
         exist. */
      { label: "Journal", href: "/posts" },
    ],
  },
  {
    title: "Resources",
    links: [
      /* FAQs, Buying Guide, Renting Guide and Market Reports were all
         href="#". The two guides are worth writing, and when they are they are
         posts, which is where this points. */
      { label: "Guides", href: "/posts" },
    ],
  },
  {
    title: "Category",
    links: [
      { label: "Estates", href: "/listings?type=Estate%20Land" },
      { label: "Villas", href: "/listings?type=Villa" },
      { label: "Apartments", href: "/listings?type=Apartment" },
      { label: "Duplexes", href: "/listings?type=Duplex" },
      { label: "Penthouses", href: "/listings?type=Penthouse" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "Get in Touch", href: "/contact" },
      { label: "Book a Viewing", href: "/contact" },
      { label: "Support", href: "/contact" },
    ],
  },
];

export default function Footer({
  social = EMPTY_SOCIAL,
}: {
  social?: Record<SocialPlatform, string>;
}) {
  const links = socialLinksFrom(social);
  return (
    <footer className="relative overflow-hidden bg-plum-950 text-white/70">
      {/* Faint architectural photo under a near opaque navy wash, so the footer still carries real imagery without losing text contrast. */}
      <Image
        src="/images/library/exterior-07.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.08]"
      />
      <div className="absolute inset-0 bg-plum-950/95" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="flex items-center" aria-label="AVHomes, home">
              {/* The on-dark lockup. The charcoal V of the standard one measures
                  2.3:1 against this ground and all but disappears; both inks are
                  lifted here, the V further than the wine, so the pair keeps the
                  weighting it has on white. The footer has the room the navbar
                  does not, so it runs large enough to actually read the tagline. */}
              <Image
                src="/brand/logo-h-reversed.png"
                alt="AVHomes Ltd"
                width={830}
                height={178}
                className="h-14 w-auto"
              />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
              Real estate backed by AV Constructions build quality. Vetted
              listings, honest pricing, and agents who know the site as well as
              the street.
            </p>
          </div>

          <div className="lg:text-right">
            <FooterSubscribe />
          </div>
        </div>

        <div className="mt-14 grid gap-10 border-t border-white/15 pt-12 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
                {col.title}
              </h4>
              <ul className="mt-5 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition-colors hover:text-wine-500">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Hidden entirely when nothing is set, rather than drawn as an empty
            row of nothing. */}
        {links.length > 0 && (
        <div className="mt-12 flex gap-3">
          {links.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:border-wine-500 hover:text-wine-500"
            >
              <Icon className="h-4 w-4" />
            </a>
          ))}
        </div>
        )}

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/15 pt-8 text-xs text-white/50 sm:flex-row">
          <p>&copy; 2026 AVHomes. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/terms" className="transition-colors hover:text-wine-500">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-wine-500">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
