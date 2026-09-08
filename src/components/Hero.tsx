import Link from "next/link";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="px-4 pt-4 lg:px-6 lg:pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-plum-950">
        <Image
          src="/images/library/exterior-02.jpg"
          alt="Modern home at dusk"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-plum-950/70 via-plum-950/50 to-plum-950/85" />

        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-32 lg:py-40">
          <p className="text-sm font-medium tracking-[0.06em] text-white/85 sm:text-base">
            Buy. Sell. Rent.
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Real Estate <span className="accent text-wine-300">Done Right</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/75">
            AVHomes lists vetted homes across Lagos and Abuja, backed by the build
            quality of AV Constructions. Every listing is checked before it reaches you.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/listings"
              className="rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
            >
              Browse Listings
            </Link>
            <Link
              href="#contact"
              className="rounded-full border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
            >
              Talk to an Agent
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
