// ---------------------------------------------------------------------------
// Access Settings service
//
// Consumer-side CRUD for access_settings + helper to compute the eligible
// catalogue picker (marketplace OR same workspace, filtered by UA equality
// + IP overlap with the chosen bot).
//
// Replaces the legacy `network.service.ts` (publisher-owned bundles + invite
// lifecycle) and `search-config.service.ts` (RAG-only). The new concept is
// consumer-owned, no invites — when a catalogue is on the marketplace it can
// be added directly.
// ---------------------------------------------------------------------------

import { createServerClient } from "@/lib/db/supabase-server";
import {
  listAccessSettings,
  getAccessSettingsById,
  getAccessSettingsWithCatalogs,
  createAccessSettings as createRow,
  updateAccessSettings as updateRow,
  deleteAccessSettings as deleteRow,
  addCatalogsToAccessSettings,
  removeCatalogFromAccessSettings,
  getAccessSettingsCatalogIds,
  type AccessSettingsRecord,
  type AccessSettingsWithCatalogs,
} from "@/lib/db/queries/access-settings";
import {
  getBotById,
  getWorkspaceBots,
  getCatalogBots,
} from "@/lib/db/queries/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EligibleCatalog {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  workspace_id: string;
  /** True when the catalogue is owned by the consumer workspace (private). */
  is_own_workspace: boolean;
  /** Catalogue's current publisher price. */
  price_eur: number;
  /** 'active' (marketplace) or 'inactive' (private — only for own workspace). */
  status: string;
  /** IP ranges that overlap between the catalogue's publisher bot(s) and the
   * consumer bot. Whitelisted at /licenses time. */
  whitelisted_ips: string[];
  /** Consumer bot IP ranges that do NOT match any publisher bot — surfaced in
   * the picker so the consumer can see why some IPs won't be granted. */
  non_whitelisted_ips: string[];
}

/**
 * Catalogue candidate for the plan-creation flow (route /plans/new). Variant
 * of {@link EligibleCatalog} with publisher-facing metadata (domains covered,
 * source count) rather than the IP whitelist breakdown.
 */
export interface BotEligibleCatalog {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  workspace_id: string;
  is_own_workspace: boolean;
  price_eur: number;
  status: string;
  /** Hostnames the catalogue's filter_rules cover. */
  domains: string[];
  /** Number of indexed sources currently linked to this catalogue. */
  source_count: number;
}

