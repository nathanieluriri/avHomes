import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
    // placehold.co serves SVG placeholders; skip the optimizer for them.
    unoptimized: true,
  },
};

export default nextConfig;

// Enables Next.js dev tooling for the Cloudflare/OpenNext build in dev.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
