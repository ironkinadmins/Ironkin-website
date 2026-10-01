# Ironkin Hybrid Supabase Migration

This build keeps Cloudflare KV as a safety net while moving data into Supabase automatically.

## Behavior

- Reads: Supabase first -> Cloudflare KV fallback -> lazy copy into Supabase.
- Writes: both Supabase and Cloudflare KV.
- Deletes: both Supabase and Cloudflare KV.
- TTL values are mirrored into the `expires_at` column.

## Before deployment

1. In Supabase SQL Editor, run `SUPABASE_HYBRID_KV_MIGRATION.sql`.
2. In Cloudflare Pages variables/secrets, make sure these exist:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (or the already-supported `SUPABASE_SECRET_KEY`)
3. KEEP the existing `DROPS_KV` and `CALENDAR_KV` bindings. Do not delete them yet.
4. Deploy this website build.

## What happens after deployment

As pages/admin features are used, old KV records that are not yet present in Supabase are copied automatically into `public.website_store`. New changes are written to both systems.

## Important

Do not remove the Cloudflare KV bindings until the site has been tested and the Supabase table contains the data you care about.