export interface AccessSettingsListItem extends AccessSettingsRecord {
  bot_name: string | null;
  bot_public_id: string | null;
  bot_description: string | null;
  bot_ua_pattern: string | null;
  catalog_count: number;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listForWorkspace(
  workspaceId: string,
): Promise<AccessSettingsListItem[]> {
  const rows = await listAccessSettings(workspaceId);
  if (rows.length === 0) return [];

  // Batch-load bots + catalogue counts.
  const supabase = await createServerClient();
  const botIds = [...new Set(rows.map((r) => r.bot_id))];

  const { data: bots } = await supabase
    .from("bots")
    .select("id, public_id, name, description, ua_pattern")
    .in("id", botIds);

  const botMap = new Map<
    string,
    { public_id: string; name: string; description: string | null; ua_pattern: string }
  >(
    (bots ?? []).map((b) => [
      b.id,
      {
        public_id: b.public_id,
        name: b.name,
        description: b.description,
        ua_pattern: b.ua_pattern,
      },
    ]),
  );

  const ids = rows.map((r) => r.id);
  const { data: links } = await supabase
    .from("access_settings_catalogs")
    .select("access_settings_id")
    .in("access_settings_id", ids);

  const countMap = new Map<string, number>();
  for (const link of links ?? []) {
    countMap.set(
      link.access_settings_id,
      (countMap.get(link.access_settings_id) ?? 0) + 1,
    );
  }

  return rows.map((r) => {
    const bot = botMap.get(r.bot_id);
    return {
      ...r,
      bot_name: bot?.name ?? null,
      bot_public_id: bot?.public_id ?? null,
      bot_description: bot?.description ?? null,
      bot_ua_pattern: bot?.ua_pattern ?? null,
      catalog_count: countMap.get(r.id) ?? 0,
    };
  });
}

export async function getDetail(
  workspaceId: string,
  id: string,
): Promise<AccessSettingsWithCatalogs | null> {
  const row = await getAccessSettingsWithCatalogs(id);
  if (!row || row.workspace_id !== workspaceId) return null;
  return row;
}

export async function createForWorkspace(input: {
  workspaceId: string;
  name: string;
  botId: string;
  /** NULL = no cap. */
  maxPriceEur: number | null;
  catalogIds: string[];
}): Promise<AccessSettingsWithCatalogs> {
  // 1. Validate the bot exists at all.
  const bot = await getBotById(input.botId);
  if (!bot) {
    throw new Error("BOT_NOT_FOUND");
  }

  // 2. Auto-subscribe the bot to workspace_bots if not already.
  // This supports CTA 2: a consumer references an arbitrary bot by public_id
  // and the platform binds it to the workspace as part of plan creation.
  // Security note: the bot's declared_ips remain those of its creator —
  // referencing someone else's bot does not let the new workspace impersonate
  // those IPs at runtime (the gateway rejects tokens issued for IPs outside
  // the consumer's actual reach).
  const wsBots = await getWorkspaceBots(input.workspaceId);
  if (!wsBots.find((b) => b.id === input.botId)) {
    const supabase = await createServerClient();
    const { error: subErr } = await supabase
      .from("workspace_bots")
      .insert({ workspace_id: input.workspaceId, bot_id: input.botId });
    if (subErr && subErr.code !== "23505") {
      // 23505 = unique_violation → another concurrent caller already subscribed.
      throw new Error(`AUTO_SUBSCRIBE_FAILED: ${subErr.message}`);
    }
  }

  // 3. Create the access_settings row (trigger validates bot ∈ workspace_bots).
  const row = await createRow({
    workspaceId: input.workspaceId,
    botId: input.botId,
    name: input.name,
    maxPriceEur: input.maxPriceEur,
  });

  // 4. Attach catalogues. The catalog-eligibility trigger raises if any
  //    catalogue is private and from a different workspace.
  try {
    await addCatalogsToAccessSettings({
      accessSettingsId: row.id,
      catalogIds: input.catalogIds,
    });
  } catch (err) {
    // Best-effort cleanup if the attach failed (partial state isn't great).
    await deleteRow(row.id).catch(() => {});
    throw err;
  }

  const detail = await getAccessSettingsWithCatalogs(row.id);
  if (!detail) {
    throw new Error("CREATE_RACE: access settings vanished after insert");
  }
  return detail;
}

export async function updateForWorkspace(input: {
  workspaceId: string;
  id: string;
  patch: { name?: string; maxPriceEur?: number | null };
}): Promise<AccessSettingsWithCatalogs | null> {
  const existing = await getAccessSettingsById(input.id);
  if (!existing || existing.workspace_id !== input.workspaceId) return null;

  await updateRow(input.id, input.patch);
  return getAccessSettingsWithCatalogs(input.id);
}

export async function deleteForWorkspace(input: {
  workspaceId: string;
  id: string;
}): Promise<boolean> {
  const existing = await getAccessSettingsById(input.id);
  if (!existing || existing.workspace_id !== input.workspaceId) return false;

  // Block deletion if any non-revoked api_key still references the plan.
  // (FK is ON DELETE RESTRICT, but a clean 422 beats a cryptic FK error.)
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("access_settings_id", input.id)
    .is("revoked_at", null);

  if ((count ?? 0) > 0) {
    throw new Error("ACCESS_SETTINGS_IN_USE");
  }

  await deleteRow(input.id);
  return true;
}

// ---------------------------------------------------------------------------
// Catalogue membership
// ---------------------------------------------------------------------------

export async function addCatalogs(input: {
  workspaceId: string;
  id: string;
  catalogIds: string[];
}): Promise<AccessSettingsWithCatalogs | null> {
  const existing = await getAccessSettingsById(input.id);
  if (!existing || existing.workspace_id !== input.workspaceId) return null;

  await addCatalogsToAccessSettings({
    accessSettingsId: input.id,
    catalogIds: input.catalogIds,
  });
  return getAccessSettingsWithCatalogs(input.id);
}

export async function removeCatalog(input: {
  workspaceId: string;
  id: string;
  catalogId: string;
}): Promise<boolean> {
  const existing = await getAccessSettingsById(input.id);
  if (!existing || existing.workspace_id !== input.workspaceId) return false;

  await removeCatalogFromAccessSettings({
    accessSettingsId: input.id,
    catalogId: input.catalogId,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Eligible-catalogues picker
// ---------------------------------------------------------------------------

/**
 * Catalogues a bot can consume (marketplace-active only, no own-workspace
 * exception here — this is the plan-creation flow where the consumer is
 * shopping). Each candidate is decorated with the list of covered hostnames
 * and the current source count, which is what the publisher dashboard shows.
 *
 * Eligibility: catalogue must be `status='active'` AND linked via
 * `catalog_bots` to the bot's identity (UA equality enforced through the
 * catalog_bots → bot joins).
 */
export async function listEligibleCatalogsForBot(input: {
  workspaceId: string;
  botId: string;
}): Promise<BotEligibleCatalog[]> {
  void input.workspaceId; // workspace membership already checked by the route

  const bot = await getBotById(input.botId);
  if (!bot) return [];
  const consumerUa = bot.ua_pattern;

  const supabase = await createServerClient();

  // 1. Marketplace catalogues only.
  const { data: catalogs, error } = await supabase
    .from("catalogs")
    .select("id, public_id, name, description, workspace_id, status, price_eur, filter_rules")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) throw new Error(`listEligibleCatalogsForBot: ${error.message}`);
  if (!catalogs || catalogs.length === 0) return [];

  // 2. Filter to catalogues the bot can actually consume (UA match through
  //    catalog_bots).
  const candidateIds = catalogs.map((c) => c.id);
  const links = await getCatalogBots(candidateIds);
  const eligibleIds = new Set<string>();
  for (const link of links) {
    if (link.bot.ua_pattern === consumerUa) {
      eligibleIds.add(link.catalog_id);
    }
  }

  const eligible = catalogs.filter((c) => eligibleIds.has(c.id));
  if (eligible.length === 0) return [];

  // 3. Resolve domain_ids → hostnames.
  const allDomainIds = new Set<string>();
  for (const c of eligible) {
    const rules = (c.filter_rules ?? {}) as {
      domain_rules?: Array<{ domain_id?: string }>;
    };
    for (const r of rules.domain_rules ?? []) {
      if (r.domain_id) allDomainIds.add(r.domain_id);
    }
  }

  const domainMap = new Map<string, string>();
  if (allDomainIds.size > 0) {
    const { data: domains } = await supabase
      .from("domains")
      .select("id, domain")
      .in("id", [...allDomainIds]);
    for (const d of domains ?? []) {
      domainMap.set(d.id, d.domain);
    }
  }

  // 4. Source counts in one query per catalogue (small N, idx PK).
  const sourceCounts = new Map<string, number>();
  await Promise.all(
    eligible.map(async (c) => {
      const { count } = await supabase
        .from("catalog_sources")
        .select("indexed_source_id", { count: "exact", head: true })
        .eq("catalog_id", c.id);
      sourceCounts.set(c.id, count ?? 0);
    }),
  );

  return eligible.map((c) => {
    const rules = (c.filter_rules ?? {}) as {
      domain_rules?: Array<{ domain_id?: string }>;
    };
    const domains: string[] = [];
    for (const r of rules.domain_rules ?? []) {
      if (r.domain_id) {
        const host = domainMap.get(r.domain_id);
        if (host) domains.push(host);
      }
    }
    return {
      id: c.id,
      public_id: c.public_id,
      name: c.name,
      description: c.description,
      workspace_id: c.workspace_id,
      is_own_workspace: c.workspace_id === input.workspaceId,
      price_eur: Number(c.price_eur),
      status: c.status,
      domains,
      source_count: sourceCounts.get(c.id) ?? 0,
    } satisfies BotEligibleCatalog;
  });
}

/**
 * Catalogues the consumer can attach to an access_settings:
 *   - marketplace catalogues (status='active') from any workspace
 *   - private catalogues (status='inactive') owned by the consumer workspace
 *
 * Each candidate is decorated with:
 *   - whitelisted_ips    : intersection of catalogue bot IPs and the access
 *                          settings bot's declared_ips
 *   - non_whitelisted_ips: consumer bot IPs not covered by any catalogue bot
 *
 * Candidates with neither UA match nor IP intersection are excluded — the
 * runtime /licenses path would reject them anyway.
 *
 * Already-attached catalogues are still included (UI shows them flagged).
 */
export async function listEligibleCatalogs(input: {
  workspaceId: string;
  accessSettingsId: string;
}): Promise<EligibleCatalog[]> {
  const settings = await getAccessSettingsById(input.accessSettingsId);
  if (!settings || settings.workspace_id !== input.workspaceId) {
    return [];
  }

  const bot = await getBotById(settings.bot_id);
  if (!bot || !bot.declared_ips || bot.declared_ips.length === 0) {
    return [];
  }
  const consumerUa = bot.ua_pattern;
  const consumerIps = new Set(bot.declared_ips);

  const supabase = await createServerClient();

  // 1. Marketplace catalogues + private ones owned by this workspace.
  const { data: catalogs, error } = await supabase
    .from("catalogs")
    .select("id, public_id, name, description, workspace_id, status, price_eur")
    .or(
      `status.eq.active,workspace_id.eq.${input.workspaceId}`,
    )
    .order("name", { ascending: true });

  if (error) throw new Error(`listEligibleCatalogs: ${error.message}`);
  if (!catalogs || catalogs.length === 0) return [];

  // 2. For each candidate catalogue, find the bots that match the consumer UA
  //    and compute the IP whitelist.
  const candidateIds = catalogs.map((c) => c.id);
  const catalogBotLinks = await getCatalogBots(candidateIds);

  const whitelistByCatalog = new Map<string, Set<string>>();
  for (const link of catalogBotLinks) {
    if (link.bot.ua_pattern !== consumerUa) continue;
    const set = whitelistByCatalog.get(link.catalog_id) ?? new Set<string>();
    for (const ip of link.bot.declared_ips ?? []) {
      if (consumerIps.has(ip)) set.add(ip);
    }
    whitelistByCatalog.set(link.catalog_id, set);
  }

  return catalogs
    .map((c) => {
      const whitelist = whitelistByCatalog.get(c.id);
      if (!whitelist || whitelist.size === 0) {
        return null;
      }
      const whitelisted = [...whitelist];
      const nonWhitelisted = [...consumerIps].filter((ip) => !whitelist.has(ip));
      return {
        id: c.id,
        public_id: c.public_id,
        name: c.name,
        description: c.description,
        workspace_id: c.workspace_id,
        is_own_workspace: c.workspace_id === input.workspaceId,
        price_eur: Number(c.price_eur),
        status: c.status,
        whitelisted_ips: whitelisted,
        non_whitelisted_ips: nonWhitelisted,
      } satisfies EligibleCatalog;
    })
    .filter((c): c is EligibleCatalog => c !== null);
}

// Re-export for convenience.
export type { AccessSettingsRecord, AccessSettingsWithCatalogs };
export { getAccessSettingsCatalogIds };
