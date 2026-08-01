import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Seed photography is referenced from Unsplash. Swap this for the cafe's
    // own asset host — or drop it entirely and serve from /public — before
    // launch; see docs/DEPLOYMENT.md.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The guest surface has no reason to reach for any of these, and a
          // menu page asking for a camera is exactly what a compromised
          // dependency would do.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
