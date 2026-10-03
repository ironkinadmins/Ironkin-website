-- Ironkin Games · Location Hunt proof submissions
insert into storage.buckets (id, name, public)
values ('ironkin-games-proofs','ironkin-games-proofs',true)
on conflict (id) do update set public = true;

create table if not exists public.ironkin_games_location_submissions (
  id uuid primary key,
  week_id text not null,
  challenge_id text not null,
  team_id text not null,
  location_id text not null,
  submitted_by text not null,
  submitted_name text not null default '',
  proof_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  staff_note text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ig_location_lookup on public.ironkin_games_location_submissions(week_id,challenge_id,team_id,location_id,submitted_at desc);
create unique index if not exists ig_location_one_live_proof on public.ironkin_games_location_submissions(week_id,challenge_id,team_id,location_id) where status in ('pending','approved');
alter table public.ironkin_games_location_submissions enable row level security;
revoke all on public.ironkin_games_location_submissions from anon, authenticated;
grant select,insert,update,delete on public.ironkin_games_location_submissions to service_role;
