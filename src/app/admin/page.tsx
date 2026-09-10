"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Images,
  Inbox,
  Newspaper,
  Users,
  type LucideIcon,
} from "lucide-react";
import { hasDomain, type Domain, type SiteAlert, type SitePulse } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useSession } from "@/lib/admin/hooks";
import { relative } from "@/lib/admin/format";
import { Badge, Card, ErrorNote, Skeleton } from "@/components/admin/ui";
import { AlertBanner } from "@/components/admin/Alerts";
import { PulseStrip } from "@/components/admin/PulseStrip";
import { StorefrontCard } from "@/components/admin/StorefrontCard";

/**
 * The console's front door, and it holds no table.
 *
 * That is the rule this screen exists to demonstrate: a table here would be a
 * second Listings screen, and the real one is one click away. Home is a
 * LAUNCHER. It answers three questions in order, top to bottom: is anyone on
 * the site, what does the site look like right now, and what is worth doing
 * next.
 *
 * BELOW `sm` IT ANSWERS THEM IN THE OPPOSITE ORDER, and the word launcher is
 * why. On a desk the pulse and the storefront are a glance on the way past. On
 * a 360px screen they are a strip, then a picture of the homepage, and the
 * first thing a finger can actually go somewhere with started 700px down: two
 * screens of scroll past two things nobody can touch, to reach the thing the
 * page exists for. So the destinations come first there and the briefing
 * follows them, by `order` on the flex column rather than by two markups.
 *
 * The destination cards carry live counts in their kicker, which is what turns
 * a menu into a briefing. "Enquiries" reads "Enquiries" on a quiet day and
 * "3 new" when there is something to answer, without adding a badge, a bell, or
 * any other chrome that has to be maintained separately from the number.
 */

interface Dashboard {
  listings: Record<string, number>;
  posts: Record<string, number>;
  enquiries: { new: number; open: number; closed: number; spam: number };
  recentEnquiries: { id: string; name: string; status: string; createdAt: number }[];
  pulse: SitePulse;
}

interface Destination {
  href: string;
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
  domain: Domain;
  /** Live state for the kicker, or null when there is nothing worth saying. */
  kicker: (data: Dashboard) => string | null;
  /** Takes two columns. Listings gets it because listings are the job, and
   *  because a uniform grid of five equal cards reads as a settings page. */
  wide?: boolean;
}

const DESTINATIONS: readonly Destination[] = [
  {
    href: "/admin/properties",
    label: "Listings",
    title: "Work through the listings",
    body: "Publish what is ready, price what is not, and clear the drafts that have been sitting.",
    icon: Building2,
    domain: "listings",
    kicker: (d) => (d.listings.draft ? `${d.listings.draft} in draft` : null),
    wide: true,
  },
  {
    href: "/admin/enquiries",
    label: "Enquiries",
    title: "Answer the buyers",
    body: "Everything the contact form has taken in, oldest first.",
    icon: Inbox,
    domain: "enquiries",
    kicker: (d) => (d.enquiries.new ? `${d.enquiries.new} new` : null),
  },
  {
    href: "/admin/posts",
    label: "Journal",
    title: "Write something",
    body: "Articles and their revisions.",
    icon: Newspaper,
    domain: "content",
    kicker: (d) => (d.posts.draft ? `${d.posts.draft} in draft` : null),
  },
  {
    href: "/admin/images",
    label: "Images",
    title: "The photo library",
    body: "Every image a listing or a post can draw on.",
    icon: Images,
    domain: "media",
    kicker: () => null,
  },
  {
    href: "/admin/team",
    label: "Team",
    title: "Who can sign in",
    body: "Invite somebody, or change what a role may touch.",
    icon: Users,
    domain: "team",
    kicker: () => null,
  },
];

