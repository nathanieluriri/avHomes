"use client";

import Link from "next/link";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { Badge, Card, ErrorNote, PageHeader, Spinner } from "@/components/admin/ui";

interface Dashboard {
  listings: Record<string, number>;
  posts: Record<string, number>;
  enquiries: { new: number; open: number; closed: number; spam: number };
  recentEnquiries: { id: string; name: string; status: string; createdAt: number }[];
}

const LISTING_TILES = [
  { key: "for-sale", label: "For sale" },
  { key: "for-rent", label: "For rent" },
  { key: "draft", label: "Drafts" },
  { key: "sold", label: "Sold" },
] as const;

export default function DashboardPage() {
  const { data, error, loading, reload } = useAsync<Dashboard>(
    (signal) => api.get<Dashboard>("/admin/dashboard", signal),
    [],
  );

  return (
    <>
      <PageHeader title="Dashboard" subtitle="What is live, what is waiting, and who is asking." />

      {loading && <Spinner />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LISTING_TILES.map((tile) => (
              <Card key={tile.key}>
                <p className="text-3xl font-bold tracking-tight text-navy-950">
                  {data.listings[tile.key] ?? 0}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{tile.label}</p>
              </Card>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <h2 className="text-sm font-semibold text-navy-950">Journal</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Published" value={data.posts.published ?? 0} />
                <Row label="Drafts" value={data.posts.draft ?? 0} />
                <Row label="Archived" value={data.posts.archived ?? 0} />
              </dl>
              <Link
                href="/admin/posts"
                className="mt-4 inline-block text-sm font-semibold text-blue-600 underline underline-offset-2"
              >
                Open the journal
              </Link>
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-navy-950">Enquiries</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="New" value={data.enquiries.new} />
                <Row label="Open" value={data.enquiries.open} />
                <Row label="Closed" value={data.enquiries.closed} />
              </dl>
              <Link
                href="/admin/enquiries"
                className="mt-4 inline-block text-sm font-semibold text-blue-600 underline underline-offset-2"
              >
                Open the inbox
              </Link>
            </Card>

            <Card className="lg:col-span-1">
              <h2 className="text-sm font-semibold text-navy-950">Latest enquiries</h2>
              {data.recentEnquiries.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.recentEnquiries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-navy-950">{e.name}</span>
                      <Badge tone={e.status === "new" ? "blue" : "neutral"}>{e.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-navy-950">{value}</dd>
    </div>
  );
}
