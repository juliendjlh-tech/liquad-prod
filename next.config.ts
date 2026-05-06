import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Backwards-compat: the publisher dashboard moved from /dashboard/* to
    // /dashboard/publisher/*. Anything that's not under /dashboard/access or
    // /dashboard/publisher is forwarded to the publisher namespace so old
    // bookmarks keep working for one release. Drop this block once /access
    // and /publisher are stable.
    return [
      {
        source: "/dashboard/bots/:path*",
        destination: "/dashboard/publisher/bots/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/domains/:path*",
        destination: "/dashboard/publisher/domains/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/catalogs/:path*",
        destination: "/dashboard/publisher/catalogs/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/integration/:path*",
        destination: "/dashboard/publisher/integration/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/settings/:path*",
        destination: "/dashboard/publisher/settings/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/subscriptions/:path*",
        destination: "/dashboard/publisher/subscriptions/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
