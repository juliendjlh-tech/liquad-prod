-- ============================================================================
-- Migration 001: Liquad MVP Schema
-- ============================================================================
--
-- This migration creates the complete Liquad database schema as defined
-- in ADR-001 (Section 7.9). It includes:
--
--   1. Six new tables: domains, contents, user_agents, catalogs,
--      catalog_agents, sdk_events
--   2. ALTER statements for existing tables: workspaces, workspace_members
--   3. Indexes for dashboard query performance
--
-- CONTEXT:
-- Liquad is a B2B SaaS platform for publishers to control and monetize
-- AI bot access to their content. Each workspace represents one publisher
-- company. All data is isolated per workspace via RLS (see migration 002).
--
-- DEPENDENCIES:
--   - Tables "workspaces" and "workspace_members" must already exist
--     (created during initial project setup)
--
-- ROLLBACK: See bottom of this file for the rollback SQL.
-- ============================================================================


-- ============================================================================
-- TABLE: domains
-- ============================================================================
-- Tracks the domains (websites) owned by a workspace.
-- A domain starts as "pending_verification" and becomes "verified" after
-- receiving 10+ SDK events in 24 hours. It reverts to "unverified" after
-- 30 days without any SDK events.
--
-- Business rule: One workspace can own multiple domains, but each domain
-- can only belong to one workspace (enforced by UNIQUE constraint).
-- ============================================================================
CREATE TABLE public.domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'verified', 'unverified')),
  verified_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, domain)
);


-- ============================================================================
-- TABLE: contents
-- ============================================================================
-- Stores individual content items (pages/articles) imported from a publisher's
-- sitemap.xml. Each content is identified by its source URL, which must be
-- unique per workspace.
--
-- The "domain" column is denormalized from the source_url for fast filtering
-- (avoids parsing URLs at query time).
-- ============================================================================
CREATE TABLE public.contents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  lastmod TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, source_url)
);


-- ============================================================================
-- TABLE: user_agents
-- ============================================================================
-- Declares AI bots (identified by their HTTP User-Agent string pattern)
-- that a workspace wants to control. Each bot has a regex-like pattern
-- (ua_pattern) used to match incoming request User-Agent headers.
--
-- is_preset: true for bots imported from the pre-defined list (GPTBot,
--   ClaudeBot, etc.), false for custom bots added by the publisher.
-- is_active: allows disabling a bot without deleting it.
-- ============================================================================
CREATE TABLE public.user_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ua_pattern TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- TABLE: catalogs
-- ============================================================================
-- A catalog is a licensing rule: it defines which content (via url_patterns
-- regex array) is available to which bots (via catalog_agents junction table)
-- at what price (price_eur, 0-1 EUR per access).
--
-- url_patterns: Array of regex patterns matched against content source_url.
--   Example: ['^https://example\.com/articles/.*', '^https://example\.com/blog/.*']
--
-- price_eur: Price per access in EUR. DECIMAL(4,2) allows up to 99.99,
--   but the CHECK constraint limits it to 0-1 EUR for the MVP.
--
-- status: 'inactive' by default. Only 'active' catalogs are returned
--   to the SDK via the /api/sdk/rules endpoint.
-- ============================================================================
CREATE TABLE public.catalogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url_patterns TEXT[] NOT NULL DEFAULT '{}',
  price_eur DECIMAL(4,2) NOT NULL DEFAULT 0 CHECK (price_eur >= 0 AND price_eur <= 1),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- TABLE: catalog_agents (junction)
-- ============================================================================
-- Many-to-many relationship between catalogs and user_agents.
-- Defines which bots are authorized by a given catalog.
--
-- When a bot makes a request, the SDK checks: is there an active catalog
-- whose url_patterns match the request URL AND whose catalog_agents
-- include this bot? If yes -> granted. If no -> denied.
--
-- CASCADE deletes ensure removing a catalog or a bot cleans up this table.
-- ============================================================================
CREATE TABLE public.catalog_agents (
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  user_agent_id UUID NOT NULL REFERENCES public.user_agents(id) ON DELETE CASCADE,
  PRIMARY KEY (catalog_id, user_agent_id)
);


