-- Migration 009: Normalize contents.domain TEXT → contents.domain_id UUID FK
--
-- Replaces the denormalized domain TEXT column with a proper FK to domains(id).
-- ON DELETE CASCADE replaces the trigger from migration 008.

-- 1. Add domain_id column (nullable initially for data migration)
ALTER TABLE public.contents ADD COLUMN domain_id UUID;

-- 2. Populate from existing data (join on workspace_id + domain text)
UPDATE public.contents c
SET domain_id = d.id
FROM public.domains d
WHERE c.workspace_id = d.workspace_id AND c.domain = d.domain;

-- 3. Delete orphan contents (domain text with no matching domains row)
DELETE FROM public.contents WHERE domain_id IS NULL;

-- 4. Make NOT NULL
ALTER TABLE public.contents ALTER COLUMN domain_id SET NOT NULL;

-- 5. Add FK with CASCADE (replaces trigger from migration 008)
ALTER TABLE public.contents
  ADD CONSTRAINT fk_contents_domain
  FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;

-- 6. Add index for FK lookups and GROUP BY performance
CREATE INDEX idx_contents_domain_id ON public.contents(domain_id);

-- 7. Drop old denormalized domain TEXT column
ALTER TABLE public.contents DROP COLUMN domain;

-- 8. Drop the trigger from migration 008 (now replaced by FK CASCADE)
DROP TRIGGER IF EXISTS trg_delete_contents_on_domain_delete ON public.domains;
DROP FUNCTION IF EXISTS delete_contents_on_domain_delete();

-- 9. Replace RPC function to use domain_id instead of domain TEXT
-- Must DROP first because return type changed (TEXT → UUID)
DROP FUNCTION IF EXISTS public.get_domain_content_counts(UUID);
CREATE FUNCTION public.get_domain_content_counts(p_workspace_id UUID)
RETURNS TABLE(domain_id UUID, content_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT domain_id, COUNT(*) as content_count
  FROM public.contents
  WHERE workspace_id = p_workspace_id
  GROUP BY domain_id;
$$;
