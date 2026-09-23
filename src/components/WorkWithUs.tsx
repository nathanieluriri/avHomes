import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Building2, TrendingUp } from "lucide-react";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

/**
 * The two ways in that are not buying: sell for us, or list with us.
 *
 * Both routes existed and neither was reachable from the front door. The
 * marketer card is gated because joining can be closed from the console, and a
 * card leading to "not taking new people right now" is worse than no card.
 */
export default function WorkWithUs({ joinOpen }: { joinOpen: boolean }) {
  return (
    <section className="bg-mist-50 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <Reveal>
          {/* The heading follows the gate. With the marketer card hidden there is
              only one way in, and offering to pay somebody who cannot sign up
              reads as a broken promise. */}
          <SectionHeading
            eyebrow="Work With Us"
            lead={joinOpen ? "There Is More Than One Way To" : "Bring Your Property"}
            accent={joinOpen ? "Work With AV Homes" : "To AV Homes"}
            sub={
              joinOpen
                ? "Earn on the homes you help move, or bring property of your own to the platform."
                : "List with us and reach buyers who already trust what we put in front of them."
            }
          />
        </Reveal>

        <Reveal delay={100}>
          <div
            className={`mt-12 grid gap-6 ${
              joinOpen ? "sm:grid-cols-2" : "mx-auto max-w-xl"
            }`}
          >
            {joinOpen && (
              <Card
                icon={TrendingUp}
                title="Earn As A Marketer"
                body="Bring buyers and tenants to AV Homes and earn commission on every deal you close. Sign people up under you and you earn from theirs as well."
                action="Join the team"
                href="/m/join"
              />
            )}
            <Card
              icon={Building2}
              title="List Your Property"
              body="Own or manage property that is not ours? Apply for an account, add your listings, and our team checks each one before it reaches the site."
              action="Apply to list"
              href="/list-with-us"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Card({
  icon: Icon,
  title,
  body,
  action,
  href,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-mist-200 bg-white p-8 transition-colors hover:border-wine-300"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-wine-50 text-wine-600">
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="mt-6 text-xl font-bold tracking-tight text-plum-950">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-wine-600">
        {action}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-1"
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
