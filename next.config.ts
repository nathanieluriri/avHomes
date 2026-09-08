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
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      // Every uploaded image is served from Cloudinary's CDN.
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
    // placehold.co serves SVG placeholders; skip the optimizer for them.
    // Cloudinary optimises and resizes on its own delivery URLs, so running
    // Next's optimizer over them would be a second pass paying for the first.
    unoptimized: true,
  },
};

export default nextConfig;
