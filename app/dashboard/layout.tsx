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
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name, max_pages, is_publisher)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const workspaceData = membership?.workspaces as
    | { id: string; name: string; max_pages?: number; is_publisher?: boolean }
    | null;

  if (!workspaceData) {
    redirect("/onboarding");
  }

  const workspace = {
    id: workspaceData.id,
    name: workspaceData.name,
    max_pages: workspaceData.max_pages ?? 2000,
    is_publisher: workspaceData.is_publisher ?? false,
  };

  return (
    <WorkspaceProvider workspace={workspace}>
      <DashboardShell workspace={workspace} userEmail={user.email ?? ""}>
        {children}
      </DashboardShell>
    </WorkspaceProvider>
  );
}
