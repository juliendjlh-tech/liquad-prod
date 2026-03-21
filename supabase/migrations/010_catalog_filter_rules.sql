-- Migration: Replace url_patterns with filter_rules
-- Replaces regex-based url_patterns TEXT[] with structured JSONB filter_rules
-- for domain-level content filtering with simple operators.

ALTER TABLE catalogs DROP COLUMN url_patterns;

ALTER TABLE catalogs ADD COLUMN filter_rules JSONB NOT NULL DEFAULT '{"domain_rules": []}'::jsonb;

-- GIN index for JSONB queries
CREATE INDEX idx_catalogs_filter_rules ON catalogs USING GIN (filter_rules);
