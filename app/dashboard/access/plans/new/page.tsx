import { redirect } from "next/navigation";

/**
 * The plan creation flow has moved under the subscription detail route.
 * Redirecting to the subscriptions list so the user can pick the right one.
 */
export default function PlansNewRedirect() {
  redirect("/dashboard/publisher/distribute/subscriptions");
}
