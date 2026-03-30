-- ============================================================================
-- Migration 013: RAG Schema — Vector Search on Imported Content
-- ============================================================================
--
-- This migration adds RAG (Retrieval-Augmented Generation) capabilities:
--
--   1. Enable pgvector extension for vector similarity search
--   2. Extend contents table with chunk columns + embedding
--   3. Drop UNIQUE(workspace_id, source_url) — one URL now has N chunk rows
--   4. Create catalog_contents junction table (RAG-enabled catalogs ↔ chunks)
--   5. Create search_configs + search_config_catalogs (consumer search presets)
--   6. Extend import_jobs with scraping pipeline columns
--   7. Extend catalogs with rag_enabled + rag_chunk_count
--   8. Create rag_query_logs for consumer query history
--   9. Create vector_search RPC for pgvector queries
--  10. RLS policies for all new tables
--
-- REFERENCES:
--   - PRD: PRDs/prd-rag.md
-- ============================================================================


-- ============================================================================
-- DONE: 1. Enable pgvector extension
-- ============================================================================
-- pgvector provides the VECTOR data type and similarity operators (<=>)
-- needed for storing and searching embeddings.
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================================
-- DONE: 2. Extend contents table with chunk columns
-- ============================================================================
-- After scraping, each URL produces multiple chunk rows. Each chunk has:
-- - chunk_index: position of the chunk within the page (0, 1, 2, ...)
-- - chunk_text: the actual text content of the chunk
-- - heading_context: parent heading hierarchy (e.g. "Billing > Payments")
-- - token_count: approximate token count for the chunk
-- - embedding: 1536-dimensional vector from OpenAI text-embedding-3-small

ALTER TABLE public.contents ADD COLUMN chunk_index INT;
ALTER TABLE public.contents ADD COLUMN chunk_text TEXT;
ALTER TABLE public.contents ADD COLUMN heading_context TEXT;
ALTER TABLE public.contents ADD COLUMN token_count INT;
ALTER TABLE public.contents ADD COLUMN embedding vector(1536);


-- ============================================================================
-- DONE: 3. Drop UNIQUE constraint on (workspace_id, source_url)
-- ============================================================================
-- Before RAG: one row per URL (placeholder).
-- After RAG: one URL produces N chunk rows (one per chunk).
-- The old UNIQUE constraint prevents this, so we drop it.
-- Import now uses WHERE NOT EXISTS to avoid duplicate placeholders.

ALTER TABLE public.contents DROP CONSTRAINT IF EXISTS contents_workspace_id_source_url_key;

-- Backfill existing rows so they have a chunk_index (makes them identifiable
-- as placeholders when we later query "WHERE chunk_index IS NULL" for unscraped)
-- Existing rows are placeholders, so we do NOT set chunk_index — they stay NULL.
-- Only scraped chunks get a chunk_index (0, 1, 2, ...).


-- ============================================================================
-- DONE: 4. HNSW index for fast vector similarity search
-- ============================================================================
-- Partial index: only indexes rows that have an embedding (scraped chunks).
-- Placeholder rows (embedding IS NULL) are excluded from the index.
-- Uses cosine distance operator class (vector_cosine_ops) for <=> operator.

CREATE INDEX idx_contents_embedding
  ON public.contents
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;


-- ============================================================================
-- DONE 5. CREATE TABLE catalog_contents
-- ============================================================================
-- Junction table linking RAG-enabled catalogs to content chunks.
-- Populated when:
--   a) A catalog enables RAG (rag_enabled = true)
--   b) After scraping completes for a domain
-- Rows are automatically removed via ON DELETE CASCADE when either
-- the catalog or the content chunk is deleted.

CREATE TABLE public.catalog_contents (
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  PRIMARY KEY (catalog_id, content_id)
);

-- Index on content_id for reverse lookups (find all catalogs for a chunk)
CREATE INDEX idx_catalog_contents_content ON public.catalog_contents(content_id);


-- ============================================================================
-- DONE 6. Extend catalogs with RAG columns
-- ============================================================================
-- rag_enabled: publisher opt-in for RAG on this catalog.
--   When true, catalog_contents rows are created linking chunks to this catalog.
--   When false, catalog_contents rows are removed (chunks stay in contents).
-- rag_chunk_count: denormalized count of linked chunks for dashboard display.

