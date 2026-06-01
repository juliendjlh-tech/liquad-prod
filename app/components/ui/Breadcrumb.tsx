"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publisherLabels: Record<string, string> = {
  publisher: "Publisher",
  licence: "Licence",
  protect: "Protect",
  distribute: "Distribute",
  domains: "Domains",
  bots: "Watchlist",
  catalogs: "Catalogs",
  gateway: "Gateway",
  overview: "Overview",
  subscriptions: "Subscriptions",
  "access-settings": "Integrations",
  new: "Create",
  create: "Create",
  edit: "Edit",
  import: "Index contents",
};

// /access is now a single focused subscription view — no deeper routes.
const accessLabels: Record<string, string> = {
  access: "Access",
};

export default function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // segments[0]="dashboard", segments[1]=section, segments[2]=level1, segments[3+]=level2+

  const isPublisher = pathname.startsWith("/dashboard/publisher");
  const routeLabels = isPublisher ? publisherLabels : accessLabels;

  const section = segments[1];
  if (!section) return null;

  if (isPublisher) {
    // Only show breadcrumb on level 2+ pages (4+ segments)
    // Level 1 pages (/publisher, /publisher/domains, etc.) get no breadcrumb
    if (segments.length <= 3) return null;

    const level1Segment = segments[2];
    const rootLabel = routeLabels[level1Segment] ?? level1Segment;
    const rootHref = "/" + segments.slice(0, 3).join("/");

    const crumbs: { label: string; href: string }[] = [];
    for (let i = 3; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.match(/^[0-9a-f-]{36}$/i)) continue;
      crumbs.push({
        label: routeLabels[segment] ?? segment,
        href: "/" + segments.slice(0, i + 1).join("/"),
      });
    }

    return (
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-sm text-gray-500">
          <li>
            <Link href={rootHref} className="hover:text-gray-700 transition-colors">
              {rootLabel}
            </Link>
          </li>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-1.5">
                <ChevronIcon />
                {isLast ? (
                  <span className="font-medium text-gray-900">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  // Access pages: existing logic unchanged
  const crumbs: { label: string; href: string }[] = [];
  for (let i = 2; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.match(/^[0-9a-f-]{36}$/i)) continue;
    crumbs.push({
      label: routeLabels[segment] ?? segment,
      href: "/" + segments.slice(0, i + 1).join("/"),
    });
  }

  const hasDepth = segments.length > 2;
  if (crumbs.length === 0 && !hasDepth) return null;

  const sectionLabel = routeLabels[section] ?? section;
  const sectionHref = `/dashboard/${section}`;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500">
        <li>
          <Link href={sectionHref} className="hover:text-gray-700 transition-colors">
            {sectionLabel}
          </Link>
        </li>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              <ChevronIcon />
              {isLast ? (
                <span className="font-medium text-gray-900">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 text-gray-400 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}
