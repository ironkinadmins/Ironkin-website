import { listTrackedItems, upsertTrackedItem } from "../api/_supabase.js";
import { resolveOsrsItemIdByName } from "../api/_osrsItems.js";
import { makePluginEventId } from "../api/_pluginEvents.js";
import { readDropsWithClanGoalFallback, getDropListKey } from "../api/drops/_dropKeys.js";

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export async function onRequestGet({ env }) {
  const events = safeJson(await env.DROPS_KV.get("events:active"), []);
  const activeEvents = (Array.isArray(events) ? events : []).filter(event => event?.active === true && event?.dropsEnabled === true);
  const dbRows = await listTrackedItems(env).catch(() => []);
  const dbByEvent = new Map();
  for (const row of dbRows) {
    const key = String(row.website_event_id || "");
    if (!dbByEvent.has(key)) dbByEvent.set(key, []);
    dbByEvent.get(key).push(Number(row.item_id));
  }

  const result = [];
  for (const event of activeEvents) {
    const websiteEventId = String(event.id || "").trim();
    if (!websiteEventId) continue;
    let itemIds = (dbByEvent.get(websiteEventId) || []).filter(id => Number.isInteger(id) && id > 0);

    // One-time compatibility path for legacy KV drop rows that predate item IDs/Supabase.
    if (!itemIds.length) {
      const dropResult = await readDropsWithClanGoalFallback(env, websiteEventId);
      const updatedDrops = [];
      for (const drop of dropResult.drops || []) {
        let itemId = Number(drop.itemId);
        if (!Number.isInteger(itemId) || itemId <= 0) {
          itemId = await resolveOsrsItemIdByName(drop.name).catch(() => null);
        }
        const nextDrop = itemId ? { ...drop, itemId } : drop;
        updatedDrops.push(nextDrop);
        if (itemId) {
          itemIds.push(itemId);
          await upsertTrackedItem(env, {
            websiteEventId,
            itemId,
            itemName: drop.name,
            imageUrl: drop.image,
            wikiUrl: drop.wikiUrl,
            rewardEmbers: drop.rewardEmbers,
            trackingRule: drop.trackingRule || "repeatable"
          }).catch(() => null);
        }
      }
      if (updatedDrops.length) await env.DROPS_KV.put(dropResult.key || getDropListKey(websiteEventId), JSON.stringify(updatedDrops));
    }

    itemIds = [...new Set(itemIds)];
    if (itemIds.length) result.push({ eventId: makePluginEventId(event), items: itemIds });
  }

  return Response.json({ events: result }, { headers: { "Cache-Control": "no-store" } });
}
