-- ============================================================================
-- Migration 008: Cascade delete contents when a domain is deleted
-- ============================================================================
--
-- When a domain record is deleted from the domains table, automatically
-- delete all content records that belong to the same workspace and domain.
--
-- Uses a trigger rather than a FK because contents.domain is a denormalized
-- text column (not a foreign key reference), and adding a composite FK
-- (workspace_id, domain) would require schema refactoring.
--
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_delete_contents_on_domain_delete ON public.domains;
-- DROP FUNCTION IF EXISTS public.delete_contents_on_domain_delete();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_contents_on_domain_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.contents
  WHERE workspace_id = OLD.workspace_id
    AND domain = OLD.domain;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_delete_contents_on_domain_delete
  AFTER DELETE ON public.domains
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_contents_on_domain_delete();
