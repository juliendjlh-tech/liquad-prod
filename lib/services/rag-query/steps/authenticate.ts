// ---------------------------------------------------------------------------
// Step 1: Authenticate consumer via API key
// ---------------------------------------------------------------------------

import { authenticateApiKey } from "@/lib/services/auth.service";
import type { PipelineStep } from "../types";

/**
 * Validate the consumer's API key and extract their workspace ID.
 * Sets ctx.consumerWorkspaceId on success.
 */
export const authenticate: PipelineStep = async (ctx) => {
  const authResult = await authenticateApiKey(ctx.authHeader);

  if ("error" in authResult) {
    return { error: "invalid_api_key", status: 401 };
  }

  ctx.consumerWorkspaceId = authResult.workspaceId;
};