-- ============================================================================
-- TABLE: sdk_events
-- ============================================================================
-- Records every bot access event sent by the SDK deployed on publisher sites.
-- This is the core analytics table for the Liquad dashboard.
--
-- Each event captures:
--   - Which workspace/domain received the bot request
--   - The full request URL
--   - Which bot made the request (name + raw User-Agent header)
--   - Which catalog matched (if any)
--   - The decision: 'granted' (bot authorized), 'denied' (bot not authorized
--     by any catalog), or 'blocked_no_catalog' (bot recognized but no catalog)
--   - The price applied (from the matching catalog, if granted)
--
-- Events are inserted by the SDK using the service role key (not by users),
-- so no user-facing write RLS policy is needed on this table.
-- ============================================================================
CREATE TABLE public.sdk_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  request_url TEXT NOT NULL,
  user_agent_name TEXT,
  user_agent_raw TEXT,
  matched_catalog_id UUID REFERENCES public.catalogs(id),
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'denied', 'blocked_no_catalog')),
  price_applied DECIMAL(4,2),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- INDEXES
-- ============================================================================
-- These indexes optimize the most common dashboard queries:
--
-- idx_sdk_events_workspace_ts:
--   Used by the analytics dashboard to list events for a workspace
--   ordered by most recent first (timestamp DESC).
--
-- idx_sdk_events_workspace_domain:
--   Used to filter events by domain within a workspace
--   (e.g., domain verification checks, per-domain analytics).
--
-- idx_contents_workspace_url:
--   Used to check content uniqueness and look up content by URL
--   within a workspace (import deduplication, catalog matching).
-- ============================================================================
CREATE INDEX idx_sdk_events_workspace_ts ON public.sdk_events(workspace_id, timestamp DESC);
CREATE INDEX idx_sdk_events_workspace_domain ON public.sdk_events(workspace_id, domain);
CREATE INDEX idx_contents_workspace_url ON public.contents(workspace_id, source_url);


-- ============================================================================
-- ALTER: workspaces
-- ============================================================================
-- Add the API key hash column for SDK authentication.
-- The plaintext API key is only shown once at workspace creation;
-- only the bcrypt hash is stored in the database.
--
-- updated_at: Tracks when the workspace was last modified
-- (e.g., API key regeneration).
-- ============================================================================
ALTER TABLE public.workspaces ADD COLUMN api_key_hash TEXT;
ALTER TABLE public.workspaces ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();


-- ============================================================================
-- ALTER: workspace_members
-- ============================================================================
-- Add invitation tracking columns and enforce role constraints.
--
-- invited_at: When the member was invited (defaults to now for existing rows).
-- accepted_at: When the invitation was accepted (MVP: auto-accept, so set
--   at invite time). NULL means pending invitation (future feature).
--
-- Role constraint: Only 'owner', 'admin', or 'member' are valid roles.
--   - owner: Full access, can regenerate API key, manage roles
--   - admin: Can manage content, bots, catalogs, invite members
--   - member: Read-only access to workspace data
-- ============================================================================
ALTER TABLE public.workspace_members ADD COLUMN invited_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.workspace_members ADD COLUMN accepted_at TIMESTAMPTZ;
ALTER TABLE public.workspace_members ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));


-- ============================================================================
-- ROLLBACK SQL
-- ============================================================================
-- To undo this migration, run the following statements in order:
--
-- DROP TABLE IF EXISTS public.sdk_events CASCADE;
-- DROP TABLE IF EXISTS public.catalog_agents CASCADE;
-- DROP TABLE IF EXISTS public.catalogs CASCADE;
-- DROP TABLE IF EXISTS public.user_agents CASCADE;
-- DROP TABLE IF EXISTS public.contents CASCADE;
-- DROP TABLE IF EXISTS public.domains CASCADE;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS api_key_hash;
-- ALTER TABLE public.workspaces DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE public.workspace_members DROP COLUMN IF EXISTS invited_at;
-- ALTER TABLE public.workspace_members DROP COLUMN IF EXISTS accepted_at;
-- ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
-- ============================================================================
