-- ============================================================================
-- Migration 029: Rename concepts for publisher-oriented vocabulary
-- ============================================================================
--
-- Renames the following tables / columns / functions to align with the
-- publisher-facing vocabulary used in the dashboard and SDK docs.
--
-- Tables:
--   agents             → bots
--   workspace_agents   → workspace_bots
--   catalog_agents     → catalog_bots
--   wallets            → bot_subscriptions
--   sources            → indexed_sources
--   import_jobs        → indexing_jobs
--
-- Columns:
--   *.agent_id              → *.bot_id
--   api_keys.wallet_id      → api_keys.bot_subscription_id
--   credit_transactions.wallet_id → credit_transactions.bot_subscription_id
--   chunks.source_id        → chunks.indexed_source_id
--   catalog_sources.source_id → catalog_sources.indexed_source_id
--
-- Functions (renamed):
--   credit_wallet                        → credit_bot_subscription
--   prevent_delete_wallet_with_balance   → prevent_delete_bot_subscription_with_balance
--   check_agent_has_ips                  → check_bot_has_ips
--
-- Functions (re-emitted with same name, updated body):
--   authorize_and_debit_batch (refs bot_subscriptions, bot_id)
--   vector_search             (refs indexed_sources, indexed_source_id)
--   get_domain_content_counts (refs indexed_sources)
--
-- Cleanup:
--   The trigger trg_delete_contents_on_domain_delete from migration 008
--   referenced public.contents (renamed to chunks in migration 016) and was
--   already broken. The cascade chain domains → indexed_sources → chunks now
--   handles deletion natively, so the trigger is dropped here.
--
-- IMPORTANT: No production data exists. Safe to run as a single transaction.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. Drop obsolete trigger (broken since migration 016)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_delete_contents_on_domain_delete ON public.domains;
DROP FUNCTION IF EXISTS public.delete_contents_on_domain_delete();


-- ============================================================================
-- 2. Drop functions whose bodies will be re-emitted with new identifiers.
--    PostgreSQL plpgsql defers name resolution to call time, so the bodies
--    referencing the about-to-be-renamed tables would otherwise fail at the
--    next call.
-- ============================================================================

DROP FUNCTION IF EXISTS public.authorize_and_debit_batch(UUID, JSONB);
DROP FUNCTION IF EXISTS public.vector_search(vector(1536), UUID[], INT);
DROP FUNCTION IF EXISTS public.get_domain_content_counts(UUID);


-- ============================================================================
-- 3. Drop triggers whose underlying functions will be renamed
-- ============================================================================

DROP TRIGGER IF EXISTS trg_wallets_prevent_delete_with_balance ON public.wallets;
DROP FUNCTION IF EXISTS public.prevent_delete_wallet_with_balance();

DROP TRIGGER IF EXISTS trg_catalog_agents_require_ips ON public.catalog_agents;
DROP FUNCTION IF EXISTS public.check_agent_has_ips();

DROP FUNCTION IF EXISTS public.credit_wallet(UUID, NUMERIC, TEXT, TEXT);


-- ============================================================================
-- 4. Rename tables
-- ============================================================================

ALTER TABLE public.agents             RENAME TO bots;
ALTER TABLE public.workspace_agents   RENAME TO workspace_bots;
ALTER TABLE public.catalog_agents     RENAME TO catalog_bots;
ALTER TABLE public.wallets            RENAME TO bot_subscriptions;
ALTER TABLE public.sources            RENAME TO indexed_sources;
ALTER TABLE public.import_jobs        RENAME TO indexing_jobs;


-- ============================================================================
-- 5. Rename FK columns
-- ============================================================================

ALTER TABLE public.access_grants        RENAME COLUMN agent_id  TO bot_id;
ALTER TABLE public.workspace_bots       RENAME COLUMN agent_id  TO bot_id;
ALTER TABLE public.catalog_bots         RENAME COLUMN agent_id  TO bot_id;
ALTER TABLE public.bot_subscriptions    RENAME COLUMN agent_id  TO bot_id;
ALTER TABLE public.api_keys             RENAME COLUMN agent_id  TO bot_id;
ALTER TABLE public.api_keys             RENAME COLUMN wallet_id TO bot_subscription_id;
ALTER TABLE public.credit_transactions  RENAME COLUMN agent_id  TO bot_id;
ALTER TABLE public.credit_transactions  RENAME COLUMN wallet_id TO bot_subscription_id;
ALTER TABLE public.catalog_sources      RENAME COLUMN source_id     TO indexed_source_id;
ALTER TABLE public.chunks               RENAME COLUMN source_id     TO indexed_source_id;
ALTER TABLE public.chunks               RENAME COLUMN import_job_id TO indexing_job_id;


