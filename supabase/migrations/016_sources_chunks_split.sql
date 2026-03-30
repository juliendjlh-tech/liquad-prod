-- ============================================================================
-- Migration 016: Split contents into sources + chunks
-- ============================================================================
--
-- Separates the monolithic contents table into two normalized tables:
--   - sources: one row per URL (metadata: source_url, title, lastmod, domain_id)
--   - chunks:  N rows per source (RAG data: chunk_text, embedding, etc.)
--
-- Also replaces catalog_contents with catalog_sources (catalogs link to sources,
-- not individual chunks).
--
-- ============================================================================


-- ============================================================================
-- 1. Create sources table
-- ============================================================================

CREATE TABLE public.sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  title TEXT,
  lastmod TIMESTAMPTZ,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, source_url)
);

CREATE INDEX idx_sources_domain_id ON public.sources(domain_id);
CREATE INDEX idx_sources_workspace_id ON public.sources(workspace_id);


-- ============================================================================
-- 2. Migrate data: populate sources from contents (DISTINCT per URL)
-- ============================================================================

INSERT INTO public.sources (workspace_id, source_url, title, lastmod, domain_id, created_at)
SELECT DISTINCT ON (workspace_id, source_url)
  workspace_id, source_url, title, lastmod, domain_id, created_at
FROM public.contents
ORDER BY workspace_id, source_url, created_at ASC;


-- ============================================================================
-- 3. Add source_id to contents, populate it, then rename to chunks
-- ============================================================================

-- Add source_id column (nullable initially for migration)
ALTER TABLE public.contents ADD COLUMN source_id UUID;

-- Populate source_id by joining on workspace_id + source_url
UPDATE public.contents c
SET source_id = s.id
FROM public.sources s
WHERE c.workspace_id = s.workspace_id AND c.source_url = s.source_url;

-- Delete orphan rows (should not exist, but safety)
DELETE FROM public.contents WHERE source_id IS NULL;

-- Make NOT NULL and add FK
ALTER TABLE public.contents ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE public.contents
  ADD CONSTRAINT fk_chunks_source
  FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

CREATE INDEX idx_chunks_source_id ON public.contents(source_id);

-- Drop columns that now live in sources
ALTER TABLE public.contents DROP COLUMN source_url;
ALTER TABLE public.contents DROP COLUMN title;
ALTER TABLE public.contents DROP COLUMN lastmod;
ALTER TABLE public.contents DROP COLUMN workspace_id;

-- Drop the domain_id FK constraint first, then the column
ALTER TABLE public.contents DROP CONSTRAINT fk_contents_domain;
DROP INDEX IF EXISTS idx_contents_domain_id;
ALTER TABLE public.contents DROP COLUMN domain_id;

-- Rename table
ALTER TABLE public.contents RENAME TO chunks;


-- ============================================================================
-- 4. Replace catalog_contents with catalog_sources
-- ============================================================================

CREATE TABLE public.catalog_sources (
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  PRIMARY KEY (catalog_id, source_id)
);

CREATE INDEX idx_catalog_sources_source ON public.catalog_sources(source_id);

-- Migrate existing links: map content_id → source_id via chunks
INSERT INTO public.catalog_sources (catalog_id, source_id)
SELECT DISTINCT cc.catalog_id, ch.source_id
FROM public.catalog_contents cc
JOIN public.chunks ch ON ch.id = cc.content_id;

-- Drop old junction table (RLS policies cascade with it)
DROP TABLE public.catalog_contents CASCADE;


-- ============================================================================
-- 5. Rename rag_chunk_count → rag_source_count on catalogs
-- ============================================================================

ALTER TABLE public.catalogs RENAME COLUMN rag_chunk_count TO rag_source_count;


-- ============================================================================
-- 6. Update RPC: get_domain_content_counts → query sources
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_domain_content_counts(UUID);
CREATE FUNCTION public.get_domain_content_counts(p_workspace_id UUID)
RETURNS TABLE(domain_id UUID, content_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT domain_id, COUNT(*) as content_count
  FROM public.sources
  WHERE workspace_id = p_workspace_id
  GROUP BY domain_id;
$$;


-- ============================================================================
-- 7. Update RPC: vector_search → join chunks → sources → catalog_sources
-- ============================================================================

DROP FUNCTION IF EXISTS public.vector_search(vector(1536), UUID[], INT);
CREATE OR REPLACE FUNCTION public.vector_search(
  p_query_embedding vector(1536),
  p_catalog_ids UUID[],
  p_limit INT DEFAULT 30
)
RETURNS TABLE(
  chunk_id UUID,
  source_id UUID,
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
    s.id AS source_id,
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
  JOIN public.sources s ON s.id = ch.source_id
  JOIN public.catalog_sources cs ON cs.source_id = s.id
  JOIN public.catalogs cat ON cat.id = cs.catalog_id
  WHERE cs.catalog_id = ANY(p_catalog_ids)
    AND ch.embedding IS NOT NULL
  ORDER BY ch.embedding <=> p_query_embedding ASC
  LIMIT p_limit;
$$;


-- ============================================================================
-- 8. RLS policies for sources
-- ============================================================================

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY sources_select_own ON public.sources
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sources_insert_own ON public.sources
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sources_update_own ON public.sources
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sources_delete_own ON public.sources
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- 9. RLS policies for catalog_sources
-- ============================================================================

ALTER TABLE public.catalog_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY cs_select_own ON public.catalog_sources
  FOR SELECT USING (
    catalog_id IN (
      SELECT c.id FROM public.catalogs c
      WHERE c.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY cs_insert_service ON public.catalog_sources
  FOR INSERT WITH CHECK (false);


-- ============================================================================
-- 10. Update HNSW index name (table was renamed)
-- ============================================================================
-- The index idx_contents_embedding was automatically renamed when the table
-- was renamed. But let's ensure naming consistency.
ALTER INDEX IF EXISTS idx_contents_embedding RENAME TO idx_chunks_embedding;
ALTER INDEX IF EXISTS idx_contents_import_job_id RENAME TO idx_chunks_import_job_id;
