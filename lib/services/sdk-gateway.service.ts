// ---------------------------------------------------------------------------
// SDK Gateway service
//
// Assembles the rules payload consumed by the deployed SDK.
// Single responsibility: build the read model for the gateway flow.
//
// The SDK uses this payload to make local decisions:
// - Match User-Agent → identify partner bots
// - Verify client IP against declared ranges
// - Verify HMAC tokens (using hmac_secret)
// - Apply opt-in/opt-out default behavior
//
// Catalogs are NOT included — the SDK never needs them.
// Catalog matching happens server-side in sdk-transaction.service.ts.
// ---------------------------------------------------------------------------

import { getWorkspaceDomains } from "@/lib/db/queries/domains";
import { getPublisherMatchData } from "@/lib/db/queries/publisher-match-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayAgent {
  id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  catalog_ids: string[];
}

export interface GatewayCatalog {
  id: string;
  name: string;
  filter_rules: {
    domain_rules: Array<{
      domain: string;
      path_rules?: Array<{ operator: string; value: string }>;
      path_logic?: "AND" | "OR";
    }>;
  };
  price_eur: number;
}

/** Payload sent to the SDK via GET /api/sdk/rules */
export interface GatewayRules {
  workspace_id: string;
  hmac_secret: string;
  verified_domains: string[];
  agents: GatewayAgent[];
  /** Free catalogs (price_eur=0) with resolved filter_rules for local matching */
  catalogs: GatewayCatalog[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Build the gateway rules payload for a workspace.
 *
 * Composes atomic queries — no god function, no flags.
 */
export async function getGatewayRules(
  workspaceId: string
): Promise<GatewayRules> {
  // Parallel: verified domains + publisher match data (which itself parallelizes)
  const [verifiedDomains, publisherData] = await Promise.all([
    getWorkspaceDomains(workspaceId),
    getPublisherMatchData(workspaceId, { exactPriceEur: 0 }),
  ]);

  return {
    workspace_id: workspaceId,
    hmac_secret: publisherData.hmacSecret,
    verified_domains: verifiedDomains,
    agents: publisherData.agents,
    catalogs: publisherData.catalogs,
  };
}
