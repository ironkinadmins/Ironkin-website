-- Website-only Shopping List /submit routing for an already-running Ironkin Games week.
-- No Games re-save and no Discord bot code change are required.
--
-- The bot needs one unambiguous catalog row per item. Existing per-team
-- ig-shopping-* catalog rows make the same item appear multiple times. Convert
-- those rows into one shared manual catalog event. RuneLite does not use these
-- catalog rows for Shopping List tracking; it keeps its team-specific virtual
-- event ids.

begin;

create temporary table _ig_shopping_catalog as
select distinct on (item_id)
  item_id,
  item_name,
  image_url,
  wiki_url
from public.ironkin_event_items
where plugin_event_id like 'ig-shopping-%'
order by item_id, updated_at desc, id desc;

delete from public.ironkin_event_items
where plugin_event_id like 'ig-shopping-%';

insert into public.ironkin_event_items (
  website_event_id,
  plugin_event_id,
  item_id,
  item_name,
  image_url,
  wiki_url,
  reward_embers,
  tracking_rule
)
select
  'ig-shopping-manual',
  'ig-shopping-manual',
  item_id,
  item_name,
  coalesce(image_url, ''),
  coalesce(wiki_url, ''),
  0,
  'repeatable'
from _ig_shopping_catalog
on conflict (website_event_id, item_id) do update set
  plugin_event_id = excluded.plugin_event_id,
  item_name = excluded.item_name,
  image_url = excluded.image_url,
  wiki_url = excluded.wiki_url,
  reward_embers = excluded.reward_embers,
  tracking_rule = excluded.tracking_rule,
  updated_at = now();

commit;
