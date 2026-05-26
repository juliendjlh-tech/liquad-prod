import { cookies } from "next/headers";
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

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, public_id, name, max_pages, is_publisher)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const allWorkspaces = memberships.map((m) => {
    const ws = m.workspaces as {
      id: string;
      public_id: string;
      name: string;
      max_pages?: number;
      is_publisher?: boolean;
    };
    return {
      id: ws.id,
      public_id: ws.public_id,
      name: ws.name,
      max_pages: ws.max_pages ?? 2000,
      is_publisher: ws.is_publisher ?? false,
    };
  });

  const cookieStore = await cookies();
  const activeId = cookieStore.get("active_workspace_id")?.value;
  const workspace =
    allWorkspaces.find((w) => w.id === activeId) ?? allWorkspaces[0];

  return (
    <WorkspaceProvider workspace={workspace} workspaces={allWorkspaces}>
      <DashboardShell workspace={workspace} userEmail={user.email ?? ""}>
        {children}
      </DashboardShell>
    </WorkspaceProvider>
  );
}
