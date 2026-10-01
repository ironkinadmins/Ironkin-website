import { hybridKv } from "../../_hybridKv.js";
import { getSession, isStaffSession } from "../_auth.js";
import { upsertTrackedItem } from "../_supabase.js";
import { makePluginEventId } from "../_pluginEvents.js";

function dropKey(eventId) { return `drops:${eventId}`; }
function cleanRule(value) {
  return ["repeatable", "once_per_player", "once_per_event"].includes(String(value || "")) ? String(value) : "repeatable";
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const incoming = Array.isArray(body?.items) ? body.items : [];
  const items = incoming.slice(0, 250).map(item => ({
    eventId: String(item?.eventId || "").trim(),
    itemId: Number(item?.itemId || 0),
    name: String(item?.name || "").trim(),
    image: String(item?.image || "").trim(),
    wikiUrl: String(item?.wikiUrl || "").trim(),
    rewardEmbers: Math.max(0, Math.floor(Number(item?.rewardEmbers || 0))),
    trackingRule: cleanRule(item?.trackingRule)
  })).filter(item => item.eventId && item.name && Number.isInteger(item.itemId) && item.itemId > 0);

  if (!items.length) return Response.json({ error: "No valid items were supplied." }, { status: 400 });

  // Read the active events once so plugin IDs can be resolved without one KV
  // lookup per spreadsheet row.
  let activeEvents = [];
  try {
    const raw = await hybridKv(env, "drops").get("events:active");
    activeEvents = raw ? JSON.parse(raw) : [];
  } catch { activeEvents = []; }
  const pluginIdByEvent = new Map((Array.isArray(activeEvents) ? activeEvents : []).map(event => [String(event?.id || ""), makePluginEventId(event)]));

  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.eventId)) grouped.set(item.eventId, []);
    grouped.get(item.eventId).push(item);
  }

  let processed = 0;
  for (const [eventId, eventItems] of grouped.entries()) {
    const key = dropKey(eventId);
    let drops = [];
    try {
      const existing = await hybridKv(env, "drops").get(key);
      drops = existing ? JSON.parse(existing) : [];
      if (!Array.isArray(drops)) drops = [];
    } catch { drops = []; }

    for (const item of eventItems) {
      const existing = drops.find(drop => Number(drop?.itemId || 0) === item.itemId || String(drop?.name || "").trim().toLowerCase() === item.name.toLowerCase());
      if (existing) {
        existing.name = item.name;
        existing.itemId = item.itemId;
        if (item.image) existing.image = item.image;
        if (item.wikiUrl) existing.wikiUrl = item.wikiUrl;
        existing.rewardEmbers = item.rewardEmbers;
        existing.trackingRule = item.trackingRule;
      } else {
        drops.push({ name: item.name, itemId: item.itemId, image: item.image, wikiUrl: item.wikiUrl, rewardEmbers: item.rewardEmbers, trackingRule: item.trackingRule, count: 0 });
      }
      processed += 1;
    }

    // One write per event means the entire spreadsheet merge is atomic from the
    // browser's perspective and cannot lose rows to concurrent read/modify/write races.
    await hybridKv(env, "drops").put(key, JSON.stringify(drops));
  }

  // Keep the plugin/Supabase tracking table in sync. These upserts happen after
  // the canonical bounty list is safely written, so a Supabase warning cannot
  // cause items to disappear from the website.
  const failures = [];
  for (const item of items) {
    try {
      const result = await upsertTrackedItem(env, {
        websiteEventId: item.eventId,
        pluginEventId: pluginIdByEvent.get(item.eventId) || item.eventId,
        itemId: item.itemId,
        itemName: item.name,
        imageUrl: item.image,
        wikiUrl: item.wikiUrl,
        rewardEmbers: item.rewardEmbers,
        trackingRule: item.trackingRule
      });
      if (!result?.synced && result?.reason !== "missing-supabase") failures.push({ item: item.name, message: result?.reason || "Supabase sync failed" });
    } catch (error) {
      failures.push({ item: item.name, message: error?.message || "Supabase sync failed" });
    }
  }

  return Response.json({ success: true, processed, imported: processed, failures });
}
