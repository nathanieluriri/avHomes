import Image from "next/image";
import { isAnimatedImageUrl, isVideoUrl, videoPosterUrl } from "@avhomes/contracts";

interface MediaFrameProps {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** A playable video with controls. Off, a video is a silent looping preview. */
  controls?: boolean;
}

/** One uploaded file in a `fill` box: a photo, a GIF, or a video. */
export default function MediaFrame({ src, alt, sizes, priority, className = "", controls = false }: MediaFrameProps) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        poster={videoPosterUrl(src) ?? undefined}
        aria-label={alt}
        className={`absolute inset-0 h-full w-full ${className}`}
        playsInline
        preload="metadata"
        {...(controls ? { controls: true } : { muted: true, loop: true, autoPlay: true })}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      // The optimiser flattens a GIF to its first frame.
      unoptimized={isAnimatedImageUrl(src)}
      className={className}
    />
  );
}

/** The first still, for places that need an image (share cards, structured data). */
export function firstImage(urls: readonly string[]): string | null {
  return urls.find((url) => !isVideoUrl(url)) ?? null;
}
