-- ============================================================================
-- Migration 014: Extend import_jobs with domain_id + urls_to_index
-- ============================================================================
--
-- 1. Add domain_id FK to import_jobs (direct lookup, no sitemap URL matching)
-- 2. Add reindex flag (re-scrape existing content)
-- 3. Add urls_to_index TEXT[] — immutable list of URLs assigned to this job,
--    written once at job creation, never mutated during execution.
--    Progress is tracked by diffing against contents.source_url.
-- 4. Add import_job_id FK on contents — links each content row to the job
--    that created it. Required for the diff-based progress tracking.
-- ============================================================================

-- 1. Add domain_id FK (nullable for backwards compat with old jobs)
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL;

-- 2. Add reindex flag (default false = import new content only)
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS reindex BOOLEAN NOT NULL DEFAULT false;

-- 3. Add urls_to_index — immutable after job creation
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS urls_to_index TEXT[] NOT NULL DEFAULT '{}';

-- 4. Add import_job_id FK on contents
ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES public.import_jobs(id) ON DELETE SET NULL;

-- Index for fast lookup: "is there a running job for this domain?"
CREATE INDEX IF NOT EXISTS idx_import_jobs_domain_status
  ON public.import_jobs (domain_id, status)
  WHERE status IN ('pending', 'scrapping');

-- Index for fast diff: "which URLs from this job already have content?"
CREATE INDEX IF NOT EXISTS idx_contents_import_job_id
  ON public.contents (import_job_id)
  WHERE import_job_id IS NOT NULL;

-- 5. Add scrape pipeline columns
--    scrape_status tracks the scraping phase (separate from import status).
--    Possible values: 'pending' | 'scraping' | 'scraped' | 'error'
--      - pending:  job initialized, first batch not yet started
--      - scraping: at least one micro-batch has started processing
--      - scraped:  all batches done, error rate ≤ 50%
--      - error:    error rate > 50% or fatal exception
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'scraping', 'scraped', 'error'));

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS scrape_error_message TEXT;
