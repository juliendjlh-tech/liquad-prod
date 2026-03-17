-- ============================================================================
-- Migration 006: Identity Check — DNS Verification Schema
-- ============================================================================
--
-- Extends the database schema to support bot Identity Check (IC), a DNS-based
-- verification mechanism that confirms a bot's IP actually belongs to the
-- claimed operator (e.g. Googlebot really comes from *.google.com).
--
-- Changes:
--   1. ALTER user_agents:   add dns_patterns TEXT[] (DNS hostname globs)
--   2. ALTER sdk_events:    add IC metadata columns + new decision type
--   4. BACKFILL:            populate dns_patterns for known preset bots
--   5. INDEX:               partial index on IC-denied events for analytics
--
-- REFERENCES:
--   - PRD: PRDs/identity-check-prd.md
--   - ADR: ADRs/ADR-003-identity-check-dns-verification.md
--   - User Story: User-Stories/stories/identity-check-stories.md (US-IC-01)
--
-- IMPORTANT: This migration is additive-only. No existing data is lost or
-- modified. All new columns have safe defaults (empty array / false / NULL).
-- ============================================================================


-- ============================================================================
-- 1. ALTER user_agents: Add dns_patterns column
-- ============================================================================
-- dns_patterns stores DNS hostname glob patterns used to verify a bot's
-- identity via reverse DNS lookup. Example: ["*.openai.com", "*.oai.azure.com"]
-- The SDK matches a bot's rDNS hostname against these patterns.
-- Default is an empty array (no DNS verification for this bot).

ALTER TABLE public.user_agents
  ADD COLUMN dns_patterns TEXT[] NOT NULL DEFAULT '{}';

-- Add a comment explaining the column purpose for future developers
COMMENT ON COLUMN public.user_agents.dns_patterns IS
  'DNS hostname glob patterns for Identity Check verification. '
  'Example: {"*.openai.com"}. Empty = IC skipped for this bot.';


-- ============================================================================
-- 2. ALTER sdk_events: Add Identity Check metadata columns
-- ============================================================================
-- These columns capture the result of each DNS verification performed by
-- the SDK. They are nullable because:
--   a) Events from older SDK versions won't have IC data (backward compat)
--   b) Non-bot events or events where IC is disabled won't have IC data
--   c) Events where IC was skipped (no dns_patterns) won't have IC data

-- The IP address of the bot that made the request (used for rDNS lookup)
ALTER TABLE public.sdk_events
  ADD COLUMN source_ip TEXT;

COMMENT ON COLUMN public.sdk_events.source_ip IS
  'IP address of the bot (from req.socket.remoteAddress). '
  'NULL if IC was not performed.';

-- Whether the bot passed DNS verification (true = verified, false = failed)
ALTER TABLE public.sdk_events
  ADD COLUMN ic_verified BOOLEAN;

COMMENT ON COLUMN public.sdk_events.ic_verified IS
  'Result of Identity Check: true = bot verified via DNS, false = failed. '
  'NULL if IC was not performed or not enabled.';

-- The hostname returned by reverse DNS lookup (e.g. "crawler-1.openai.com")
ALTER TABLE public.sdk_events
  ADD COLUMN ic_hostname TEXT;

COMMENT ON COLUMN public.sdk_events.ic_hostname IS
  'Hostname from rDNS lookup during IC. '
  'NULL if rDNS failed or IC was not performed.';

-- How long the DNS verification took in milliseconds (for monitoring latency)
ALTER TABLE public.sdk_events
  ADD COLUMN ic_duration_ms INTEGER;

COMMENT ON COLUMN public.sdk_events.ic_duration_ms IS
  'Duration of the DNS verification in milliseconds. '
  'Useful for monitoring IC latency impact. NULL if IC was not performed.';