export default function DashboardPage() {
  const { session } = useSession();
  const { data, error, loading, reload } = useAsync<Dashboard>(
    (signal) => api.get<Dashboard>("/admin/dashboard", signal),
    [],
  );

  /*
   * A SECOND, INDEPENDENT read rather than another field on the dashboard
   * payload. The alerts page and the rail both want this list without the
   * counts, and a launcher that fails to render its destinations because a
   * health check timed out has broken the one thing it is for. Its error is
   * swallowed on purpose: a missing banner is a quiet degradation, and there is
   * already a red box on this screen for the read that matters.
   */
  const { data: health } = useAsync<{ alerts: SiteAlert[] }>(
    (signal) => api.get<{ alerts: SiteAlert[] }>("/admin/health", signal),
    [],
  );

  const user = session.status === "signed-in" ? session.user : null;
  const firstName = user?.displayName.trim().split(/\s+/)[0] ?? "";

  return (
    /* A flex column rather than `space-y-8`, so the loaded branch below can put
       the destinations first on a phone with `order` and leave the desktop
       sequence exactly as it is. The two produce the same 32px rhythm. */
    <div className="flex flex-col gap-8">
      {/* Above everything, on a phone as well. The rest of this screen is a
          briefing that reorders itself around what a thumb can reach; this is
          the one block that is already a list of things to press. */}
      {health && health.alerts.length > 0 && (
        <div className="order-first">
          <AlertBanner alerts={health.alerts} />
        </div>
      )}

      {/*
        A greeting above the banner, even when nothing loaded. A screen whose
        whole body is a red box has thrown away every landmark on it, and the
        rise then animates an empty sheet. The destinations below still work
        without any data, so a failed dashboard is still a launcher.
      */}
      {error && (
        <div className="space-y-4">
          <div className="text-center">
            {/* 20px on a phone. Centred at 24px this ran to three lines and
                read as a banner rather than a title. */}
            <h1 className="text-xl font-bold tracking-tight text-plum-950 sm:text-2xl">
              {firstName ? `${firstName}, something is not answering` : "Something is not answering"}
            </h1>
            <p className="mt-1 text-[13px] text-slate-600">
              The console is fine. The screens below still open.
            </p>
          </div>
          <ErrorNote error={error} onRetry={reload} />
          {user && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DESTINATIONS.filter((item) => hasDomain(user.role, item.domain)).map((item) => (
                <DestinationCard key={item.href} item={item} data={null} />
              ))}
            </div>
          )}
        </div>
      )}

      {/*
        `!user` is part of the loading condition, not a separate branch. The
        session comes from a second, independent useSession(), so when the
        dashboard read resolved first this rendered an empty div: no skeleton,
        no content, a blank frame for as long as /auth/me took.
      */}
      {(loading || !user) && !error && <DashboardSkeleton />}

      {data && user && (
        <>
          <div className="order-2 sm:order-1">
            <PulseStrip pulse={data.pulse} />
          </div>

          <div className="order-3 sm:order-2">
            <StorefrontCard user={user} />
          </div>

          <section className="order-1 sm:order-3">
            <div className="mb-4 text-center">
              <h1 className="text-xl font-bold tracking-tight text-plum-950 sm:text-2xl">
                {firstName ? `${firstName}, what` : "What"} do you want to work on next?
              </h1>
              <p className="mt-1 text-[13px] text-slate-600">
                {summarise(data)}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DESTINATIONS.filter((item) => hasDomain(user.role, item.domain)).map((item) => (
                <DestinationCard key={item.href} item={item} data={data} />
              ))}
            </div>
          </section>

          {/* `order-4` explicitly: the three above it carry orders 1 to 3, and
              an unordered item defaults to 0, which would have put the inbox
              card at the top of the phone layout. */}
          {hasDomain(user.role, "enquiries") && (
            <Card className="order-4">
              <div className="mb-3 flex items-center gap-2">
                <Inbox className="h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-plum-950">Latest enquiries</h2>
                <Link
                  href="/admin/enquiries"
                  /* A real box below sm, pulled right by its own padding so it
                     still sits flush with the card edge. This is the card's
                     only navigation and it was an 84 by 16px run of text. */
                  className="-mr-2 ml-auto inline-flex h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-wine-600 hover:text-wine-700 sm:mr-0 sm:h-auto sm:px-0 sm:text-[12px]"
                >
                  Open the inbox
                </Link>
              </div>

              {data.recentEnquiries.length === 0 ? (
                <p className="rounded-xl bg-mist-50 px-4 py-6 text-center text-[13px] text-slate-600">
                  Nothing yet. The contact form on the site feeds this.
                </p>
              ) : (
                /*
                  The row is a LINK, and below sm the meta drops to a second
                  line. As a static row it showed who wrote in, truncated the
                  name to about 160px once the timestamp and the badge had taken
                  their share, and then refused the tap: the only way into any of
                  these was the link in the card head. A full name on its own
                  line and a 44px row fixes both at once.
                */
                <ul className="divide-y divide-mist-100">
                  {data.recentEnquiries.map((enquiry) => (
                    <li key={enquiry.id} className="first:[&>a]:pt-0 last:[&>a]:pb-0">
                      <Link
                        href={`/admin/enquiries/${enquiry.id}`}
                        className="flex min-h-11 flex-col items-start justify-center gap-0.5 py-2 transition-colors active:bg-mist-50 sm:min-h-0 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <span className="w-full text-[13px] font-medium text-plum-950 sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate">
                          {enquiry.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="c-num text-[12px] text-slate-600">
                            {relative(enquiry.createdAt)}
                          </span>
                          <Badge tone={enquiry.status === "new" ? "wine" : "neutral"}>
                            {enquiry.status}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A destination, drawn as a card that says what the job is rather than naming
 * the screen twice. The kicker carries live state, so the card becomes a
 * notification without any extra chrome.
 */
function DestinationCard({ item, data }: { item: Destination; data: Dashboard | null }) {
  // Null on the error branch: the destination still works, it just has no live
  // state to advertise, and an invented kicker would be worse than none.
  const kicker = data ? item.kicker(data) : null;
  return (
    /*
      Two shapes. Stacked and roomy from sm up, where five of these are a grid
      and the body copy is what turns a menu into a briefing. Horizontal and
      tighter below it, where the same five are a single column: at `p-5` around
      a 36px tile with three lines under it they came to 780px of scroll, which
      is the launcher costing more to read than the screens it launches.

      The pressed states are not decoration either. Every affordance here was a
      hover, and a hover never fires on a thumb, so a tap produced no feedback at
      all until the next route painted and the operator tapped again. The lift is
      the one thing kept behind a real hover query, because a sticky :hover after
      a tap strands the card half a step off the grid.
    */
    <Link
      href={item.href}
      className={`group relative flex flex-row items-start gap-3 overflow-hidden rounded-2xl bg-white p-4 shadow-card transition-[transform,background-color] duration-200 hover:bg-wine-50/40 active:bg-wine-50/70 sm:flex-col sm:items-stretch sm:gap-0 sm:p-5 [@media(hover:hover)]:hover:-translate-y-0.5 ${
        item.wide ? "sm:col-span-2" : ""
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-wine-50 text-wine-600 transition-colors group-hover:bg-wine-600 group-hover:text-white group-active:bg-wine-600 group-active:text-white sm:mb-3">
        <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>

      {/* The arrow is absolutely positioned at the top right, so the text column
          keeps clear of it on the horizontal shape. */}
      <span className="flex min-w-0 flex-1 flex-col pr-6 sm:contents sm:pr-0">
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-550">
            {item.label}
          </span>
          {kicker && <Badge tone="wine">{kicker}</Badge>}
        </span>

        <span className="mt-1 text-sm font-semibold text-plum-950">{item.title}</span>
        {/* Orientation copy earns its space in a three column grid and costs a
            screen of scroll in a single column one, so a phone gets two lines
            of it rather than none. */}
        <span className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-600 sm:line-clamp-none">
          {item.body}
        </span>
      </span>

      <ArrowRight
        className="absolute right-4 top-4 h-4 w-4 text-mist-300 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-wine-600 group-active:text-wine-600 sm:top-5"
        aria-hidden="true"
      />
    </Link>
  );
}

/** One line under the greeting, and it only claims what the counts support. */
function summarise(data: Dashboard): string {
  const live = data.listings.live ?? 0;
  const parts = [`${live} ${live === 1 ? "listing" : "listings"} on the site`];
  if (data.enquiries.new > 0) {
    parts.push(`${data.enquiries.new} unanswered ${data.enquiries.new === 1 ? "enquiry" : "enquiries"}`);
  }
  if (data.pulse.live > 0) {
    parts.push(`${data.pulse.live} reading right now`);
  }
  return `${parts.join(", ")}.`;
}

/**
 * The shape the screen will land in, not a spinner. The layout is known before
 * the data is, so the wait can show it and the page does not jump on arrival.
 */
function DashboardSkeleton() {
  return (
    /* The same flex column and the same `order` as the loaded screen, or the
       arrival would reshuffle the page as well as fill it. */
    <div className="flex flex-col gap-8" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the dashboard</span>
      {/* `max-w-64` rather than `w-64`. A fixed 256px block sits 32px from the
          content column at 360px and overflows it outright at 320px, so the
          loading state briefly gave the console a horizontal scrollbar. */}
      <Skeleton className="order-2 mx-auto h-14 w-full max-w-64 rounded-xl sm:order-1" />

      {/*
        The shape the storefront card will land in, at both widths, because a
        skeleton that lies about its size turns the rise into a reflow. The
        header is two stacked rows on a phone and one from sm up. Under it the
        phone reserves the 44px button that offers the preview, and sm up
        reserves the frame itself: from 640px the card is at least 592px wide,
        which is always the 1280 by 820 desktop frame rather than the phone one.
      */}
      <div className="order-3 overflow-hidden rounded-2xl bg-white shadow-card sm:order-2">
        <Skeleton className="h-[5.25rem] w-full rounded-none sm:h-12" />
        <Skeleton className="h-11 w-full rounded-none sm:aspect-[1280/820] sm:h-auto" />
      </div>

      <div className="order-1 sm:order-3">
        <Skeleton className="mx-auto mb-4 h-8 w-full max-w-80 rounded-lg" />
        {/* Three below sm, five from sm up. Five phone-shaped cards is still
            two screens of shimmer for a page whose data is a handful of
            counts, and the two that never paint are the two nobody waits for. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton
              key={index}
              className={`h-28 rounded-2xl sm:h-44 ${index > 2 ? "hidden sm:block" : ""} ${
                index === 0 ? "sm:col-span-2" : ""
              }`}
            />
          ))}
        </div>
      </div>

      <Skeleton className="order-4 h-28 w-full rounded-2xl" />
    </div>
  );
}
