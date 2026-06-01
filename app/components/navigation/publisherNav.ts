export type L2Item = {
  label: string;
  href: string;
};

export type L1Key = "licence" | "protect" | "distribute";

export type L1Section = {
  key: L1Key;
  label: string;
  href: string;
  children: L2Item[];
};

export const publisherSections: L1Section[] = [
  {
    key: "licence",
    label: "Licence",
    href: "/dashboard/publisher/licence",
    children: [
      { label: "Domains", href: "/dashboard/publisher/licence/domains" },
      { label: "Bots Watchlist", href: "/dashboard/publisher/licence/bots" },
      { label: "Catalogs", href: "/dashboard/publisher/licence/catalogs" },
    ],
  },
  {
    key: "protect",
    label: "Protect",
    href: "/dashboard/publisher/protect",
    children: [
      { label: "Overview", href: "/dashboard/publisher/protect/overview" },
      { label: "Gateway", href: "/dashboard/publisher/protect/gateway" },
    ],
  },
  {
    key: "distribute",
    label: "Distribute",
    href: "/dashboard/publisher/distribute",
    children: [
      { label: "Subscriptions", href: "/dashboard/publisher/distribute/subscriptions" },
      { label: "Integrations", href: "/dashboard/publisher/distribute/access-settings" },
      { label: "Billing", href: "/dashboard/publisher/distribute/billing" },
    ],
  },
];

export function getActiveSection(pathname: string): L1Section | null {
  return (
    publisherSections.find((section) => pathname.startsWith(section.href)) ??
    null
  );
}
