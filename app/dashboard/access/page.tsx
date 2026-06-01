import { redirect } from "next/navigation";

/**
 * The access view has moved to the publisher distribute section.
 * Redirect to the subscriptions list; the user can then pick a specific one.
 */
export default function AccessPageRedirect() {
  redirect("/dashboard/publisher/distribute/subscriptions");
}
