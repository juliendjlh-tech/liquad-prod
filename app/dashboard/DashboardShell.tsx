"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import ModeNav from "@/app/components/ModeNav";
import Breadcrumb from "@/app/components/ui/Breadcrumb";

interface DashboardShellProps {
  workspace: { id: string; name: string };
  userEmail: string;
  children: React.ReactNode;
}

export default function DashboardShell({
  workspace,
  userEmail,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const mode = pathname.startsWith("/dashboard/access") ? "access" : "license";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <ModeNav />
      <div className="flex flex-1">
        <Sidebar workspace={workspace} userEmail={userEmail} mode={mode} />
        <main className="flex-1 p-6 md:p-8 overflow-auto">
          <Breadcrumb />
          {children}
        </main>
      </div>
    </div>
  );
}
