-- Add max_pages limit to workspaces
ALTER TABLE public.workspaces
  ADD COLUMN max_pages INTEGER NOT NULL DEFAULT 2000;

-- Add filter config to import_jobs for audit trail
ALTER TABLE public.import_jobs
  ADD COLUMN path_rules JSONB,
  ADD COLUMN max_pages INTEGER;
