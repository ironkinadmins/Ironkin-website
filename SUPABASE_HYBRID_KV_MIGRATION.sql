-- Ironkin website: hybrid Cloudflare KV -> Supabase migration table
-- Run this ONCE in Supabase SQL Editor before deploying the hybrid website.

create table if not exists public.website_store (
  namespace text not null,
  key text not null,
  value text,
  metadata jsonb,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (namespace, key)
);

create index if not exists website_store_expires_at_idx
  on public.website_store (expires_at)
  where expires_at is not null;

comment on table public.website_store is
  'Temporary/compatibility store used while migrating Ironkin website data from Cloudflare KV to Supabase.';

-- No public RLS policy is required. The website accesses this table only from
-- Cloudflare server-side Functions using SUPABASE_SERVICE_ROLE_KEY / secret key.
