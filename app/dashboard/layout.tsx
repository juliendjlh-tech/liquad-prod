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
    .select("workspace_id, workspaces(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.workspaces) {
    redirect("/onboarding");
  }

  const workspace = membership.workspaces as unknown as {
    id: string;
    name: string;
  };

  return (
    <WorkspaceProvider workspace={workspace}>
      <DashboardShell workspace={workspace} userEmail={user.email ?? ""}>
        {children}
      </DashboardShell>
    </WorkspaceProvider>
  );
}
