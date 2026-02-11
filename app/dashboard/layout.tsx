import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/supabase-server";
import Sidebar from "@/app/components/Sidebar";

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
    redirect("/dashboard/onboarding");
  }

  const workspace = membership.workspaces as unknown as {
    id: string;
    name: string;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar workspace={workspace} userEmail={user.email ?? ""} />
      <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
    </div>
  );
}