-- ============================================================================
-- 6. Rename indexes for consistency (cosmetic — names embed renamed concepts)
-- ============================================================================

-- bots / workspace_bots / catalog_bots
ALTER INDEX IF EXISTS idx_workspace_agents_agent_id     RENAME TO idx_workspace_bots_bot_id;
ALTER INDEX IF EXISTS idx_workspace_agents_workspace_id RENAME TO idx_workspace_bots_workspace_id;
ALTER INDEX IF EXISTS idx_catalog_agents_agent_id       RENAME TO idx_catalog_bots_bot_id;
ALTER INDEX IF EXISTS idx_catalog_agents_catalog_id     RENAME TO idx_catalog_bots_catalog_id;

-- bot_subscriptions (was wallets)
ALTER INDEX IF EXISTS idx_wallets_workspace             RENAME TO idx_bot_subscriptions_workspace;
ALTER INDEX IF EXISTS idx_wallets_workspace_agent       RENAME TO idx_bot_subscriptions_workspace_bot;
ALTER INDEX IF EXISTS wallets_ws_agent_external_user_uidx RENAME TO bot_subscriptions_ws_bot_external_user_uidx;

-- api_keys
ALTER INDEX IF EXISTS idx_api_keys_wallet               RENAME TO idx_api_keys_bot_subscription;

-- credit_transactions
ALTER INDEX IF EXISTS idx_ct_wallet                     RENAME TO idx_ct_bot_subscription;

-- indexed_sources / catalog_sources / chunks
ALTER INDEX IF EXISTS idx_sources_domain_id             RENAME TO idx_indexed_sources_domain_id;
ALTER INDEX IF EXISTS idx_sources_workspace_id          RENAME TO idx_indexed_sources_workspace_id;
ALTER INDEX IF EXISTS idx_catalog_sources_source        RENAME TO idx_catalog_sources_indexed_source;
ALTER INDEX IF EXISTS idx_chunks_source_id              RENAME TO idx_chunks_indexed_source_id;

-- indexing_jobs (was import_jobs)
ALTER INDEX IF EXISTS idx_import_jobs_workspace_id      RENAME TO idx_indexing_jobs_workspace_id;
ALTER INDEX IF EXISTS idx_import_jobs_domain_id         RENAME TO idx_indexing_jobs_domain_id;
ALTER INDEX IF EXISTS idx_import_jobs_status            RENAME TO idx_indexing_jobs_status;
-- chunks.import_job_id was renamed above to indexing_job_id; the underlying
-- index name follows the column name convention.
ALTER INDEX IF EXISTS idx_chunks_import_job_id          RENAME TO idx_chunks_indexing_job_id;


-- ============================================================================
-- 7. Rename CHECK / FK constraints whose names embed renamed concepts
-- ============================================================================

ALTER TABLE public.bot_subscriptions
  RENAME CONSTRAINT wallets_balance_non_negative TO bot_subscriptions_balance_non_negative;

ALTER TABLE public.bot_subscriptions
  RENAME CONSTRAINT wallets_workspace_agent_fkey TO bot_subscriptions_workspace_bot_fkey;


-- ============================================================================
-- 8. Re-emit functions with updated bodies
-- ============================================================================

-- 8a. authorize_and_debit_batch (latest body from migration 025, references
--     renamed tables/columns)
CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
  p_api_key_id UUID,
  p_debits     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id        UUID;
  v_bot_id              UUID;
  v_bot_subscription_id UUID;
  v_debit               JSONB;
  v_balance             NUMERIC;
  v_new_balance         NUMERIC;
  v_total_cost          NUMERIC := 0;
  v_grants              JSONB   := '[]'::JSONB;
  v_cached_grant        public.access_grants%ROWTYPE;
  v_grant_id            UUID;
  v_expires_at          TIMESTAMPTZ;
  v_url                 TEXT;
  v_price               NUMERIC;
  v_ttl                 INTEGER;
  v_publisher_id        UUID;
  v_catalog_id          UUID;
  v_debit_bot           UUID;
  v_ua_pattern          TEXT;
