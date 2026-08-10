import { getSession, isStaffSession } from "../_auth.js";
import { resolveOsrsItemIdByName } from "../_osrsItems.js";
import { upsertTrackedItem } from "../_supabase.js";
function getDropListKey(eventId) {
  return `drops:${eventId}`;
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();

  const eventId = body.eventId;
  const name = body.name?.trim();
  const image = body.image?.trim() || "";
  const wikiUrl = body.wikiUrl?.trim() || "";
  const rewardEmbers = Math.max(0, Number(body.rewardEmbers || 0));
  const allowedTrackingRules = new Set(["repeatable", "once_per_player", "once_per_event"]);
  const trackingRule = allowedTrackingRules.has(String(body.trackingRule || "")) ? String(body.trackingRule) : "repeatable";
  let itemId = Number(body.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    itemId = await resolveOsrsItemIdByName(name).catch(() => null);
  }

  if (!eventId || !name) {
    return Response.json(
      { error: "Missing eventId or drop name." },
      { status: 400 }
    );
  }

  const key = getDropListKey(eventId);

  const existingValue = await env.DROPS_KV.get(key);
  const drops = existingValue ? JSON.parse(existingValue) : [];

  const existing = drops.find(drop => drop.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    if (image) existing.image = image;
    if (wikiUrl) existing.wikiUrl = wikiUrl;
    if (body.rewardEmbers !== undefined) existing.rewardEmbers = rewardEmbers;
    if (itemId) existing.itemId = itemId;
    existing.trackingRule = trackingRule;
  } else {
    drops.push({ name, image, wikiUrl, rewardEmbers, trackingRule, itemId: itemId || null, count: 0 });
  }

  await env.DROPS_KV.put(key, JSON.stringify(drops));

  let supabase = { synced: false, reason: itemId ? "not-configured" : "missing-item-id" };
  if (itemId) {
    supabase = await upsertTrackedItem(env, {
      websiteEventId: eventId,
      itemId,
      itemName: name,
      imageUrl: image,
      wikiUrl,
      rewardEmbers,
      trackingRule
    }).catch(error => ({ synced: false, reason: error.message }));
  }

  return Response.json({
    success: true,
    itemId: itemId || null,
    supabaseSynced: Boolean(supabase.synced),
    supabaseWarning: supabase.synced ? null : supabase.reason,
    drops
  });
}