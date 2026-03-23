import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/supabase-server";
import { WorkspaceProvider } from "@/app/dashboard/workspace-context";
import DashboardShell from "@/app/dashboard/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user's first workspace (MVP: single workspace)
  // Try with max_pages first; fall back without it if column doesn't exist yet
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name, max_pages)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  let workspaceData: { id: string; name: string; max_pages?: number } | null = null;

  if (membership?.workspaces) {
    workspaceData = membership.workspaces as unknown as { id: string; name: string; max_pages?: number };
  } else {
    // Retry without max_pages (column may not exist before migration 011)
    const { data: fallback } = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(id, name)")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (fallback?.workspaces) {
      workspaceData = fallback.workspaces as unknown as { id: string; name: string };
    }
  }

  if (!workspaceData) {
    redirect("/onboarding");
  }

  const workspace = {
    id: workspaceData.id,
    name: workspaceData.name,
    max_pages: workspaceData.max_pages ?? 2000,
  };

  return (
    <WorkspaceProvider workspace={workspace}>
      <DashboardShell workspace={workspace} userEmail={user.email ?? ""}>
        {children}
      </DashboardShell>
    </WorkspaceProvider>
  );
}
