-- Run once in Supabase SQL Editor. Safe to rerun.
ALTER TABLE public.ironkin_discord_info_sections
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_blocks jsonb NOT NULL DEFAULT '[]'::jsonb;
