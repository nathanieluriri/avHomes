import Image from "next/image";
import { Star } from "lucide-react";
import { Testimonial } from "@/lib/types";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

/** Portrait per testimonial, indexed so each card gets a distinct face. */
const FACES = [
  "/images/library/person-01.jpg",
  "/images/library/person-02.jpg",
  "/images/library/person-03.jpg",
  "/images/library/person-04.jpg",
];

export default function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section className="py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow="Testimonials"
            lead="Hear From Our Awesome"
            accent="Satisfied Clients"
          />
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <Reveal key={t.id} delay={(i % 2) * 90}>
              <figure className="card-soft flex h-full flex-col overflow-hidden p-6 sm:p-7">
                <div className="flex items-center gap-1 text-wine-600">
                  {Array.from({ length: t.rating }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" strokeWidth={0} />
                  ))}
                  <span className="ml-2 text-sm font-semibold text-plum-950">
                    {t.rating.toFixed(1)}
                  </span>
                </div>

                <blockquote className="mt-4 flex-1 text-base leading-relaxed text-plum-950/80">
                  {t.quote}
                </blockquote>

                <figcaption className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-5">
                  <Image
                    src={FACES[i % FACES.length]}
                    alt={t.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-plum-950">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
