import { z } from "zod";

// ---------------------------------------------------------------------------
// CIDR validation (IPv4 or IPv6 with mask)
// ---------------------------------------------------------------------------

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^[0-9a-fA-F:]+\/\d{1,3}$/;

const cidr = z.string().trim().regex(CIDR_REGEX, "Invalid CIDR notation");

// ---------------------------------------------------------------------------
// Subscribe to a preset bot (no IPs needed — already in global record)
// ---------------------------------------------------------------------------

export const subscribePresetSchema = z.object({
  action: z.literal("subscribe_preset"),
  name: z.string().trim().min(1, "name is required").max(100),
});

export type SubscribePresetInput = z.infer<typeof subscribePresetSchema>;

// ---------------------------------------------------------------------------
// Create a custom bot (declared_ips required — enforces bot identity)
// ---------------------------------------------------------------------------

export const createCustomAgentSchema = z.object({
  action: z.literal("create_custom"),
  name: z.string().trim().min(1, "name is required").max(100),
  ua_pattern: z.string().trim().min(1, "ua_pattern is required").max(500),
  description: z.string().trim().max(500).optional(),
  declared_ips: z.array(cidr).min(1, "At least one CIDR IP range is required"),
});

export type CreateCustomAgentInput = z.infer<typeof createCustomAgentSchema>;

// ---------------------------------------------------------------------------
// Update Schema — partial update of a custom agent
//
// If declared_ips is provided, it must stay non-empty and CIDR-valid.
// ---------------------------------------------------------------------------

export const updateUserAgentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  ua_pattern: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(500).optional(),
  declared_ips: z.array(cidr).min(1).optional(),
});

export type UpdateUserAgentInput = z.infer<typeof updateUserAgentSchema>;
