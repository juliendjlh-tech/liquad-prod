"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { publisherSections } from "@/app/components/navigation/publisherNav";

export default function PublisherL1Tabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Publisher sections"
      className="border-b border-gray-200 bg-white"
    >
      <div className="flex items-center gap-1 px-6 overflow-x-auto">
        {publisherSections.map((section) => {
          const active = pathname.startsWith(section.href);
          return (
            <Link
              key={section.key}
              href={section.href}
              className={`relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? "text-blue-700"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {section.label}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-px h-0.5 bg-blue-600"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
