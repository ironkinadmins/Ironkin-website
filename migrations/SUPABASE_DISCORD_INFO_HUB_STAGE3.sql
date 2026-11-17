-- Apply after the Stage 1 multi-image migration.
-- Published snapshots ensure draft edits cannot appear in Discord before publishing.
ALTER TABLE public.ironkin_discord_info_sections
  ADD COLUMN IF NOT EXISTS published_title text,
  ADD COLUMN IF NOT EXISTS published_description text,
  ADD COLUMN IF NOT EXISTS published_images jsonb,
  ADD COLUMN IF NOT EXISTS published_sort_order integer,
  ADD COLUMN IF NOT EXISTS published_enabled boolean;
-- Preserve content already published under the previous webhook workflow.
UPDATE public.ironkin_discord_info_sections
SET published_title = COALESCE(published_title, title),
    published_description = COALESCE(published_description, description),
    published_images = COALESCE(published_images, CASE WHEN jsonb_typeof(images::jsonb) = 'array' AND jsonb_array_length(images::jsonb)>0 THEN images::jsonb ELSE CASE WHEN COALESCE(image_url,'')<>'' THEN jsonb_build_array(image_url) ELSE '[]'::jsonb END END),
    published_sort_order = COALESCE(published_sort_order, sort_order),
    published_enabled = COALESCE(published_enabled, enabled)
WHERE published_at IS NOT NULL;