BEGIN
  -- Resolve (workspace_id, bot_id, bot_subscription_id) from the API key.
  SELECT workspace_id, bot_id, bot_subscription_id
    INTO v_workspace_id, v_bot_id, v_bot_subscription_id
  FROM public.api_keys
  WHERE id = p_api_key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found: %', p_api_key_id;
  END IF;

  -- ----------------------------------------------------------------
  -- PASS 1: Check cache for each URL, calculate total cost
  -- ----------------------------------------------------------------
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url   := v_debit->>'url';
    v_price := (v_debit->>'price_eur')::NUMERIC;

    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE consumer_workspace_id = v_workspace_id
      AND url = v_url
      AND expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   v_cached_grant.id,
        'expires_at', v_cached_grant.expires_at,
        'cached',     true
      );
    ELSE
      v_total_cost := v_total_cost + v_price;
      v_grants := v_grants || jsonb_build_object(
        'url',         v_url,
        'grant_id',    NULL,
        'expires_at',  NULL,
        'cached',      false,
        '_price',      v_price,
        '_publisher',  v_debit->>'publisher_workspace_id',
        '_catalog',    v_debit->>'catalog_id',
        '_bot',        v_debit->>'bot_id',
        '_ua_pattern', v_debit->>'ua_pattern',
        '_ttl',        (v_debit->>'ttl_minutes')::INTEGER
      );
    END IF;
  END LOOP;

  -- If everything is cached, return current balance immediately
  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.bot_subscriptions WHERE id = v_bot_subscription_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'bot_subscription_not_found: bot_subscription=%', v_bot_subscription_id;
    END IF;

    v_grants := (
      SELECT jsonb_agg(
        g - '_price' - '_publisher' - '_catalog' - '_bot' - '_ua_pattern' - '_ttl'
      )
      FROM jsonb_array_elements(v_grants) AS g
    );

    RETURN jsonb_build_object(
      'success',     true,
      'new_balance', v_balance,
      'grants',      v_grants
    );
  END IF;

  -- ----------------------------------------------------------------
  -- PASS 2: Lock subscription, verify, debit, create grants
  -- ----------------------------------------------------------------
  SELECT balance_eur INTO v_balance
  FROM public.bot_subscriptions
  WHERE id = v_bot_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bot_subscription_not_found: bot_subscription=%', v_bot_subscription_id;
  END IF;

  IF v_balance < v_total_cost THEN
    RETURN jsonb_build_object(
      'success',  false,
      'reason',   'insufficient_balance',
      'balance',  v_balance,
      'required', v_total_cost
    );
  END IF;

  v_new_balance := v_balance - v_total_cost;
  UPDATE public.bot_subscriptions
  SET balance_eur = v_new_balance
  WHERE id = v_bot_subscription_id;

  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    IF (v_debit->>'cached')::BOOLEAN THEN
      CONTINUE;
    END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_debit_bot    := (v_debit->>'_bot')::UUID;
    v_ua_pattern   := v_debit->>'_ua_pattern';
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id,
      url, catalog_id, bot_id, ua_pattern, price_eur, expires_at
    ) VALUES (
      v_workspace_id, v_publisher_id,
      v_url, v_catalog_id, v_debit_bot, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (consumer_workspace_id, url) DO UPDATE
      SET expires_at = v_expires_at,
          bot_id     = v_debit_bot,
          ua_pattern = v_ua_pattern,
          catalog_id = v_catalog_id,
          price_eur  = v_price
    RETURNING id INTO v_grant_id;

    INSERT INTO public.credit_transactions (
      consumer_workspace_id, publisher_workspace_id,
      type, amount_eur, content_url, catalog_id, grant_id,
      bot_id, bot_subscription_id, api_key_id, description
    ) VALUES (
      v_workspace_id, v_publisher_id,
      'debit', -v_price, v_url, v_catalog_id, v_grant_id,
      v_bot_id, v_bot_subscription_id, p_api_key_id, 'Content access grant'
    );
  END LOOP;

  v_grants := (
    SELECT jsonb_agg(
      CASE
        WHEN (g->>'cached')::BOOLEAN THEN
          g - '_price' - '_publisher' - '_catalog' - '_bot' - '_ua_pattern' - '_ttl'
        ELSE
          jsonb_build_object(
            'url',        g->>'url',
            'grant_id',   (
              SELECT id FROM public.access_grants
              WHERE consumer_workspace_id = v_workspace_id AND url = g->>'url'
            ),
            'expires_at', (
              SELECT expires_at FROM public.access_grants
              WHERE consumer_workspace_id = v_workspace_id AND url = g->>'url'
            ),
            'cached',     false
          )
      END
    )
    FROM jsonb_array_elements(v_grants) AS g
  );

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_new_balance,
    'grants',      v_grants
  );
