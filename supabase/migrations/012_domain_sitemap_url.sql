-- Add sitemap_url column to domains table
-- This stores the original sitemap URL used to create the domain,
-- so the import page can reuse it without re-entering.
ALTER TABLE domains ADD COLUMN sitemap_url text;
