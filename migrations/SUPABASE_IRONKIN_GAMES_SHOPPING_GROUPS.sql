-- Ironkin Games Shopping List grouped objectives.
-- Multiple OSRS item IDs can satisfy one Shopping List square.
-- The first pending/approved proof reserves the objective for that team event.

alter table public.ironkin_event_submissions
  add column if not exists shopping_objective_id text not null default '';

create index if not exists ironkin_event_submissions_shopping_objective_idx
  on public.ironkin_event_submissions (plugin_event_id, shopping_objective_id);

create unique index if not exists ironkin_event_submissions_shopping_objective_uq
  on public.ironkin_event_submissions (plugin_event_id, shopping_objective_id)
  where shopping_objective_id <> '' and status not in ('rejected','failed');

grant select, insert, update, delete on table public.ironkin_event_submissions to service_role;