ALTER TABLE public.catalogs ADD COLUMN rag_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.catalogs ADD COLUMN rag_chunk_count INT DEFAULT 0;


-- ============================================================================
-- DONE 7. CREATE TABLE search_configs
-- ============================================================================
-- Consumer-created search presets. Instead of passing the same parameters
-- on every RAG query, consumers can save a SearchConfig and reference it
-- by ID in their queries.

CREATE TABLE public.search_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path_filters JSONB DEFAULT '[]',
  max_price_eur NUMERIC(10,4),
  total_budget_eur NUMERIC(10,4),
  max_results INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_configs_workspace
  ON public.search_configs(workspace_id);


-- ============================================================================
-- DONE 8. CREATE TABLE rag_query_logs
-- ============================================================================
-- Logs every RAG query made by consumers for billing history and analytics.
-- Retention: 90 days (handled by pg_cron monthly cleanup).
-- Only visible to the consumer who made the query (RLS below).

CREATE TABLE public.rag_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  search_config_id UUID REFERENCES public.search_configs(id) ON DELETE SET NULL,
  total_cost_eur NUMERIC(10,4) NOT NULL DEFAULT 0,
  results JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rag_query_logs_consumer
  ON public.rag_query_logs(consumer_workspace_id, created_at DESC);


-- ============================================================================
-- 9. CREATE TABLE search_config_catalogs
-- ============================================================================
-- Junction table linking SearchConfigs to catalogs (many-to-many).
-- Uses FK with ON DELETE CASCADE — if a catalog is deleted, the link
-- is automatically removed (no orphan IDs).

