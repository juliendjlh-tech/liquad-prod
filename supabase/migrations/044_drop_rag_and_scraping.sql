-- ============================================================================
-- Migration 044: Drop RAG and scraping pipeline (MVP simplification)
-- ============================================================================
--
-- RAG (vector search on scraped chunks) and the scraping pipeline are
-- deprecated for the MVP. The transactional flow (/licenses, /sources, /rules)
-- keeps using `sources` + `catalog_sources` (populated by sitemap import),
-- which are NOT touched by this migration.
--
-- Dropped:
--   - chunks                        (scraped text + embeddings)
--   - search_configs                (consumer search presets)
--   - search_config_catalogs        (junction)
--   - rag_query_logs                (consumer query history)
--   - catalogs.rag_enabled          (RAG opt-in flag)
--   - catalogs.rag_source_count     (denormalized counter)
--   - import_jobs.scrape_*          (scraping pipeline state)
--   - vector_search                 (RPC over pgvector)
--
-- Kept:
--   - indexed_sources, catalog_sources  (URL list, used by /licenses)
--   - indexing_jobs (sitemap fields)    (sitemap import remains)
--   - pgvector extension                (idempotent, harmless if unused)
--
-- Note: tables were renamed in migration 029
--   sources      → indexed_sources
--   import_jobs  → indexing_jobs
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. Drop the RPC that depends on chunks
-- ============================================================================

DROP FUNCTION IF EXISTS public.vector_search(vector(1536), UUID[], INT);


-- ============================================================================
-- 2. Drop RAG-side tables
-- ============================================================================
-- chunks: holds scraped text + embeddings. HNSW index + RLS cascade with the
-- table. CASCADE on DROP TABLE handles dependents we may have missed.

DROP TABLE IF EXISTS public.chunks CASCADE;

-- rag_query_logs: consumer query history (FK to search_configs is ON DELETE
-- SET NULL, so order with search_configs doesn't matter — but drop logs first
-- to avoid SET NULL writes during the search_configs drop).
DROP TABLE IF EXISTS public.rag_query_logs CASCADE;

-- search_config_catalogs (junction) then search_configs.
DROP TABLE IF EXISTS public.search_config_catalogs CASCADE;
DROP TABLE IF EXISTS public.search_configs        CASCADE;


-- ============================================================================
-- 3. Drop RAG columns from catalogs
-- ============================================================================

ALTER TABLE public.catalogs
  DROP COLUMN IF EXISTS rag_enabled,
  DROP COLUMN IF EXISTS rag_source_count;


-- ============================================================================
-- 4. Drop scraping pipeline columns from indexing_jobs
-- ============================================================================
-- Sitemap-import columns (status, totals, etc.) are kept — they predate the
-- scraping pipeline and are still used to populate `indexed_sources`.

ALTER TABLE public.indexing_jobs
  DROP COLUMN IF EXISTS scrape_status,
  DROP COLUMN IF EXISTS scrape_total_pages,
  DROP COLUMN IF EXISTS scrape_processed_pages,
  DROP COLUMN IF EXISTS last_processed_content_id,
  DROP COLUMN IF EXISTS scrape_chunk_count,
  DROP COLUMN IF EXISTS scrape_error_message;


COMMIT;


-- ============================================================================
-- ROLLBACK (manual — data in chunks/search_configs/rag_query_logs is lost)
-- ============================================================================
-- BEGIN;
--   -- Restore catalog flags
--   ALTER TABLE public.catalogs
--     ADD COLUMN rag_enabled BOOLEAN DEFAULT false,
--     ADD COLUMN rag_source_count INT DEFAULT 0;
--
--   -- Restore indexing_jobs scraping columns
--   ALTER TABLE public.indexing_jobs
--     ADD COLUMN scrape_status TEXT DEFAULT 'none'
--       CHECK (scrape_status IN ('none','pending','scraping','scraped','error','pending_retry')),
--     ADD COLUMN scrape_total_pages INT,
--     ADD COLUMN scrape_processed_pages INT DEFAULT 0,
--     ADD COLUMN last_processed_content_id UUID,
--     ADD COLUMN scrape_chunk_count INT DEFAULT 0,
--     ADD COLUMN scrape_error_message TEXT;
--
--   -- For chunks / search_configs / rag_query_logs / vector_search RPC:
--   -- see migrations 013, 016 — re-apply the relevant CREATE TABLE / CREATE
--   -- FUNCTION blocks.
-- COMMIT;
