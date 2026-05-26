-- Migration 036: Add Stripe-style public_id columns to user-facing tables.
-- Internal UUIDs remain the primary key; public_id is a separate UNIQUE column
-- used in every external/dashboard URL, API payload, and UI display.

-- Helper PL/pgSQL function to backfill rows with random short ids.
-- Defined inline (not stored) so we don't pollute the schema permanently.

DO $$
DECLARE
  r RECORD;
  alphabet TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  result TEXT;
  i INT;
  tables_and_prefixes TEXT[][] := ARRAY[
    ARRAY['bots',           'bot'],
    ARRAY['catalogs',       'cat'],
    ARRAY['domains',        'dom'],
    ARRAY['subscriptions',  'sub'],
    ARRAY['api_keys',       'key'],
    ARRAY['search_configs', 'sc'],
    ARRAY['workspaces',     'wks']
  ];
  tbl TEXT;
  prefix TEXT;
BEGIN
  FOR idx IN 1..array_length(tables_and_prefixes, 1) LOOP
    tbl := tables_and_prefixes[idx][1];
    prefix := tables_and_prefixes[idx][2];

    -- 1. Add nullable column
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS public_id TEXT', tbl);

    -- 2. Backfill existing rows
    FOR r IN EXECUTE format('SELECT id FROM public.%I WHERE public_id IS NULL', tbl) LOOP
      result := '';
      FOR i IN 1..8 LOOP
        result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXECUTE format('UPDATE public.%I SET public_id = %L WHERE id = %L', tbl, prefix || '_' || result, r.id);
    END LOOP;

    -- 3. Lock it down
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN public_id SET NOT NULL', tbl);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (public_id)', tbl, tbl || '_public_id_key');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (starts_with(public_id, %L))',
      tbl,
      tbl || '_public_id_prefix_chk',
      prefix || '_'
    );
  END LOOP;
END $$;