END;
$$;


-- 8b. credit_bot_subscription (renamed from credit_wallet, body updated)
CREATE OR REPLACE FUNCTION public.credit_bot_subscription(
  p_api_key_id   UUID,
  p_amount_eur   NUMERIC,
  p_external_ref TEXT DEFAULT NULL,
  p_description  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id        UUID;
  v_bot_id              UUID;
  v_bot_subscription_id UUID;
  v_revoked_at          TIMESTAMPTZ;
  v_new_balance         NUMERIC;
  v_tx_id               UUID;
BEGIN
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: %', p_amount_eur
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT workspace_id, bot_id, bot_subscription_id, revoked_at
    INTO v_workspace_id, v_bot_id, v_bot_subscription_id, v_revoked_at
  FROM public.api_keys
  WHERE id = p_api_key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_not_found: %', p_api_key_id;
  END IF;

  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'api_key_revoked: %', p_api_key_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency short-circuit
  IF p_external_ref IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM public.credit_transactions
    WHERE external_ref = p_external_ref;

    IF FOUND THEN
      SELECT balance_eur INTO v_new_balance
      FROM public.bot_subscriptions WHERE id = v_bot_subscription_id;
      RETURN jsonb_build_object(
        'success',        true,
        'idempotent_hit', true,
        'transaction_id', v_tx_id,
        'new_balance',    v_new_balance
      );
    END IF;
  END IF;

  UPDATE public.bot_subscriptions
  SET balance_eur = balance_eur + p_amount_eur
  WHERE id = v_bot_subscription_id
  RETURNING balance_eur INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bot_subscription_not_found: %', v_bot_subscription_id;
  END IF;

  INSERT INTO public.credit_transactions (
    consumer_workspace_id, publisher_workspace_id,
    type, amount_eur, bot_id, bot_subscription_id, api_key_id,
    external_ref, description
  ) VALUES (
    v_workspace_id, NULL,
    'credit', p_amount_eur, v_bot_id, v_bot_subscription_id, p_api_key_id,
    p_external_ref, p_description
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success',        true,
    'idempotent_hit', false,
    'transaction_id', v_tx_id,
    'new_balance',    v_new_balance
  );
END;
$$;


-- 8c. prevent_delete_bot_subscription_with_balance (renamed from
--     prevent_delete_wallet_with_balance) + recreate trigger
CREATE OR REPLACE FUNCTION public.prevent_delete_bot_subscription_with_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.balance_eur > 0 THEN
    RAISE EXCEPTION
      'bot_subscription_has_balance: bot_subscription=% balance=% — refund before deleting',
      OLD.id, OLD.balance_eur
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_bot_subscriptions_prevent_delete_with_balance
  BEFORE DELETE ON public.bot_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_bot_subscription_with_balance();


-- 8d. check_bot_has_ips (renamed from check_agent_has_ips) + recreate trigger
CREATE OR REPLACE FUNCTION public.check_bot_has_ips()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bots
    WHERE id = NEW.bot_id AND array_length(declared_ips, 1) >= 1
  ) THEN
    RAISE EXCEPTION 'bot_missing_declared_ips: bot % has no declared IPs', NEW.bot_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalog_bots_require_ips
  BEFORE INSERT OR UPDATE ON public.catalog_bots
  FOR EACH ROW EXECUTE FUNCTION public.check_bot_has_ips();


