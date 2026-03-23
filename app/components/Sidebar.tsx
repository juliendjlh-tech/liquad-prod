"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/app/components/ui/Button";

interface SidebarProps {
  workspace: { id: string; name: string };
  userEmail: string;
  mode: "license" | "access";
}

const licenseLinks = [
  { label: "Overview", href: "/dashboard" },
  { label: "Domains", href: "/dashboard/domains" },
  { label: "AI Bots", href: "/dashboard/user-agents" },
  { label: "Catalogs", href: "/dashboard/catalogs" },
  { label: "Integration", href: "/dashboard/integration" },
  { label: "Settings", href: "/dashboard/settings" },
];

const accessLinks = [
  { label: "Overview", href: "/dashboard/access" },
  { label: "Integration", href: "/dashboard/access/integration" },
  { label: "Marketplace", href: "/dashboard/access/marketplace" },
  { label: "Settings", href: "/dashboard/access/settings" },
];

export default function Sidebar({ workspace, userEmail, mode }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navLinks = mode === "access" ? accessLinks : licenseLinks;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/access") return pathname === "/dashboard/access";
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900 truncate">
          {workspace.name}
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive(link.href)
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 truncate mb-2">{userEmail}</div>
        <Button
          variant="ghost"
          size="sm"
          full
          onClick={handleLogout}
          loading={loggingOut}
          className="justify-start"
        >
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-md bg-white shadow-md md:hidden"
        aria-label="Toggle menu"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {mobileOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform md:relative md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
