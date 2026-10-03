-- Ironkin Games Contracts + isolated staff Test Mode.
create table if not exists public.ironkin_games_contract_claims (
  id uuid primary key default gen_random_uuid(),
  week_id text not null, challenge_id text not null, team_id text not null,
  contract_id text not null, contract_name text not null,
  tier text not null check (tier in ('safe','risky','all-in')),
  points integer not null default 0, metric text not null, metric_label text not null default '',
  target numeric not null check (target > 0), player_discord_id text not null,
  player_name text not null, rsn text not null,
  baseline numeric not null default 0, current_value numeric not null default 0,
  progress numeric not null default 0, completed boolean not null default false,
  is_test boolean not null default false,
  claimed_at timestamptz not null default now(), baseline_snapshot_at timestamptz,
  last_refreshed_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
);

-- Safe to run over the first Contracts migration as well.
alter table public.ironkin_games_contract_claims add column if not exists is_test boolean not null default false;
alter table public.ironkin_games_contract_claims drop constraint if exists ironkin_games_contract_claims_week_id_challenge_id_team_id_contract_id_key;
alter table public.ironkin_games_contract_claims drop constraint if exists ironkin_games_contract_claims_week_id_challenge_id_team_id_player_discord_id_key;
drop index if exists ironkin_games_contract_claims_contract_unique;
drop index if exists ironkin_games_contract_claims_player_unique;
create unique index ironkin_games_contract_claims_contract_unique on public.ironkin_games_contract_claims (week_id,challenge_id,team_id,contract_id,is_test);
create unique index ironkin_games_contract_claims_player_unique on public.ironkin_games_contract_claims (week_id,challenge_id,team_id,player_discord_id,is_test);
create index if not exists ironkin_games_contract_claims_lookup on public.ironkin_games_contract_claims (week_id,challenge_id,team_id,is_test);
alter table public.ironkin_games_contract_claims enable row level security;
revoke all on table public.ironkin_games_contract_claims from anon, authenticated;
grant select, insert, update, delete on table public.ironkin_games_contract_claims to service_role;
