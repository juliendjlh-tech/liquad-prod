-- Migration 037: Move per-call /licenses parameters onto the subscription.
--
-- - max_price_eur: optional ceiling applied at authorize-time. NULL = no cap.
-- - catalog_ids:   restricts which catalogs the subscription can see/spend on.
--                  Empty array = "all eligible catalogs" (back-compat default for
--                  existing rows). Not a FK array — orphaned ids are tolerated
--                  and silently filtered out by filterAccessibleCatalogs.

ALTER TABLE public.subscriptions
  ADD COLUMN max_price_eur NUMERIC(10, 4) NULL,
  ADD COLUMN catalog_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_max_price_eur_nonneg_chk
  CHECK (max_price_eur IS NULL OR max_price_eur >= 0);
