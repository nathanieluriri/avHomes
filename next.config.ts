import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: [
    "@avhomes/contracts",
    "@avhomes/core",
    "@avhomes/db",
    "@avhomes/identity",
    "@avhomes/listings",
    "@avhomes/content",
    "@avhomes/media",
    "@avhomes/enquiries",
    "@avhomes/analytics",
    "@avhomes/audience",
    "@avhomes/api",
  ],
  // The driver uses node:net/node:tls and must never be traced into a client
  // bundle or a route's module graph analysis.
  serverExternalPackages: ["mongodb", "@clerk/backend"],
  images: {
    localPatterns: [
      // Next's default: any local path, no query string.
      { pathname: "**", search: "" },
      // Tutorial posters carry a content hash (`?v=`) so a new poster is a new cache entry.
      { pathname: "/tutorials/*.jpg" },
    ],
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      // Every uploaded image is served from Cloudinary's CDN.
      { protocol: "https", hostname: "res.cloudinary.com" },
      /*
       * Vercel Blob, which this application no longer uploads to and still has
       * to be able to RENDER. `.env.example` keeps `IMAGE_STORAGE=blob` "only so
       * images uploaded to Vercel Blob before the switch still resolve", and the
       * image library says the same. While `unoptimized: true` was set the
       * loader was short-circuited and an unlisted host was simply passed
       * through; without it, `next/image` THROWS on one, so a storefront page
       * showing a pre-switch image would have crashed rather than degraded.
       */
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    /*
     * `unoptimized: true` used to sit here, and both halves of its reasoning
     * were wrong by the time it was read.
     *
     * It claimed Cloudinary optimises and resizes on its own delivery URLs, so
     * a second pass would be waste. `packages/media/src/storage-cloudinary.ts`
     * returns a bare `result.secure_url` with no `f_auto,q_auto` and no width,
     * so there was no first pass to pay for. It also claimed placehold.co
     * served SVG placeholders that had to skip the optimizer; nothing in the
     * tree references placehold.co any more.
     *
     * Meanwhile the flag applied to EVERY image. Next rendered each one as a
     * plain <img> with the original bytes, discarding the eight `sizes` props
     * already written across Hero, PropertyCard, Gallery, Footer, CTABanner and
     * AgentPanel, and shipping no srcset and no AVIF or WebP. One listing page
     * carried roughly 2.1 MB of images, on a site whose traffic is nearly all
     * phones on Lagos mobile data.
     */
  },
};

export default nextConfig;
