-- Apply in Supabase SQL Editor before using Discord Information Editor.
create table if not exists public.ironkin_discord_info_sections (
 id text primary key,
 channel_key text not null check (channel_key in ('clan-info','rank-info')),
 title text not null,
 description text not null default '',
 image_url text not null default '',
 sort_order integer not null default 0,
 enabled boolean not null default true,
 discord_message_id text,
 revision integer not null default 1,
 updated_by text,
 updated_at timestamptz not null default now(),
 published_at timestamptz
);
create index if not exists ironkin_discord_info_sections_channel_idx on public.ironkin_discord_info_sections(channel_key,sort_order);
alter table public.ironkin_discord_info_sections enable row level security;
-- No public policies: server-side service role only.
