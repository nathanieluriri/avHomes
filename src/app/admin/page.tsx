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
import { hasDomain, type Domain, type SitePulse } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useSession } from "@/lib/admin/hooks";
import { relative } from "@/lib/admin/format";
import { Badge, Card, ErrorNote, Skeleton } from "@/components/admin/ui";
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

  const user = session.status === "signed-in" ? session.user : null;
  const firstName = user?.displayName.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-8">
      {/*
        A greeting above the banner, even when nothing loaded. A screen whose
        whole body is a red box has thrown away every landmark on it, and the
        rise then animates an empty sheet. The destinations below still work
        without any data, so a failed dashboard is still a launcher.
      */}
      {error && (
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-navy-950">
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
          <PulseStrip pulse={data.pulse} />

          <StorefrontCard user={user} />

          <section>
            <div className="mb-4 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-navy-950">
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

          {hasDomain(user.role, "enquiries") && (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Inbox className="h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-navy-950">Latest enquiries</h2>
                <Link
                  href="/admin/enquiries"
                  className="ml-auto text-[12px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  Open the inbox
                </Link>
              </div>

              {data.recentEnquiries.length === 0 ? (
                <p className="rounded-xl bg-mist-50 px-4 py-6 text-center text-[13px] text-slate-600">
                  Nothing yet. The contact form on the site feeds this.
                </p>
              ) : (
                <ul className="divide-y divide-mist-100">
                  {data.recentEnquiries.map((enquiry) => (
                    <li key={enquiry.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-navy-950">
                        {enquiry.name}
                      </span>
                      <span className="c-num shrink-0 text-[12px] text-slate-600">
                        {relative(enquiry.createdAt)}
                      </span>
                      <Badge tone={enquiry.status === "new" ? "blue" : "neutral"}>
                        {enquiry.status}
                      </Badge>
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
    <Link
      href={item.href}
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white p-5 shadow-card transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-blue-50/40 ${
        item.wide ? "sm:col-span-2" : ""
      }`}
    >
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
        <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>

      <span className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-550">
          {item.label}
        </span>
        {kicker && <Badge tone="blue">{kicker}</Badge>}
      </span>

      <span className="mt-1 text-sm font-semibold text-navy-950">{item.title}</span>
      <span className="mt-1 text-[13px] leading-relaxed text-slate-600">{item.body}</span>

      <ArrowRight
        className="absolute right-4 top-5 h-4 w-4 text-mist-300 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-blue-600"
        aria-hidden="true"
      />
    </Link>
  );
}

/** One line under the greeting, and it only claims what the counts support. */
function summarise(data: Dashboard): string {
  const live = (data.listings["for-sale"] ?? 0) + (data.listings["for-rent"] ?? 0);
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
    <div className="space-y-8" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the dashboard</span>
      <Skeleton className="mx-auto h-14 w-64 rounded-xl" />
      {/* The same aspect ratio the preview uses, plus its header row, so the
          card does not double in height the moment the data lands. A skeleton
          that lies about its size turns the rise into a reflow. */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <Skeleton className="h-12 w-full rounded-none" />
        <Skeleton className="w-full rounded-none" style={{ aspectRatio: "1280 / 820" }} />
      </div>
      <div>
        <Skeleton className="mx-auto mb-4 h-8 w-80 rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={`h-44 rounded-2xl ${index === 0 ? "sm:col-span-2" : ""}`} />
          ))}
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  );
}
