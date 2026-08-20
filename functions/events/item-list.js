import { hybridKv } from "../_hybridKv.js";
import { requirePluginUser } from "../api/_pluginAuth.js";
import { listTrackedItems, upsertTrackedItem } from "../api/_supabase.js";
import { resolveOsrsItemIdByName } from "../api/_osrsItems.js";
import { makePluginEventId } from "../api/_pluginEvents.js";
import { readDropsWithClanGoalFallback, getDropListKey } from "../api/drops/_dropKeys.js";

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export async function onRequestGet({ request, env }) {
  const auth = await requirePluginUser(request, env);
  if (!auth.ok) return auth.response;
  const events = safeJson(await hybridKv(env, "drops").get("events:active"), []);
  const configured = Array.isArray(events) ? events : [];
  const pvmEntry = configured.find(event => event?.id === "pvm-entry" || event?.type === "pvm-entry") || {
    id: "pvm-entry",
    type: "pvm-entry",
    label: "PvM Entry",
    title: "PvM Entry",
    active: true,
    dropsEnabled: true,
    pluginEventId: "pvm-entry",
    pluginOnly: true
  };
  const activeEvents = [
    ...configured.filter(event => event?.id !== "pvm-entry" && event?.type !== "pvm-entry" && event?.active === true && event?.dropsEnabled === true),
    { ...pvmEntry, id: "pvm-entry", type: "pvm-entry", active: true, dropsEnabled: true, pluginEventId: "pvm-entry", pluginOnly: true }
  ];
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
            pluginEventId: makePluginEventId(event),
            itemId,
            itemName: drop.name,
            imageUrl: drop.image,
            wikiUrl: drop.wikiUrl,
            rewardEmbers: drop.rewardEmbers,
            trackingRule: drop.trackingRule || "repeatable"
          }).catch(() => null);
        }
      }
      if (updatedDrops.length) await hybridKv(env, "drops").put(dropResult.key || getDropListKey(websiteEventId), JSON.stringify(updatedDrops));
    }

    itemIds = [...new Set(itemIds)];
    if (itemIds.length) {
      const responseEvent = { eventId: makePluginEventId(event), items: itemIds };
      const eventPassword = String(event?.eventPassword || "").trim();
      if (eventPassword) responseEvent.eventPassword = eventPassword;
      result.push(responseEvent);
    }
  }

  return Response.json({ events: result }, { headers: { "Cache-Control": "no-store" } });
}
