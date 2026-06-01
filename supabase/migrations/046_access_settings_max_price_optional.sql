-- ============================================================================
-- Migration 046: access_settings.max_price_eur becomes optional (NULL = no cap)
-- ============================================================================
--
-- Default semantics:
--   - NOT NULL value : cap as before — runtime skips catalogues whose
--                       price_eur exceeds the cap.
--   - NULL          : no cap — every catalogue in the plan is eligible
--                       regardless of price.
--
-- Updates the authorize_and_debit_batch RPC to honor the NULL case.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. Make the column nullable. The CHECK >= 0 stays — applies only when set.
-- ============================================================================

ALTER TABLE public.access_settings
  ALTER COLUMN max_price_eur DROP NOT NULL;

COMMENT ON COLUMN public.access_settings.max_price_eur IS
  'Optional plafond per-grant. NULL = no cap (every catalogue in the plan '
  'is eligible regardless of publisher price). When set, runtime skips '
  'catalogues whose catalog.price_eur exceeds this value.';


-- ============================================================================
-- 2. Rewrite authorize_and_debit_batch: skip max_price guard when NULL.
-- ============================================================================
-- Only the max_price check inside PASS 1 changes. The rest is identical to
-- migration 045 — preserved here for self-containment.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.authorize_and_debit_batch(
  p_api_key_id UUID,
  p_debits     JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consumer_ws    UUID;
  v_subscription   UUID;
  v_access_set     UUID;
  v_bot            UUID;
  v_ua_pattern     TEXT;
  v_max_price      NUMERIC;
  v_referral_ws    UUID;
  v_debit          JSONB;
  v_balance        NUMERIC;
  v_new_balance    NUMERIC;
  v_total_cost     NUMERIC := 0;
  v_grants         JSONB   := '[]'::JSONB;
  v_cached_grant   public.access_grants%ROWTYPE;
  v_grant_id       UUID;
  v_expires_at     TIMESTAMPTZ;
  v_url            TEXT;
  v_price          NUMERIC;
  v_actual_price   NUMERIC;
  v_ttl            INTEGER;
  v_publisher_id   UUID;
  v_catalog_id     UUID;
  v_amount_co      NUMERIC;
  v_amount_sm      NUMERIC;
  v_amount_pf      NUMERIC;
BEGIN
  SELECT ak.workspace_id, ak.subscription_id, ak.access_settings_id, ak.bot_id,
         b.ua_pattern, as_t.max_price_eur, ws.referral_workspace_id
    INTO v_consumer_ws, v_subscription, v_access_set, v_bot,
         v_ua_pattern, v_max_price, v_referral_ws
  FROM public.api_keys        ak
  JOIN public.bots            b    ON b.id    = ak.bot_id
  JOIN public.access_settings as_t ON as_t.id = ak.access_settings_id
  JOIN public.workspaces      ws   ON ws.id   = ak.workspace_id
  WHERE ak.id = p_api_key_id;

  IF v_consumer_ws IS NULL THEN
    RAISE EXCEPTION 'api_key_not_found: api_key=%', p_api_key_id;
  END IF;

  -- PASS 1: per-URL cache check + membership check + (conditional) max_price guard.
  FOR v_debit IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_url        := v_debit->>'url';
    v_catalog_id := (v_debit->>'catalog_id')::UUID;

    SELECT * INTO v_cached_grant
    FROM public.access_grants
    WHERE api_key_id = p_api_key_id
      AND url        = v_url
      AND expires_at > now();

    IF FOUND THEN
      v_grants := v_grants || jsonb_build_object(
        'url',        v_url,
        'grant_id',   v_cached_grant.id,
        'expires_at', v_cached_grant.expires_at,
        'cached',     true
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.access_settings_catalogs
      WHERE access_settings_id = v_access_set
        AND catalog_id         = v_catalog_id
    ) THEN
      CONTINUE;
    END IF;

    SELECT price_eur INTO v_actual_price
    FROM public.catalogs WHERE id = v_catalog_id;

    IF v_actual_price IS NULL THEN
      CONTINUE;
    END IF;

    -- Conditional cap: when v_max_price IS NULL, no cap applies.
    IF v_max_price IS NOT NULL AND v_actual_price > v_max_price THEN
      CONTINUE;
    END IF;

    v_price := v_actual_price;
    v_total_cost := v_total_cost + v_price;
    v_grants := v_grants || jsonb_build_object(
      'url',                  v_url,
      'grant_id',             NULL,
      'expires_at',           NULL,
      'cached',               false,
      '_price',               v_price,
      '_publisher',           v_debit->>'publisher_workspace_id',
      '_catalog',             v_catalog_id::TEXT,
      '_ttl',                 (v_debit->>'ttl_minutes')::INTEGER,
      '_amount_content',      (v_debit->>'amount_content_owner')::NUMERIC,
      '_amount_sub_manager',  (v_debit->>'amount_sub_manager')::NUMERIC,
      '_amount_platform',     (v_debit->>'amount_platform_fee')::NUMERIC
    );
  END LOOP;

  IF v_total_cost <= 0 THEN
    SELECT balance_eur INTO v_balance
    FROM public.subscriptions WHERE id = v_subscription;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'subscription_not_found: subscription=%', v_subscription;
    END IF;

    v_grants := (
      SELECT COALESCE(jsonb_agg(
        g - '_price' - '_publisher' - '_catalog' - '_ttl'
          - '_amount_content' - '_amount_sub_manager' - '_amount_platform'
      ), '[]'::JSONB)
      FROM jsonb_array_elements(v_grants) AS g
    );

    RETURN jsonb_build_object(
      'success',     true,
      'new_balance', v_balance,
      'grants',      v_grants
    );
  END IF;

  -- PASS 2: lock subscription, balance check, debit, write grants + ledger.
  SELECT balance_eur INTO v_balance
  FROM public.subscriptions
  WHERE id = v_subscription
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found: subscription=%', v_subscription;
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
  UPDATE public.subscriptions
    SET balance_eur = v_new_balance
  WHERE id = v_subscription;

  FOR v_debit IN SELECT * FROM jsonb_array_elements(v_grants)
  LOOP
    IF (v_debit->>'cached')::BOOLEAN THEN CONTINUE; END IF;

    v_url          := v_debit->>'url';
    v_price        := (v_debit->>'_price')::NUMERIC;
    v_publisher_id := (v_debit->>'_publisher')::UUID;
    v_catalog_id   := (v_debit->>'_catalog')::UUID;
    v_ttl          := (v_debit->>'_ttl')::INTEGER;
    v_amount_co    := (v_debit->>'_amount_content')::NUMERIC;
    v_amount_sm    := (v_debit->>'_amount_sub_manager')::NUMERIC;
    v_amount_pf    := (v_debit->>'_amount_platform')::NUMERIC;
    v_expires_at   := now() + (v_ttl || ' minutes')::INTERVAL;

    INSERT INTO public.access_grants (
      consumer_workspace_id, publisher_workspace_id, api_key_id,
      url, catalog_id, bot_id, ua_pattern, price_eur, expires_at
    ) VALUES (
      v_consumer_ws, v_publisher_id, p_api_key_id,
      v_url, v_catalog_id, v_bot, v_ua_pattern, v_price, v_expires_at
    )
    ON CONFLICT (api_key_id, url) DO UPDATE
      SET expires_at = EXCLUDED.expires_at,
          catalog_id = EXCLUDED.catalog_id,
          bot_id     = EXCLUDED.bot_id,
          ua_pattern = EXCLUDED.ua_pattern,
          price_eur  = EXCLUDED.price_eur
    RETURNING id INTO v_grant_id;

    INSERT INTO public.credit_transactions
      (consumer_workspace_id, recipient_workspace_id, publisher_workspace_id,
       role, amount_eur,
       content_url, catalog_id, grant_id, bot_id, subscription_id, api_key_id, description)
    VALUES
      (v_consumer_ws, NULL,            v_publisher_id,
       'debit', -v_price,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Content access grant'),
      (v_consumer_ws, v_publisher_id,  v_publisher_id,
       'content_owner', v_amount_co,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Content owner share'),
      (v_consumer_ws, v_referral_ws,   v_publisher_id,
       'sub_manager', v_amount_sm,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Sub-manager share'),
      (v_consumer_ws, NULL,            v_publisher_id,
       'platform_fee', v_amount_pf,
       v_url, v_catalog_id, v_grant_id, v_bot, v_subscription, p_api_key_id,
       'Platform fee');
  END LOOP;

  v_grants := (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN (g->>'cached')::BOOLEAN THEN
          g - '_price' - '_publisher' - '_catalog' - '_ttl'
            - '_amount_content' - '_amount_sub_manager' - '_amount_platform'
        ELSE
          jsonb_build_object(
            'url',        g->>'url',
            'grant_id',   (SELECT id         FROM public.access_grants
                            WHERE api_key_id = p_api_key_id AND url = g->>'url'),
            'expires_at', (SELECT expires_at FROM public.access_grants
                            WHERE api_key_id = p_api_key_id AND url = g->>'url'),
            'cached',     false
          )
      END
    ), '[]'::JSONB)
    FROM jsonb_array_elements(v_grants) AS g
  );

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_new_balance,
    'grants',      v_grants
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.authorize_and_debit_batch(UUID, JSONB) TO authenticated;


COMMIT;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.access_settings
--     ALTER COLUMN max_price_eur SET NOT NULL;
--   -- Restore the migration 045 body of authorize_and_debit_batch.
-- COMMIT;
