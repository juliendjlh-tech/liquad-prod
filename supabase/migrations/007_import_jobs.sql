-- ============================================================================
-- Migration 007: Import Jobs + Domain Content Count RPC
-- ============================================================================
--
-- This migration adds:
--   1. import_jobs table: tracks async sitemap import jobs
--   2. get_domain_content_counts RPC: efficient GROUP BY count for domains
--
-- CONTEXT:
-- Sitemap imports can take minutes for large sites (e.g., news publishers).
-- The import_jobs table enables async processing: the API returns immediately
-- with a job ID, processes in background, and the frontend polls for status.
--
-- The RPC function replaces N+1 COUNT queries with a single GROUP BY query,
-- improving performance for workspaces with many domains.
-- ============================================================================


-- ============================================================================
-- TABLE: import_jobs
-- ============================================================================
-- Tracks the lifecycle of a sitemap import: pending → processing → completed/failed.
-- The result column stores { imported, upserted } on success.
-- The error_message column stores the error string on failure.
-- ============================================================================
CREATE TABLE public.import_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sitemap_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_jobs_workspace ON public.import_jobs(workspace_id, created_at DESC);


-- ============================================================================
-- FUNCTION: get_domain_content_counts
-- ============================================================================
-- Returns content count per domain for a workspace in a single query.
-- Replaces N+1 individual COUNT queries with one GROUP BY.
--
-- Usage: SELECT * FROM get_domain_content_counts('workspace-uuid');
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_domain_content_counts(p_workspace_id UUID)
RETURNS TABLE(domain TEXT, content_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT domain, COUNT(*) as content_count
  FROM public.contents
  WHERE workspace_id = p_workspace_id
  GROUP BY domain;
$$;


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.get_domain_content_counts(UUID);
-- DROP TABLE IF EXISTS public.import_jobs CASCADE;
-- ============================================================================
