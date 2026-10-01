-- Hall of Flame managed boss catalogue. Safe to run after SUPABASE_HALL_OF_FLAME_PB_SETUP.sql.
create table if not exists public.hall_of_flame_bosses (
  slug text primary key,
  name text not null,
  category text not null default 'Boss',
  record_type text not null default 'fastest_time',
  time_format text not null default 'MM:SS.ms',
  image_url text,
  active boolean not null default true,
  visible boolean not null default true,
  accept_submissions boolean not null default true,
  discord_sync boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hof_bosses_active_order on public.hall_of_flame_bosses(active,visible,display_order,name);
alter table public.hall_of_flame_bosses enable row level security;
-- Access is server-side through the Cloudflare Functions service/secret key.
alter table public.hall_of_flame_submissions add column if not exists boss_slug text;
update public.hall_of_flame_submissions s set boss_slug=b.slug from public.hall_of_flame_bosses b where s.boss_slug is null and lower(s.boss)=lower(b.name);
create index if not exists hof_submissions_boss_slug_status_time on public.hall_of_flame_submissions(boss_slug,status,time_ms);

-- Server-side API access. RLS alone does not grant table privileges to a role.
grant usage on schema public to service_role;
grant all privileges on table public.hall_of_flame_bosses to service_role;
revoke all privileges on table public.hall_of_flame_bosses from anon, authenticated;