CREATE TABLE public.search_config_catalogs (
  search_config_id UUID NOT NULL REFERENCES public.search_configs(id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  PRIMARY KEY (search_config_id, catalog_id)
);


-- ============================================================================
-- 10. CREATE FUNCTION vector_search
-- ============================================================================
-- RPC function that encapsulates pgvector's <=> (cosine distance) operator.
-- The Supabase JS client cannot express <=> natively, so we wrap it in a
-- function that can be called via supabase.rpc('vector_search', {...}).
--
-- Parameters:
--   p_query_embedding: the 1536-dim embedding of the user's search query
--   p_catalog_ids: array of catalog UUIDs to search within
--   p_limit: max number of results to return (over-fetched for dedup/filtering)
--
-- Returns a table of matching chunks sorted by cosine distance (ascending = most similar first).

CREATE OR REPLACE FUNCTION public.vector_search(
  p_query_embedding vector(1536),
  p_catalog_ids UUID[],
  p_limit INT DEFAULT 30
)
RETURNS TABLE(
  content_id UUID,
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
  -- Join contents → catalog_contents → catalogs to:
  -- 1. Only search within chunks linked to the specified catalogs
  -- 2. Return the catalog's price_eur for billing
  -- 3. Sort by cosine distance (lower = more similar)
  SELECT
    c.id AS content_id,
    c.source_url,
    c.chunk_text,
    c.heading_context,
    c.token_count,
    (c.embedding <=> p_query_embedding)::FLOAT AS distance,
    cat.price_eur,
    cat.id AS catalog_id,
    cat.name AS catalog_name,
    cat.workspace_id AS publisher_workspace_id
  FROM public.contents c
  JOIN public.catalog_contents cc ON cc.content_id = c.id
  JOIN public.catalogs cat ON cat.id = cc.catalog_id
  WHERE cc.catalog_id = ANY(p_catalog_ids)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
$$;


-- ============================================================================
-- 11. Extend import_jobs with scraping pipeline columns
-- ============================================================================
-- The existing import_jobs table tracks sitemap imports. We extend it to also
-- track the scraping pipeline that runs after import.
--
-- scrape_status lifecycle:
--   none → pending → scraping → scraped (success) or error (failure)
--   pending_retry is set by the health cron when a job is stuck > 10 min

ALTER TABLE public.import_jobs
  ADD COLUMN scrape_status TEXT DEFAULT 'none'
    CHECK (scrape_status IN ('none', 'pending', 'scraping', 'scraped', 'error', 'pending_retry'));

ALTER TABLE public.import_jobs ADD COLUMN scrape_total_pages INT;
ALTER TABLE public.import_jobs ADD COLUMN scrape_processed_pages INT DEFAULT 0;
ALTER TABLE public.import_jobs ADD COLUMN last_processed_content_id UUID;
ALTER TABLE public.import_jobs ADD COLUMN scrape_chunk_count INT DEFAULT 0;
ALTER TABLE public.import_jobs ADD COLUMN scrape_error_message TEXT;


-- ============================================================================
-- 12. RLS Policies
-- ============================================================================

-- catalog_contents: readable by workspace members (via catalogs join)
ALTER TABLE public.catalog_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_select_own ON public.catalog_contents
  FOR SELECT USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      WHERE c.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Service role inserts only (via scrape pipeline)
CREATE POLICY cc_insert_service ON public.catalog_contents
  FOR INSERT WITH CHECK (false);

-- search_configs: full access for workspace members
ALTER TABLE public.search_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sc_select_own ON public.search_configs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sc_insert_own ON public.search_configs
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sc_update_own ON public.search_configs
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sc_delete_own ON public.search_configs
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- search_config_catalogs: readable by config owner
ALTER TABLE public.search_config_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scc_select_own ON public.search_config_catalogs
  FOR SELECT USING (
    search_config_id IN (
      SELECT id FROM public.search_configs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY scc_insert_service ON public.search_config_catalogs
  FOR INSERT WITH CHECK (false);

-- rag_query_logs: only visible to the consumer who made the query
ALTER TABLE public.rag_query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY rql_select_own ON public.rag_query_logs
  FOR SELECT USING (
    consumer_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY rql_insert_service ON public.rag_query_logs
  FOR INSERT WITH CHECK (false);


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- DROP POLICY IF EXISTS rql_insert_service ON public.rag_query_logs;
-- DROP POLICY IF EXISTS rql_select_own ON public.rag_query_logs;
-- DROP POLICY IF EXISTS scc_insert_service ON public.search_config_catalogs;
-- DROP POLICY IF EXISTS scc_select_own ON public.search_config_catalogs;
-- DROP POLICY IF EXISTS sc_delete_own ON public.search_configs;
-- DROP POLICY IF EXISTS sc_update_own ON public.search_configs;
-- DROP POLICY IF EXISTS sc_insert_own ON public.search_configs;
-- DROP POLICY IF EXISTS sc_select_own ON public.search_configs;
-- DROP POLICY IF EXISTS cc_insert_service ON public.catalog_contents;
-- DROP POLICY IF EXISTS cc_select_own ON public.catalog_contents;
-- DROP FUNCTION IF EXISTS public.vector_search;
-- DROP TABLE IF EXISTS public.rag_query_logs CASCADE;
-- DROP TABLE IF EXISTS public.search_config_catalogs CASCADE;
-- DROP TABLE IF EXISTS public.search_configs CASCADE;
-- DROP TABLE IF EXISTS public.catalog_contents CASCADE;
-- ALTER TABLE public.catalogs DROP COLUMN IF EXISTS rag_chunk_count;
-- ALTER TABLE public.catalogs DROP COLUMN IF EXISTS rag_enabled;
-- ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS scrape_error_message;
-- ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS scrape_chunk_count;
-- ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS last_processed_content_id;
-- ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS scrape_processed_pages;
-- ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS scrape_total_pages;
-- ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS scrape_status;
-- ALTER TABLE public.contents DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE public.contents DROP COLUMN IF EXISTS token_count;
-- ALTER TABLE public.contents DROP COLUMN IF EXISTS heading_context;
-- ALTER TABLE public.contents DROP COLUMN IF EXISTS chunk_text;
-- ALTER TABLE public.contents DROP COLUMN IF EXISTS chunk_index;
-- ALTER TABLE public.contents ADD CONSTRAINT contents_workspace_id_source_url_key UNIQUE(workspace_id, source_url);
-- DROP EXTENSION IF EXISTS vector;
