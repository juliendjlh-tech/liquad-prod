"use client";

import Link from "next/link";

export default function ModeNav() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-600" />
          <Link
            href="/"
            className="text-base font-semibold text-gray-900 hover:opacity-80 transition-opacity"
          >
            Liquad
          </Link>
        </div>
      </div>
    </header>
  );
}
