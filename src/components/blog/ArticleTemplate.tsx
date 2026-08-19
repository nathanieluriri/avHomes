import Link from "next/link";

import CoverImg from "@/components/blog/CoverImg";
import DocRenderer from "@/components/blog/DocRenderer";
import { BLOG_DEFAULT_TEMPLATE, SHOW_READING_TIME } from "@/lib/blog/config";
import type { PublicPostDetail, ReadingTemplate } from "@/lib/blog/types";
import { formatFactDate, formatLongDate, formatShortDate, toIso } from "@/lib/blog/utils";

/** A blank title reads worse than a placeholder, so every render site falls back through here. */
function titleOf(post: Pick<PublicPostDetail, "title">): string {
  return post.title.trim() || "Untitled";
}

function Byline({ post }: { post: PublicPostDetail }) {
  return (
    <div className="tpl__byline">
      <span className="tpl__avatar" aria-hidden="true">
        {post.author.name.slice(0, 1)}
      </span>
      <div>
        <p className="tpl__author">{post.author.name}</p>
        <p className="tpl__dateline">
          {formatLongDate(post.publishedAt)}
          {SHOW_READING_TIME && post.wordCount > 0 && ` · ${post.readingTime} min read`}
        </p>
      </div>
    </div>
  );
}

/** A reader cannot edit the page, so an empty post gets a plain notice, never a "start writing" prompt. */
function Body({ post }: { post: PublicPostDetail }) {
  if (post.wordCount === 0 || !post.content) {
    return <div className="tpl__blank">This post has no content yet.</div>;
  }
  return (
    <div className="blog-prose tpl__body">
      <DocRenderer doc={post.content} />
    </div>
  );
}

/** Shared chip markup so the footer version and the technical rail version never drift apart. */
function TagChips({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((t) => (
        <Link key={t} className="chip" href={`/posts?tag=${encodeURIComponent(t)}`}>
          {t}
        </Link>
      ))}
    </>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <footer className="tpl__tags">
      <TagChips tags={tags} />
    </footer>
  );
}

function Magazine({ post }: { post: PublicPostDetail }) {
  const title = titleOf(post);
  const cover = post.coverImage;
  return (
    <article className="tpl tpl--magazine">
      <header className="tpl__head">
        {post.category && <p className="tpl__kicker">{post.category}</p>}
        <h1 className="tpl__title">{title}</h1>
        {post.subtitle && <p className="tpl__subtitle">{post.subtitle}</p>}
        <Byline post={post} />
      </header>
      {cover && (
        <figure className="tpl__cover tpl__cover--wide">
          <CoverImg image={cover} fallbackAlt={title} className="tpl__cover-img" priority />
          {cover.alt && <figcaption className="tpl__caption">{cover.alt}</figcaption>}
        </figure>
      )}
      <Body post={post} />
      <Tags tags={post.tags} />
    </article>
  );
}

function Minimal({ post }: { post: PublicPostDetail }) {
  const title = titleOf(post);
  return (
    <article className="tpl tpl--minimal">
      <header className="tpl__head">
        <h1 className="tpl__title">{title}</h1>
        {post.subtitle && <p className="tpl__subtitle">{post.subtitle}</p>}
        <p className="tpl__meta-line">
          {post.author.name} · {formatShortDate(post.publishedAt)}
          {SHOW_READING_TIME && post.wordCount > 0 && ` · ${post.readingTime} min`}
        </p>
      </header>
      <Body post={post} />
      <Tags tags={post.tags} />
    </article>
  );
}

function Editorial({ post }: { post: PublicPostDetail }) {
  const title = titleOf(post);
  const cover = post.coverImage;
  return (
    <article className="tpl tpl--editorial">
      {cover && (
        <figure className="tpl__cover tpl__cover--bleed">
          <CoverImg image={cover} fallbackAlt={title} className="tpl__cover-img" priority />
        </figure>
      )}
      <header className="tpl__head tpl__head--centred">
        {post.category && <p className="tpl__kicker">{post.category}</p>}
        <h1 className="tpl__title">{title}</h1>
        {post.subtitle && <p className="tpl__subtitle">{post.subtitle}</p>}
        <div className="tpl__rule" aria-hidden="true" />
        <Byline post={post} />
      </header>
      <Body post={post} />
      <Tags tags={post.tags} />
    </article>
  );
}

function Technical({ post }: { post: PublicPostDetail }) {
  const title = titleOf(post);
  const cover = post.coverImage;
  return (
    <article className="tpl tpl--technical">
      <div className="tpl__rail">
        <dl className="tpl__facts">
          <dt>Author</dt>
          <dd>{post.author.name}</dd>
          <dt>Published</dt>
          <dd>
            <time dateTime={toIso(post.publishedAt)}>{formatFactDate(post.publishedAt)}</time>
          </dd>
          {post.category && (
            <>
              <dt>Category</dt>
              <dd>{post.category}</dd>
            </>
          )}
          <dt>Length</dt>
          <dd>
            {post.wordCount.toLocaleString()} words
            {SHOW_READING_TIME && post.readingTime > 0 && ` · ${post.readingTime} min`}
          </dd>
        </dl>
        {post.tags.length > 0 && (
          <div className="tpl__rail-tags">
            <TagChips tags={post.tags} />
          </div>
        )}
      </div>
      <div className="tpl__main">
        <header className="tpl__head">
          <h1 className="tpl__title">{title}</h1>
          {post.subtitle && <p className="tpl__subtitle">{post.subtitle}</p>}
        </header>
        {cover && (
          <figure className="tpl__cover">
            <CoverImg image={cover} fallbackAlt={title} className="tpl__cover-img" />
          </figure>
        )}
        <Body post={post} />
      </div>
    </article>
  );
}

const REGISTRY: Record<ReadingTemplate, typeof Magazine> = {
  magazine: Magazine,
  minimal: Minimal,
  editorial: Editorial,
  technical: Technical,
};

function resolveTemplate(post: Pick<PublicPostDetail, "template">): ReadingTemplate {
  return post.template ?? BLOG_DEFAULT_TEMPLATE;
}

/** template is a free string from another service, so an unknown name floors to Magazine instead of throwing. */
export default function ArticleTemplate({ post }: { post: PublicPostDetail }) {
  const Chosen = REGISTRY[resolveTemplate(post)] ?? Magazine;
  return <Chosen post={post} />;
}
