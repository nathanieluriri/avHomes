import Image from "next/image";
import { SiteStat } from "@/lib/types";
import Counter from "./Counter";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

export default function WhyChooseUs({ stats }: { stats: SiteStat[] }) {
  return (
    <section id="about" className="bg-mist-50 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow="Why AVHomes"
            lead="Your Journey To The Perfect Home"
            accent="Starts With Us"
            sub="Backed by AV Constructions build quality, our team pairs deep local market knowledge with hands on site experience. We know how a house is put together, not just how it is priced."
          />
        </Reveal>

        <Reveal delay={100}>
          <div className="relative mt-12 overflow-hidden rounded-2xl">
            <Image
              src="/images/library/team-01.jpg"
              alt="The AVHomes advisory team"
              width={1600}
              height={800}
              className="h-[280px] w-full object-cover sm:h-[380px] lg:h-[440px]"
            />
          </div>
        </Reveal>

        <Reveal delay={160}>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-mist-200 bg-mist-200 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-white px-6 py-8 text-center">
                <p className="text-3xl font-bold tracking-tight text-navy-950 lg:text-4xl">
                  <Counter value={s.value} prefix={s.prefix} suffix={s.suffix} />
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
