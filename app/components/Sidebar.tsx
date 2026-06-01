"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/app/components/ui/Button";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import {
  getActiveSection,
  type L2Item,
} from "@/app/components/navigation/publisherNav";

interface SidebarProps {
  workspace: { id: string; name: string };
  userEmail: string;
  mode: "publisher" | "access";
}

export default function Sidebar({ workspace, userEmail, mode }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { workspaces, switchWorkspace } = useWorkspace();
  const multiOrg = workspaces.length > 1;

  const handleSwitch = async (id: string) => {
    if (id === workspace.id) return setWsOpen(false);
    setSwitching(true);
    setWsOpen(false);
    await switchWorkspace(id);
    setSwitching(false);
  };

  const activeSection = mode === "publisher" ? getActiveSection(pathname) : null;
  const navLinks: L2Item[] = activeSection?.children ?? [];

  const isActive = (href: string) => pathname.startsWith(href);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-gray-200 relative">
        <button
          onClick={() => multiOrg && setWsOpen((o) => !o)}
          disabled={switching}
          className={`w-full flex items-center justify-between gap-2 text-left ${multiOrg ? "cursor-pointer hover:opacity-75" : "cursor-default"}`}
        >
          <span className="text-sm font-semibold text-gray-900 truncate">
            {switching ? "Switching…" : workspace.name}
          </span>
          {multiOrg && (
            <svg
              className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${wsOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        {wsOpen && (
          <div className="absolute left-0 right-0 top-full z-50 bg-white border border-gray-200 shadow-lg rounded-b-md">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  ws.id === workspace.id
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {ws.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {activeSection && (
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {activeSection.label}
          </div>
        )}
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

      <div className="p-4 border-t border-gray-200 space-y-2">
        {mode === "publisher" && (
          <Link
            href="/dashboard/publisher/settings"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive("/dashboard/publisher/settings")
                ? "bg-blue-50 text-blue-700"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>
        )}
        <div className="text-xs text-gray-500 truncate px-3">{userEmail}</div>
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
