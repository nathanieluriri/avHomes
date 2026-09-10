import { serialiseJsonLd } from "@/lib/blog/utils";

/**
 * The only sanctioned dangerouslySetInnerHTML on the site. Neither post content
 * nor listing copy uses it anywhere else. serialiseJsonLd escapes the angle
 * brackets and ampersands that would otherwise let authored text close this
 * script element, which matters more here than on a post: a listing's title,
 * address and tagline are typed into the admin by an agent and land inside this
 * tag verbatim.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
