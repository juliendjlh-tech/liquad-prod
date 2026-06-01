"use client";

import Sidebar from "@/app/components/Sidebar";
import ModeNav from "@/app/components/ModeNav";
import PublisherL1Tabs from "@/app/components/PublisherL1Tabs";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import { useWorkspace } from "@/app/dashboard/workspace-context";

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
  const { is_publisher } = useWorkspace();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <ModeNav />
      {is_publisher && <PublisherL1Tabs />}
      <div className="flex flex-1">
        <Sidebar workspace={workspace} userEmail={userEmail} mode="publisher" />
        <main className="flex-1 p-6 md:p-8 overflow-auto">
          <Breadcrumb />
          {children}
        </main>
      </div>
    </div>
  );
}
