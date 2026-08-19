import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";

export default function CTABanner() {
  return (
    <section id="contact" className="px-6 pb-20 lg:px-10 lg:pb-24">
      <Reveal>
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl">
          <Image
            src="/images/library/exterior-12.jpg"
            alt="Modern home exterior"
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/75 to-navy-950/40" />

          <div className="relative px-8 py-16 sm:px-12 lg:px-16 lg:py-24">
            <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              Start Your Property <span className="accent text-blue-300">Journey Today</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
              Tell us what you are looking for and a dedicated agent will reach
              out within one business day.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/listings"
                className="group inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Get Started
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  strokeWidth={2}
                />
              </Link>
              <Link
                href="#insights"
                className="rounded-full border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
