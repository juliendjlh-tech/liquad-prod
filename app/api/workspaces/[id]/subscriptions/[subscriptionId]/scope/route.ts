import { NextResponse } from "next/server";

/**
 * PATCH /api/workspaces/:id/subscriptions/:subscriptionId/scope
 *
 * Removed: scope_to_workspace is now derived from the creation mode
 * (publisher → true, access → false) and is immutable. Existing clients
 * receive 410 Gone so the change is loud rather than silent.
 */
export function PATCH(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Subscription scope is now immutable and derived from the publisher/access creation mode.",
    },
    { status: 410 }
  );
}
