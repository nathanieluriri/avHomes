import { serialiseJsonLd } from "@/lib/blog/utils";

/**
 * The only sanctioned dangerouslySetInnerHTML on the post page. Post content
 * never uses it. serialiseJsonLd escapes the angle brackets and ampersands
 * that would otherwise let CMS-authored text close this script element.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
