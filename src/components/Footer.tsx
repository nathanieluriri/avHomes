import Link from "next/link";
import Image from "next/image";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "About Us",
    links: [
      { label: "Our Story", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "FAQs", href: "#" },
      { label: "Buying Guide", href: "#" },
      { label: "Renting Guide", href: "#" },
      { label: "Market Reports", href: "#" },
    ],
  },
  {
    title: "Category",
    links: [
      { label: "Villas", href: "/listings?type=Villa" },
      { label: "Apartments", href: "/listings?type=Apartment" },
      { label: "Duplexes", href: "/listings?type=Duplex" },
      { label: "Penthouses", href: "/listings?type=Penthouse" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "Get in Touch", href: "#" },
      { label: "Book a Viewing", href: "#" },
      { label: "Agent Network", href: "#" },
      { label: "Support", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-navy-950 text-white/70">
      {/* Faint architectural photo under a near opaque navy wash, so the footer still carries real imagery without losing text contrast. */}
      <Image
        src="/images/library/exterior-07.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-[0.08]"
      />
      <div className="absolute inset-0 bg-navy-950/95" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-3">
              <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white p-1">
                <Image src="/brand/logo.png" alt="AVHomes" fill className="object-contain" />
              </span>
              <span className="text-xl font-bold tracking-tight text-white">
                AVHomes
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
              Real estate backed by AV Constructions build quality. Vetted
              listings, honest pricing, and agents who know the site as well as
              the street.
            </p>
          </div>

          <div className="lg:text-right">
            <label
              htmlFor="footer-email"
              className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/60"
            >
              Sign Up To Our Newsletter
            </label>
            <form className="mt-3 flex items-center gap-1 rounded-full border border-white/20 bg-white/5 p-1.5 lg:ml-auto lg:w-full lg:max-w-sm">
              <input
                id="footer-email"
                name="email"
                type="email"
                placeholder="Your email address"
                className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Subscribe
              </button>
            </form>
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
                    <Link href={l.href} className="transition-colors hover:text-blue-500">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex gap-3">
          {["IN", "IG", "FB", "X"].map((s) => (
            <span
              key={s}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-[11px] font-semibold uppercase text-white/70 transition-colors hover:border-blue-500 hover:text-blue-500"
            >
              {s}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/15 pt-8 text-xs text-white/50 sm:flex-row">
          <p>&copy; 2026 AVHomes. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="transition-colors hover:text-blue-500">
              Terms
            </Link>
            <Link href="#" className="transition-colors hover:text-blue-500">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