-- ============================================================================
-- 3. Update sdk_events decision CHECK constraint
-- ============================================================================
-- Add 'denied_identity_check' as a valid decision type.
-- This decision is emitted when a bot claims to be (e.g.) GPTBot but its
-- IP address does not resolve to *.openai.com via DNS verification.

-- Step 1: Drop the existing constraint (created in migration 005)
ALTER TABLE public.sdk_events
  DROP CONSTRAINT IF EXISTS sdk_events_decision_check;

-- Step 2: Recreate with the new decision type included
ALTER TABLE public.sdk_events
  ADD CONSTRAINT sdk_events_decision_check
  CHECK (decision IN (
    'granted',
    'denied',
    'blocked_no_catalog',
    'authorized_paid',
    'denied_authorization_required',
    'denied_invalid_token',
    'denied_identity_check'
  ));


-- ============================================================================
-- 4. Backfill dns_patterns for existing preset bots
-- ============================================================================
-- Update existing user_agents rows that match known preset bot names.
-- These patterns are sourced from each bot operator's official documentation.
-- Only rows with empty dns_patterns are updated (idempotent / safe to re-run).

-- OpenAI bots: https://platform.openai.com/docs/bots
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.openai.com']
  WHERE name = 'GPTBot' AND dns_patterns = '{}';

UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.openai.com']
  WHERE name = 'ChatGPT-User' AND dns_patterns = '{}';

-- Anthropic bot: https://docs.anthropic.com/en/docs/about-claude/models
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.anthropic.com']
  WHERE name = 'ClaudeBot' AND dns_patterns = '{}';

-- Perplexity bot
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.perplexity.ai']
  WHERE name = 'PerplexityBot' AND dns_patterns = '{}';

-- Google AI training bot
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.googlebot.com', '*.google.com']
  WHERE name = 'Google-Extended' AND dns_patterns = '{}';

-- ByteDance bot
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.bytedance.com']
  WHERE name = 'Bytespider' AND dns_patterns = '{}';

-- Common Crawl bot
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.commoncrawl.org']
  WHERE name = 'CCBot' AND dns_patterns = '{}';

-- Amazon bot: https://developer.amazon.com/amazonbot
UPDATE public.user_agents
  SET dns_patterns = ARRAY['*.amazonaws.com']
  WHERE name = 'Amazonbot' AND dns_patterns = '{}';


-- ============================================================================
-- 5. Partial index for Identity Check analytics
-- ============================================================================
-- This index accelerates dashboard queries that filter on IC-denied events
-- (e.g. "show me all spoofed bot attempts in the last 7 days").
-- It's a partial index — only indexes rows where decision = 'denied_identity_check',
-- keeping the index small and fast even as sdk_events grows.

CREATE INDEX idx_sdk_events_ic_decision
  ON public.sdk_events (workspace_id, decision, timestamp DESC)
  WHERE decision = 'denied_identity_check';


-- ============================================================================
-- ROLLBACK SQL (run manually to revert this migration)
-- ============================================================================
-- DROP INDEX IF EXISTS idx_sdk_events_ic_decision;
--
-- ALTER TABLE public.sdk_events DROP CONSTRAINT IF EXISTS sdk_events_decision_check;
-- ALTER TABLE public.sdk_events
--   ADD CONSTRAINT sdk_events_decision_check
--   CHECK (decision IN (
--     'granted', 'denied', 'blocked_no_catalog',
--     'authorized_paid', 'denied_authorization_required', 'denied_invalid_token'
--   ));
--
-- ALTER TABLE public.sdk_events DROP COLUMN IF EXISTS ic_duration_ms;
-- ALTER TABLE public.sdk_events DROP COLUMN IF EXISTS ic_hostname;
-- ALTER TABLE public.sdk_events DROP COLUMN IF EXISTS ic_verified;
-- ALTER TABLE public.sdk_events DROP COLUMN IF EXISTS source_ip;
--
-- ALTER TABLE public.user_agents DROP COLUMN IF EXISTS dns_patterns;
