-- Website-owned member goals. Apply in the same Supabase project used by the website.
create table if not exists public.ironkin_member_goals (
 id uuid primary key default gen_random_uuid(),
 discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
 display_name text not null default '',
 title text not null check (char_length(title) between 1 and 120),
 category text not null default 'Other',
 target numeric(16,2),
 progress numeric(16,2) not null default 0,
 unit text not null default '',
 status text not null default 'in_progress' check (status in ('in_progress','completed')),
 is_public boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint goals_nonnegative check (progress >= 0 and (target is null or target > 0))
);
create index if not exists ironkin_member_goals_discord_idx on public.ironkin_member_goals(discord_id);
create index if not exists ironkin_member_goals_public_idx on public.ironkin_member_goals(is_public,updated_at desc);
alter table public.ironkin_member_goals enable row level security;
-- No anonymous or authenticated grants: server-only service key access.
