-- Run once in Supabase SQL Editor before deploying the multi-screenshot editor.
ALTER TABLE public.ironkin_discord_info_sections
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
