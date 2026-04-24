-- Add description column to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS description text;
