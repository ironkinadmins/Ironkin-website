-- Ironkin Hall of Flame verified PB submissions (Option B: staff approval)
create extension if not exists pgcrypto;

create table if not exists public.hall_of_flame_submissions (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null,
  display_name text not null,
  boss text not null,
  time_ms bigint not null check (time_ms > 0),
  time_text text,
  proof_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  projected_placement integer,
  final_placement integer,
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hof_submissions_boss_status_time on public.hall_of_flame_submissions (boss,status,time_ms);
create index if not exists hof_submissions_discord_created on public.hall_of_flame_submissions (discord_id,created_at desc);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('hall-of-flame-proofs','hall-of-flame-proofs',true,8388608,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public=true,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;

alter table public.hall_of_flame_submissions enable row level security;
-- Website access is server-side through the Supabase service/secret key.
-- No anonymous table write policy is intentionally created.
