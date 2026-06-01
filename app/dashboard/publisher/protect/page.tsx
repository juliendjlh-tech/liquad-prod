import { redirect } from "next/navigation";

export default function ProtectSectionPage() {
  redirect("/dashboard/publisher/protect/overview");
}
