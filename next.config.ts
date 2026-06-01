import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy: /dashboard/* (pre-publisher-namespace) → new nested L1 routes.
      {
        source: "/dashboard/bots/:path*",
        destination: "/dashboard/publisher/licence/bots/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/domains/:path*",
        destination: "/dashboard/publisher/licence/domains/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/catalogs/:path*",
        destination: "/dashboard/publisher/licence/catalogs/:path*",
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
        destination: "/dashboard/publisher/distribute/subscriptions/:path*",
        permanent: false,
      },
      // Flat /dashboard/publisher/* → nested L1 routes (Licence / Protect /
      // Distribute). Keeps existing bookmarks working after the IA refactor.
      {
        source: "/dashboard/publisher/domains/:path*",
        destination: "/dashboard/publisher/licence/domains/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/publisher/bots/:path*",
        destination: "/dashboard/publisher/licence/bots/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/publisher/catalogs/:path*",
        destination: "/dashboard/publisher/licence/catalogs/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/publisher/gateways/:path*",
        destination: "/dashboard/publisher/protect/gateway/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/publisher/gateways",
        destination: "/dashboard/publisher/protect/gateway",
        permanent: false,
      },
      {
        source: "/dashboard/publisher/subscriptions",
        destination: "/dashboard/publisher/distribute/subscriptions",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
