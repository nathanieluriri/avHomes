import { imageUrl } from "@/lib/blog/utils";
import type { PublicCoverImage } from "@/lib/blog/types";

/** No srcset: this stack has no image resizer yet, so every multi resolution source starts here. */
export default function CoverImg({
  image,
  fallbackAlt,
  className,
  priority = false,
}: {
  image: PublicCoverImage;
  fallbackAlt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxy already serves sized bytes, next/image cannot follow the upstream redirect
    <img
      className={className}
      src={imageUrl(image.url)}
      alt={image.alt || fallbackAlt}
      width={image.width || undefined}
      height={image.height || undefined}
      style={{ objectPosition: image.focalPoint || undefined }}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
