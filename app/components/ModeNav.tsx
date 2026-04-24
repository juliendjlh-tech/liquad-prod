"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const modes = [
  { label: "License", href: "/dashboard" },
  { label: "Access", href: "/dashboard/access" },
] as const;

export default function ModeNav() {
  const pathname = usePathname();
  const isAccess = pathname.startsWith("/dashboard/access");

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-600" />
          <span className="text-base font-semibold text-gray-900">Liquad</span>
        </div>

        {/*<div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {modes.map((mode) => {
            const active =
              mode.href === "/dashboard/access" ? isAccess : !isAccess;
            return (
              <Link
                key={mode.href}
                href={mode.href}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {mode.label}
              </Link>
            );
          })}
        </div>
        */}

        <div className="w-20" />
      </div>
    </header>
  );
}
