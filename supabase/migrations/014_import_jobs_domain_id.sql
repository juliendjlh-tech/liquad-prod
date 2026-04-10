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

-- Done 1. Add domain_id FK (nullable for backwards compat with old jobs)
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL;

-- 3. DONE - Add urls_to_index — immutable after job creation
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS urls_to_index TEXT[] NOT NULL DEFAULT '{}';


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