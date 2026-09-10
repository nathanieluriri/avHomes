import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPostBySlug, listPostSlugs } from "@/lib/blog/client";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/blog/config";
import { docToText, imageUrl, toIso, truncate } from "@/lib/blog/utils";
import ArticleTemplate from "@/components/blog/ArticleTemplate";
import ShareLinks from "@/components/blog/ShareLinks";
import ReadingProgress from "@/components/blog/ReadingProgress";
import SubscribeBanner from "@/components/blog/SubscribeBanner";
import JsonLd from "@/components/JsonLd";

/** Absolute, because structured data and og:url consumers resolve nothing. */
function absolute(path: string): string {
  return path.startsWith("http") ? path : `${SITE_DOMAIN}${path}`;
}

export async function generateStaticParams() {
  return listPostSlugs(50);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  // Empty object lets the page itself produce the 404.
  if (!post) return {};

  const description = post.excerpt || truncate(docToText(post.content));
  const canonical = `/posts/${post.slug}`;
  const cover = post.coverImage ? absolute(imageUrl(post.coverImage.url)) : null;

  return {
    title: post.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: absolute(canonical),
      siteName: SITE_NAME,
      publishedTime: toIso(post.publishedAt),
      modifiedTime: toIso(post.updatedAt),
      authors: [post.author.name],
      ...(cover ? { images: [{ url: cover, alt: post.coverImage?.alt || post.title }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: post.title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const description = post.excerpt || truncate(docToText(post.content));
  const cover = post.coverImage ? absolute(imageUrl(post.coverImage.url)) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    datePublished: toIso(post.publishedAt),
    dateModified: toIso(post.updatedAt),
    author: { "@type": "Person", name: post.author.name },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: absolute("/brand/logo.png") },
    },
    mainEntityOfPage: absolute(`/posts/${post.slug}`),
    ...(cover ? { image: cover } : {}),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {/* Renders a fixed overlay, so it does not matter where in the tree it
          sits. It is here rather than in the layout because the index page has
          no article to measure. */}
      <ReadingProgress />
      <ArticleTemplate post={post} />
      <div className="blog-share">
        <ShareLinks title={post.title} slug={post.slug} />
      </div>
      <div className="blog-subscribe">
        <SubscribeBanner source={post.slug} />
      </div>
    </>
  );
}

// Must match DETAIL_REVALIDATE. Next needs a statically analysable literal
// here, so it cannot import the constant.
export const revalidate = 3600;
export const dynamicParams = true;