-- 8e. vector_search (refs chunks.indexed_source_id, indexed_sources, catalog_sources.indexed_source_id)
CREATE OR REPLACE FUNCTION public.vector_search(
  p_query_embedding vector(1536),
  p_catalog_ids UUID[],
  p_limit INT DEFAULT 30
)
RETURNS TABLE(
  chunk_id UUID,
  indexed_source_id UUID,
  source_url TEXT,
  chunk_text TEXT,
  heading_context TEXT,
  token_count INT,
  distance FLOAT,
  price_eur NUMERIC,
  catalog_id UUID,
  catalog_name TEXT,
  publisher_workspace_id UUID
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ch.id AS chunk_id,
    s.id AS indexed_source_id,
    s.source_url,
    ch.chunk_text,
    ch.heading_context,
    ch.token_count,
    (ch.embedding <=> p_query_embedding)::FLOAT AS distance,
    cat.price_eur,
    cat.id AS catalog_id,
    cat.name AS catalog_name,
    cat.workspace_id AS publisher_workspace_id
  FROM public.chunks ch
  JOIN public.indexed_sources s ON s.id = ch.indexed_source_id
  JOIN public.catalog_sources cs ON cs.indexed_source_id = s.id
  JOIN public.catalogs cat ON cat.id = cs.catalog_id
  WHERE cs.catalog_id = ANY(p_catalog_ids)
    AND ch.embedding IS NOT NULL
  ORDER BY ch.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
$$;


-- 8f. get_domain_content_counts (refs indexed_sources)
CREATE OR REPLACE FUNCTION public.get_domain_content_counts(p_workspace_id UUID)
RETURNS TABLE(domain_id UUID, content_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT domain_id, COUNT(*) as content_count
  FROM public.indexed_sources
  WHERE workspace_id = p_workspace_id
  GROUP BY domain_id;
$$;


-- ============================================================================
-- 9. Rename RLS policies whose names embed renamed concepts (cosmetic)
-- ============================================================================

-- bot_subscriptions (was wallets)
ALTER POLICY "workspace_members_read_wallets"  ON public.bot_subscriptions
  RENAME TO "workspace_members_read_bot_subscriptions";
ALTER POLICY "workspace_admins_write_wallets"  ON public.bot_subscriptions
  RENAME TO "workspace_admins_write_bot_subscriptions";

-- indexed_sources (was sources)
ALTER POLICY "sources_select_own" ON public.indexed_sources RENAME TO "indexed_sources_select_own";
ALTER POLICY "sources_insert_own" ON public.indexed_sources RENAME TO "indexed_sources_insert_own";
ALTER POLICY "sources_update_own" ON public.indexed_sources RENAME TO "indexed_sources_update_own";
ALTER POLICY "sources_delete_own" ON public.indexed_sources RENAME TO "indexed_sources_delete_own";


-- ============================================================================
-- 10. Comments
-- ============================================================================

COMMENT ON TABLE public.bots IS
  'Global bot registry. Replaces "agents" (renamed in migration 029).';

COMMENT ON TABLE public.workspace_bots IS
  'Junction: a workspace subscribes to one or more bots. Replaces "workspace_agents".';

COMMENT ON TABLE public.catalog_bots IS
  'Junction: which bots a catalog authorizes. Replaces "catalog_agents".';

COMMENT ON TABLE public.bot_subscriptions IS
  'Per-bot prepaid balance for a consumer workspace. Replaces "wallets" (avoids '
  'crypto/blockchain confusion with the term wallet).';

COMMENT ON TABLE public.indexed_sources IS
  'Indexed content sources (one row per URL). Replaces "sources".';

COMMENT ON TABLE public.indexing_jobs IS
  'Background indexing jobs (sitemap crawl, content fetch). Replaces "import_jobs".';


COMMIT;


-- ============================================================================
-- ROLLBACK (manual — verify before running)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE public.bots               RENAME TO agents;
-- ALTER TABLE public.workspace_bots     RENAME TO workspace_agents;
-- ALTER TABLE public.catalog_bots       RENAME TO catalog_agents;
-- ALTER TABLE public.bot_subscriptions  RENAME TO wallets;
-- ALTER TABLE public.indexed_sources    RENAME TO sources;
-- ALTER TABLE public.indexing_jobs      RENAME TO import_jobs;
-- ALTER TABLE public.access_grants       RENAME COLUMN bot_id              TO agent_id;
-- ALTER TABLE public.workspace_agents    RENAME COLUMN bot_id              TO agent_id;
-- ALTER TABLE public.catalog_agents      RENAME COLUMN bot_id              TO agent_id;
-- ALTER TABLE public.wallets             RENAME COLUMN bot_id              TO agent_id;
-- ALTER TABLE public.api_keys            RENAME COLUMN bot_id              TO agent_id;
-- ALTER TABLE public.api_keys            RENAME COLUMN bot_subscription_id TO wallet_id;
-- ALTER TABLE public.credit_transactions RENAME COLUMN bot_id              TO agent_id;
-- ALTER TABLE public.credit_transactions RENAME COLUMN bot_subscription_id TO wallet_id;
-- ALTER TABLE public.catalog_sources     RENAME COLUMN indexed_source_id   TO source_id;
-- ALTER TABLE public.chunks              RENAME COLUMN indexed_source_id   TO source_id;
-- ALTER TABLE public.chunks              RENAME COLUMN indexing_job_id     TO import_job_id;
-- (then re-apply migrations 008, 016, 022, 025 to restore old function/trigger bodies)
-- COMMIT;
-- ============================================================================
