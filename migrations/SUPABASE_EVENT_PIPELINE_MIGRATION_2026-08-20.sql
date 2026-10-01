-- Ironkin website -> bot event pipeline migration
-- Run once in the SAME Supabase project used by the Discord bot.

alter table public.ironkin_event_items
  add column if not exists plugin_event_id text not null default '';

create index if not exists ironkin_event_items_plugin_event_idx
  on public.ironkin_event_items (plugin_event_id);

-- Rebuild duplicate-rule indexes so failed rows do not reserve an item.
drop index if exists public.ironkin_event_submissions_once_event_uq;
drop index if exists public.ironkin_event_submissions_once_player_uq;

create unique index if not exists ironkin_event_submissions_once_event_uq
  on public.ironkin_event_submissions (plugin_event_id, item_id)
  where tracking_rule = 'once_per_event' and status not in ('rejected','failed');

create unique index if not exists ironkin_event_submissions_once_player_uq
  on public.ironkin_event_submissions (plugin_event_id, item_id, player_key)
  where tracking_rule = 'once_per_player' and status not in ('rejected','failed');

-- Allow trusted Cloudflare server functions to use the tables.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.ironkin_event_items to service_role;
grant select, insert, update, delete on table public.ironkin_event_submissions to service_role;
