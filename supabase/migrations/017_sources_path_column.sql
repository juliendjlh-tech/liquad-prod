-- ============================================================================
-- Migration 017: Add generated `path` column to sources
-- ============================================================================
--
-- Adds a stored generated column `path` extracted from `source_url`.
-- This enables efficient SQL-side filtering by path in searchSources,
-- using the same filter_rules logic as catalogs (starts_with, contains, etc.).
--
-- Combined with the existing `domain_id` FK, this allows:
--   WHERE domain_id = X AND path LIKE '/blog%'
-- without runtime URL parsing.
-- ============================================================================


-- 1. Add generated column
ALTER TABLE public.sources
  ADD COLUMN path text
  GENERATED ALWAYS AS (
    substring(source_url FROM 'https?://[^/]+(.*)')
  ) STORED;

-- 2. Index for searchSources queries (workspace + domain + path)
CREATE INDEX idx_sources_ws_domain_path
  ON public.sources(workspace_id, domain_id, path);


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- DROP INDEX IF EXISTS idx_sources_ws_domain_path;
-- ALTER TABLE public.sources DROP COLUMN IF EXISTS path;
