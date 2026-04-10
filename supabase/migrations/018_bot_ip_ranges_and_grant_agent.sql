-- ============================================================================
-- Migration 018: Global agents table + workspace_agents junction
-- ============================================================================
--
-- Replaces the workspace-scoped user_agents table with:
--   1. A global agents table (platform-maintained + custom)
--   2. A workspace_agents junction table (workspace subscribes to agents)
--
-- Also:
--   3. Migrates catalog_agents FK from user_agents to agents
--   4. Adds agent_id on access_grants (references agents)
--   5. Replaces bot_ip_ranges with declared_ips on agents
--   6. Removes dns_patterns (no more DNS Identity Check)
--   7. Updates check_cache_and_debit to include agent_id
--
-- IMPORTANT: No production data exists. This is a destructive rewrite.
-- ============================================================================


-- ============================================================================
-- 1. CREATE TABLE agents (global, not workspace-scoped)
-- ============================================================================

CREATE TABLE public.agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  ua_pattern TEXT NOT NULL,
  declared_ips TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.agents IS
  'Global agent (bot) registry. Contains platform presets and workspace-created custom agents.';

COMMENT ON COLUMN public.agents.declared_ips IS
  'Official IP ranges (CIDR notation) declared by the bot operator. '
  'Used by the SDK for fast IP-level identity verification. Empty = IP check skipped.';


-- ============================================================================
-- 2. Seed preset agents with their declared IP ranges
-- ============================================================================

INSERT INTO public.agents (name, ua_pattern, declared_ips) VALUES
  -- OpenAI
  ('GPTBot',             'GPTBot',             ARRAY['23.102.140.0/23', '13.65.240.240/28', '52.230.152.0/24', '40.84.180.0/30', '40.84.180.32/28', '157.55.39.0/24']),
  ('OAI-SearchBot',      'OAI-SearchBot',      '{}'),
  ('ChatGPT-User',       'ChatGPT-User',       '{}'),
  ('OAI-SearchAgent',    'OAI-SearchAgent',     '{}'),
  -- Anthropic
  ('ClaudeBot',          'ClaudeBot',           '{}'),
  ('Claude-SearchBot',   'Claude-SearchBot',    '{}'),
  ('Claude-User',        'Claude-User',         '{}'),
  ('anthropic-ai',       'anthropic-ai',        ARRAY['160.79.104.0/23']),
  -- Google
  ('Googlebot',          'Googlebot',           ARRAY['66.249.64.0/19', '66.249.80.0/20', '72.14.199.0/24', '2001:4860::/32']),
  ('Google-Extended',    'Google-Extended',      '{}'),
  ('GoogleOther',        'GoogleOther',         '{}'),
  ('Gemini-Deep-Research','Gemini-Deep-Research','{}'),
  ('Google-CloudVertexBot','Google-CloudVertexBot','{}'),
  -- Microsoft
  ('bingbot',            'bingbot',             '{}'),
  ('BingPreview',        'BingPreview',         '{}'),
  ('AdIdxBot',           'AdIdxBot',            '{}'),
  -- Perplexity
  ('PerplexityBot',      'PerplexityBot',       '{}'),
  ('Perplexity-User',    'Perplexity-User',     '{}'),
  ('Perplexity-Search',  'Perplexity-Search',   '{}'),
  -- Amazon
  ('Amazonbot',          'Amazonbot',           '{}'),
  -- Apple
  ('Applebot',           'Applebot',            '{}'),
  ('Applebot-Extended',  'Applebot-Extended',   '{}'),
  -- Meta
  ('Meta-ExternalAgent', 'meta-externalagent',  '{}'),
  -- Mistral
  ('MistralAI-User',     'MistralAI-User',      '{}'),
  ('MistralAI-SearchBot','MistralAI-SearchBot', '{}')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- 3. CREATE TABLE workspace_agents (junction)
-- ============================================================================

CREATE TABLE public.workspace_agents (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  PRIMARY KEY (workspace_id, agent_id)
);

COMMENT ON TABLE public.workspace_agents IS
  'Junction table: which agents are active for each workspace. '
  'Presence of a row means the agent is enabled for that workspace.';


-- ============================================================================
-- 4. Migrate data from user_agents → agents + workspace_agents
-- ============================================================================
-- Insert any user_agents not already in agents (custom bots)

INSERT INTO public.agents (name, ua_pattern)
  SELECT DISTINCT ua.name, ua.ua_pattern
  FROM public.user_agents ua
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agents a WHERE a.name = ua.name
  );

-- Link workspaces to their agents
INSERT INTO public.workspace_agents (workspace_id, agent_id)
  SELECT ua.workspace_id, a.id
  FROM public.user_agents ua
  JOIN public.agents a ON a.name = ua.name
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 5. Migrate catalog_agents FK: user_agent_id → agent_id
-- ============================================================================

