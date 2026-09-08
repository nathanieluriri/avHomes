"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { ENQUIRY_STATUSES, type Enquiry, type EnquiryStatus, type Page } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useCursorStack } from "@/lib/admin/hooks";
import { humanise, initials, relative } from "@/lib/admin/format";
import { Badge, Button, EmptyState, ErrorNote, PageHeader, type Tone } from "@/components/admin/ui";
import {
  DataTable,
  IdCell,
  TablePager,
  TableToolbar,
  type Column,
} from "@/components/admin/DataTable";

/**
 * The enquiry inbox.
 *
 * A list, not a stack of cards with every message and every control expanded at
 * once. The old screen rendered the full body and six buttons per enquiry, so
 * ten enquiries were ten screens of scrolling and no way to see the shape of
 * the queue. Reading one and acting on it is its own route.
 *
 * `new` is the default tab, because the reason to open this screen is almost
 * always the thing nobody has answered yet.
 */

const TABS = [
  { value: "all", label: "All" },
  ...ENQUIRY_STATUSES.map((status) => ({ value: status, label: capitalise(status) })),
] as const;

const TONE: Record<EnquiryStatus, Tone> = {
  new: "wine",
  open: "amber",
  closed: "neutral",
  spam: "red",
};

export default function EnquiriesPage() {
  const [tab, setTab] = useState<"all" | EnquiryStatus>("new");
  const [filter, setFilter] = useState("");

  /* Keyset paging, and the reset that goes with a changed filter, both
     live in one hook so three list screens cannot drift apart. */
  const paging = useCursorStack();

  function refilter(apply: () => void) {
    apply();
    paging.reset();
  }

  const { data, error, loading, reload } = useAsync<Page<Enquiry>>(
    (signal) =>
      api.get<Page<Enquiry>>(
        `/admin/enquiries?${new URLSearchParams({
          limit: "25",
          ...(tab === "all" ? {} : { status: tab }),
          ...(paging.cursor ? { cursor: paging.cursor } : {}),
        })}`,
        signal,
      ),
    [tab, paging.cursor],
  );

  /*
   * THE BOX FILTERS THE LOADED PAGE, and its placeholder says so.
   *
   * The enquiries endpoint takes a status and a cursor and nothing else: it has
   * no search. A box labelled "Search enquiries" that quietly looked at 25 rows
   * would be a control that searches less than it appears to, which is worse
   * than one that states its scope.
   */
  const needle = filter.trim().toLowerCase();
  const rows = (data?.items ?? []).filter(
    (enquiry) =>
      needle === "" ||
      enquiry.name.toLowerCase().includes(needle) ||
      enquiry.email.toLowerCase().includes(needle) ||
      enquiry.message.toLowerCase().includes(needle),
  );

  /*
   * WHICH EMPTY STATE, and the answer is not "is this the default tab".
   *
   * Keying it off `tab !== "new"` was wrong in both directions, because the
   * default tab is itself a filter. An inbox holding thirty closed enquiries
   * and none new opened on New, matched nothing, and painted the illustrated
   * first-run shelf over a full inbox. A genuinely empty inbox, one click onto
   * All, painted "no enquiry has this status" about a tab that is not a status.
   *
   * A status IS a filter, so it is `all` with nothing typed that means the
   * account is empty. Same rule the listings screen uses.
   */
  const filtered = tab !== "all" || needle !== "";

  const columns: Column<Enquiry>[] = [
    {
      key: "from",
      header: "From",
      primary: true,
      render: (enquiry) => (
        <IdCell
          thumb={<span className="text-[11px] font-bold">{initials(enquiry.name)}</span>}
          title={enquiry.name}
          meta={enquiry.email}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      render: (enquiry) => <Badge tone={TONE[enquiry.status]}>{humanise(enquiry.status)}</Badge>,
    },
    {
      key: "message",
      header: "Message",
      // Kept on the phone card. Without it the inbox at 375px is names, badges
      // and times with no hint of what anybody actually asked, which is the one
      // thing this screen exists to show.
      mobile: "keep",
      render: (enquiry) => (
        <span className="line-clamp-1 max-w-[22rem] text-slate-600">{enquiry.message}</span>
      ),
    },
    {
      key: "about",
      header: "About",
      render: (enquiry) => (
        <span className="text-slate-600">{enquiry.propertySlug ?? "General"}</span>
      ),
    },
    {
      key: "received",
      header: "Received",
      numeric: true,
      mobile: "keep",
      render: (enquiry) => <span className="text-slate-600">{relative(enquiry.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        icon={Inbox}
        title="Enquiries"
        subtitle="Everything the contact form and the property pages send in."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <DataTable
        caption="Enquiries"
        columns={columns}
        rows={rows}
        rowKey={(enquiry) => enquiry.id}
        hrefFor={(enquiry) => `/admin/enquiries/${enquiry.id}`}
        loading={loading}
        toolbar={
          <TableToolbar
            tabs={{
              value: tab,
              options: TABS,
              onChange: (value) => refilter(() => setTab(value as "all" | EnquiryStatus)),
            }}
            search={{
              placeholder: "Filter this page",
              value: filter,
              onChange: setFilter,
            }}
          />
        }
        empty={
          error ? undefined : filtered ? (
            <EmptyState
              icon={Inbox}
              title="Nothing here"
              hint={
                needle
                  ? `Nothing on the page you are on matched "${filter.trim()}". The box filters what is loaded, so try the pager, or clear it.`
                  : `No enquiry is ${tab}.`
              }
              action={
                <Button
                  variant="ghost"
                  onClick={() =>
                    refilter(() => {
                      setTab("all");
                      setFilter("");
                    })
                  }
                >
                  Show all enquiries
                </Button>
              }
            />
          ) : (
            /* Headlined for the whole account, because this grade only renders
               on All with nothing typed. "No new enquiries" named a status that
               is also a tab on this screen, so it read as a claim about one
               bucket while sitting over an account with nothing in any of
               them. */
            <EmptyState
              title="No enquiries yet"
              hint="The contact form on the site and the enquiry button on every listing both land here. Nothing has come in."
              art={<InboxArt />}
            />
          )
        }
        /* The page filter can hide every row while the PAGE still has rows and
           a next cursor. Without this the screen answered "nothing matched" and
           took the pager away in the same breath, so the record one page over
           became unreachable. */
        footerWhenEmpty={(data?.items.length ?? 0) > 0}
        footer={
          <TablePager
            note={pagerNote(rows.length, data?.items.length ?? 0, needle !== "")}
            {...paging.pager(data?.nextCursor)}
          />
        }
      />
    </>
  );
}

/** Says what is on screen AND what it was narrowed from, when those differ. */
function pagerNote(shown: number, loaded: number, filtering: boolean): string {
  const noun = shown === 1 ? "enquiry" : "enquiries";
  if (filtering && shown !== loaded) return `${shown} of ${loaded} on this page`;
  return `${shown} ${noun} on this page`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The quiet-inbox shelf: an open tray with nothing in it. */
function InboxArt() {
  return (
    <svg width="168" height="112" viewBox="0 0 168 112" fill="none" aria-hidden="true">
      <rect x="26" y="34" width="116" height="62" rx="11" fill="var(--wine-50)" />
      <rect x="26.5" y="34.5" width="115" height="61" rx="10.5" stroke="var(--wine-100)" />
      <path
        d="M26 62h32l6 11h36l6-11h36"
        stroke="var(--wine-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="62" y="14" width="44" height="6" rx="3" fill="var(--mist-200)" />
      <rect x="72" y="26" width="24" height="6" rx="3" fill="var(--mist-200)" />
    </svg>
  );
}
