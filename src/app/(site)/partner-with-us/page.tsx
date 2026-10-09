import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, HandCoins, Share2, UserPlus } from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import WorkWithUs from "@/components/WorkWithUs";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/api-config";
import { getMarketerJoinOpen } from "@/lib/data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `Partner With Us | ${SITE_NAME}`,
  description:
    "Become an AV Homes Property Partner and earn from successful deals, or list your own property with us and reach buyers who trust what we show them.",
  alternates: { canonical: "/partner-with-us" },
  openGraph: {
    title: `Partner With Us | ${SITE_NAME}`,
    description: "Earn from successful deals as a Property Partner, or list your property with AV Homes.",
    url: `${SITE_DOMAIN}/partner-with-us`,
  },
};

const STEPS = [
  {
    icon: UserPlus,
    title: "Join for free",
    body: "Sign up in a few minutes on your phone. There is nothing to pay to become a partner.",
  },
  {
    icon: Share2,
    title: "Share homes and introduce buyers",
    body: "Send our vetted listings to the people you know, or log a buyer and let our team take it from there.",
  },
  {
    icon: HandCoins,
    title: "Earn when the deal closes",
    body: "When a buyer you brought pays, your commission is approved and paid into your bank account.",
  },
];

export default async function PartnerWithUsPage() {
  const joinOpen = await getMarketerJoinOpen();

  return (
    <>
      <section className="px-4 pt-4 sm:px-6 lg:px-10">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl">
          <Image
            src="/images/library/team-02.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-plum-950/90 via-plum-950/75 to-plum-950/40" />

          <div className="relative px-6 py-20 sm:px-12 lg:px-16 lg:py-28">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-300">Partner with us</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Grow With <span className="accent text-wine-300">AV Homes</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              {joinOpen
                ? "Earn from successful deals by connecting people to homes we have checked on the ground, or bring your own property to buyers who already trust us."
                : "Bring your property to buyers who already trust what we put in front of them."}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {joinOpen && (
                <Link
                  href="/m/join"
                  className="group inline-flex items-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
                >
                  Become a Partner
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
                </Link>
              )}
              <Link
                href="/list-with-us"
                className={
                  joinOpen
                    ? "rounded-full border border-white/35 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
                    : "group inline-flex items-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
                }
              >
                List Your Property
              </Link>
            </div>

            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
              {["Every listing verified", "Marketing support", "Paid on successful deals"].map((point) => (
                <li key={point} className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-wine-300" strokeWidth={2} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <WorkWithUs joinOpen={joinOpen} />

      {joinOpen && (
        <section className="py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <Reveal>
              <SectionHeading
                eyebrow="How it works"
                lead="Becoming A Property Partner"
                accent="Takes Three Steps"
              />
            </Reveal>
            <Reveal delay={100}>
              <ol className="mt-12 grid gap-6 md:grid-cols-3">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="rounded-2xl border border-mist-200 bg-white p-8">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-wine-50 text-wine-600">
                        <step.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="text-sm font-semibold text-wine-600">Step {index + 1}</span>
                    </div>
                    <h3 className="mt-6 text-xl font-bold tracking-tight text-plum-950">{step.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ol>
            </Reveal>
            <div className="mt-10 text-center">
              <Link
                href="/m/join"
                className="group inline-flex items-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700"
              >
                Start earning with AV Homes
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
