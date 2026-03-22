"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const routeLabels: Record<string, string> = {
  contents: "Contents",
  "user-agents": "AI Bots",
  catalogs: "Catalogs",
  integration: "Integration",
  settings: "Settings",
  new: "Create",
  edit: "Edit",
};

export default function Breadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const segments = pathname.split("/").filter(Boolean);

  // Only show breadcrumb when there's depth (sub-pages or query-driven drill-down)
  // segments[0] = "dashboard", segments[1] = section, segments[2+] = sub-pages
  const section = segments[1];
  if (!section) return null;

  const crumbs: { label: string; href: string }[] = [];

  // Build crumbs from segments after "dashboard" > section
  for (let i = 2; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = routeLabels[segment] ?? segment;

    // Skip dynamic [id] segments (UUIDs)
    if (segment.match(/^[0-9a-f-]{36}$/i)) continue;

    crumbs.push({ label, href });
  }

  // Contents page: domain drill-down via ?domain= query param
  const domain = section === "contents" ? searchParams.get("domain") : null;
  if (domain) {
    crumbs.push({
      label: domain,
      href: `/dashboard/contents?domain=${encodeURIComponent(domain)}`,
    });
  }

  // No breadcrumb if we're on a top-level section with no depth
  if (crumbs.length === 0) return null;

  const sectionLabel = routeLabels[section] ?? section;
  const sectionHref = `/dashboard/${section}`;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500">
        <li>
          <Link
            href={sectionHref}
            className="hover:text-gray-700 transition-colors"
          >
            {sectionLabel}
          </Link>
        </li>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              <ChevronIcon />
              {isLast ? (
                <span className="font-medium text-gray-900">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-gray-700 transition-colors"
                >
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
