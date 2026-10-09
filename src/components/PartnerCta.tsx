import Link from "next/link";
import { ArrowRight, Handshake } from "lucide-react";
import Reveal from "./Reveal";

export default function PartnerCta({ joinOpen }: { joinOpen: boolean }) {
  return (
    <section className="px-6 pb-20 lg:px-10 lg:pb-24">
      <Reveal>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-3xl border border-mist-200 bg-mist-50 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-wine-50 text-wine-600 ring-1 ring-wine-100">
              <Handshake className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">Partner with us</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-plum-950 sm:text-3xl">
                {joinOpen ? "Earn from successful deals, or list your property" : "Bring your property to AV Homes"}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {joinOpen
                  ? "Become a Property Partner and get paid when buyers you introduce close, or let our team market your home."
                  : "List with us and reach buyers who already trust what we put in front of them."}
              </p>
            </div>
          </div>
          <Link
            href="/partner-with-us"
            className="group inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 lg:self-center"
          >
            Partner With Us
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
