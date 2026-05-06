import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/supabase-server";

export default async function DashboardIndex() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspaces(is_publisher)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const workspace = membership?.workspaces as
    | { is_publisher?: boolean }
    | null;

  if (!workspace) {
    redirect("/onboarding");
  }

  redirect(workspace.is_publisher ? "/dashboard/publisher" : "/dashboard/access");
}