-- Add new column referencing agents
ALTER TABLE public.catalog_agents
  ADD COLUMN agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE;

-- Populate from existing user_agent_id via name lookup
UPDATE public.catalog_agents ca
SET agent_id = a.id
FROM public.user_agents ua
JOIN public.agents a ON a.name = ua.name
WHERE ca.user_agent_id = ua.id;

-- Drop old FK column and constraint
ALTER TABLE public.catalog_agents
  DROP CONSTRAINT catalog_agents_pkey;

ALTER TABLE public.catalog_agents
  DROP COLUMN user_agent_id;

-- Set agent_id NOT NULL and create new PK
ALTER TABLE public.catalog_agents
  ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE public.catalog_agents
  ADD PRIMARY KEY (catalog_id, agent_id);


-- ============================================================================
-- 6. ADD agent_id TO access_grants (references agents, not user_agents)
-- ============================================================================

ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ag_agent_id ON public.access_grants(agent_id);


-- ============================================================================
-- 7. DROP dns_patterns from user_agents (added by migration 006)
-- ============================================================================
-- No longer needed — DNS Identity Check is removed.

ALTER TABLE public.user_agents
  DROP COLUMN IF EXISTS dns_patterns;


-- ============================================================================
-- 8. DROP user_agents table (replaced by agents + workspace_agents)
-- ============================================================================

DROP TABLE IF EXISTS public.user_agents CASCADE;


-- ============================================================================
-- 9. REPLACE check_cache_and_debit — store agent_id in the grant row
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_cache_and_debit(
  p_consumer_id   UUID,
  p_publisher_id  UUID,
  p_url           TEXT,
  p_catalog_id    UUID,
  p_agent_id      UUID,
  p_price_eur     NUMERIC,
  p_ttl_minutes   INTEGER DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant         public.access_grants%ROWTYPE;
  v_balance       NUMERIC;
  v_new_balance   NUMERIC;
  v_expires_at    TIMESTAMPTZ;
BEGIN
  -- 1. Check for a valid cached grant (same consumer + URL, not yet expired)
  SELECT * INTO v_grant
  FROM public.access_grants
  WHERE consumer_workspace_id = p_consumer_id
    AND url                   = p_url
    AND expires_at            > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success',    true,
      'cached',     true,
      'grant_id',   v_grant.id,
      'expires_at', v_grant.expires_at,
      'new_balance', (
        SELECT balance_eur FROM public.workspaces WHERE id = p_consumer_id
      )
    );
  END IF;

  -- 2. Lock consumer workspace row
  SELECT balance_eur INTO v_balance
  FROM public.workspaces
  WHERE id = p_consumer_id
  FOR UPDATE;

  -- 3. Verify balance
  IF v_balance < p_price_eur THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason',  'insufficient_balance',
      'balance', v_balance,
      'required', p_price_eur
    );
  END IF;

  -- 4. Debit
  v_new_balance := v_balance - p_price_eur;
  UPDATE public.workspaces
  SET balance_eur = v_new_balance, updated_at = now()
  WHERE id = p_consumer_id;

  -- 5. Record credit transaction
  INSERT INTO public.credit_transactions (
    consumer_workspace_id, publisher_workspace_id,
    type, amount_eur, content_url, catalog_id, description
  ) VALUES (
    p_consumer_id, p_publisher_id,
    'debit', -p_price_eur, p_url, p_catalog_id,
    'SDK access grant'
  );

  -- 6. Create grant with agent_id for cross-validation
  v_expires_at := now() + (p_ttl_minutes || ' minutes')::INTERVAL;

  INSERT INTO public.access_grants (
    consumer_workspace_id, publisher_workspace_id,
    url, catalog_id, agent_id, price_eur, expires_at
  ) VALUES (
    p_consumer_id, p_publisher_id,
    p_url, p_catalog_id, p_agent_id, p_price_eur, v_expires_at
  )
  ON CONFLICT (consumer_workspace_id, url) DO UPDATE
    SET expires_at = v_expires_at,
        agent_id   = p_agent_id;

  RETURN jsonb_build_object(
    'success',     true,
    'cached',      false,
    'grant_id',    (
      SELECT id FROM public.access_grants
      WHERE consumer_workspace_id = p_consumer_id AND url = p_url
    ),
    'expires_at',  v_expires_at,
    'new_balance', v_new_balance
  );
END;
$$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.check_cache_and_debit(UUID,UUID,TEXT,UUID,UUID,NUMERIC,INTEGER);
-- DROP INDEX IF EXISTS idx_ag_agent_id;
-- ALTER TABLE public.access_grants DROP COLUMN IF EXISTS agent_id;
-- DROP TABLE IF EXISTS public.workspace_agents;
-- DROP TABLE IF EXISTS public.agents;
-- (would also need to recreate user_agents from backup)
