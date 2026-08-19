import Link from "next/link";
import type { Metadata } from "next";

import { listPosts } from "@/lib/blog/client";
import { formatShortDate, imageUrl } from "@/lib/blog/utils";
import type { PublicPost } from "@/lib/blog/types";

export const metadata: Metadata = {
  title: "Insights | AVHomes",
  description:
    "Guides, market reads and legal explainers on buying, renting and building in Lagos and Abuja.",
};

export const revalidate = 300;

function PostCard({ post }: { post: PublicPost }) {
  return (
    <article className="idx__card">
      <Link href={`/posts/${post.slug}`} className="idx__link">
        {post.coverImage ? (
          // The proxy serves already-sized bytes and next/image cannot follow
          // the upstream presigned redirect, so a plain img is correct here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="idx__thumb"
            src={imageUrl(post.coverImage.url)}
            alt={post.coverImage.alt || post.title}
            width={post.coverImage.width || undefined}
            height={post.coverImage.height || undefined}
            style={{ objectPosition: post.coverImage.focalPoint || undefined }}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="idx__body">
          {post.category && <p className="tpl__kicker">{post.category}</p>}
          <h2 className="idx__title">{post.title.trim() || "Untitled"}</h2>
          {post.excerpt && <p className="idx__excerpt">{post.excerpt}</p>}
          <p className="idx__meta">
            {post.author.name} · {formatShortDate(post.publishedAt)}
            {post.readingTime > 0 ? ` · ${post.readingTime} min read` : ""}
          </p>
        </div>
      </Link>
    </article>
  );
}

export default async function PostsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const all = await listPosts(50);

  const posts = tag
    ? all.filter((p) => p.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
    : all;

  const tags = Array.from(new Set(all.flatMap((p) => p.tags))).sort();

  return (
    <div className="idx">
      <header className="idx__head">
        <p className="tpl__kicker">Insights</p>
        <h1 className="idx__h1">Guides, Stories and Market Reads</h1>
        <p className="idx__intro">
          Practical writing on buying, renting and building in Lagos and Abuja,
          from the team that inspects the sites.
        </p>
      </header>

      <div className="idx__tags">
        <Link href="/posts" className="chip" aria-current={tag ? undefined : "page"}>
          All
        </Link>
        {tags.map((t) => (
          <Link
            key={t}
            href={`/posts?tag=${encodeURIComponent(t)}`}
            className="chip"
            aria-current={tag?.toLowerCase() === t.toLowerCase() ? "page" : undefined}
          >
            {t}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="idx__empty">
          Nothing tagged {tag}. <Link href="/posts" className="doc-link">See every post</Link>.
        </p>
      ) : (
        <div className="idx__grid">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
