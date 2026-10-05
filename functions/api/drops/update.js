import { hybridKv } from "../../_hybridKv.js";
import { getSession, isStaffSession } from "../_auth.js";
import { getDropListKey, readDropsWithClanGoalFallback } from "./_dropKeys.js";
import { upsertTrackedItem } from "../_supabase.js";
import { makePluginEventId } from "../_pluginEvents.js";

function bossName(drop) {
  return String(drop?.boss || "").trim() || "Unassigned";
}

async function resolvePluginEventId(env, websiteEventId) {
  const raw = await hybridKv(env, "drops").get("events:active");
  let events = [];
  try { events = raw ? JSON.parse(raw) : []; } catch { events = []; }
  const event = (Array.isArray(events) ? events : []).find(entry => String(entry?.id || "") === String(websiteEventId || ""));
  return event ? makePluginEventId(event) : String(websiteEventId || "");
}

function groupByBoss(drops) {
  const order = [];
  const groups = new Map();
  for (const drop of drops) {
    const boss = bossName(drop);
    if (!groups.has(boss)) {
      order.push(boss);
      groups.set(boss, []);
    }
    groups.get(boss).push(drop);
  }
  return { order, groups };
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json();
  const eventId = String(body.eventId || "").trim();
  if (!eventId) return Response.json({ error: "Missing eventId." }, { status: 400 });

  const result = await readDropsWithClanGoalFallback(env, eventId);
  let drops = Array.isArray(result.drops) ? result.drops : [];

  // Move an entire boss group while preserving item order inside each boss.
  if (body.moveBoss) {
    const requestedBoss = String(body.boss || "").trim() || "Unassigned";
    const { order, groups } = groupByBoss(drops);
    const index = order.indexOf(requestedBoss);
    if (index < 0) return Response.json({ error: "Boss group not found." }, { status: 404 });
    const target = body.moveBoss === "up" ? index - 1 : body.moveBoss === "down" ? index + 1 : index;
    if (target >= 0 && target < order.length && target !== index) {
      [order[index], order[target]] = [order[target], order[index]];
      drops = order.flatMap(boss => groups.get(boss) || []);
    }
  } else {
    const name = String(body.name || "").trim();
    if (!name) return Response.json({ error: "Missing drop name." }, { status: 400 });
    let index = drops.findIndex(drop => String(drop?.name || "").toLowerCase() === name.toLowerCase());
    if (index < 0) return Response.json({ error: "Tracked item not found." }, { status: 404 });

    const originalName = String(drops[index]?.name || "");
    const originalBoss = bossName(drops[index]);
    const allowedTrackingRules = new Set(["repeatable", "once_per_player", "once_per_event"]);

    if (body.newName !== undefined) {
      const newName = String(body.newName || "").trim();
      if (!newName) return Response.json({ error: "Item name cannot be blank." }, { status: 400 });
      const duplicate = drops.some((drop, dropIndex) => dropIndex !== index && String(drop?.name || "").toLowerCase() === newName.toLowerCase());
      if (duplicate) return Response.json({ error: "Another tracked item already uses that name." }, { status: 409 });
      drops[index] = { ...drops[index], name: newName };
    }
    if (body.itemId !== undefined) {
      const itemId = Number(body.itemId);
      if (!Number.isInteger(itemId) || itemId <= 0) return Response.json({ error: "Invalid OSRS item ID." }, { status: 400 });
      drops[index] = { ...drops[index], itemId };
    }
    if (body.rewardEmbers !== undefined) {
      drops[index] = { ...drops[index], rewardEmbers: Math.max(0, Math.floor(Number(body.rewardEmbers || 0))) };
    }
    if (body.trackingRule !== undefined) {
      const trackingRule = String(body.trackingRule || "");
      if (!allowedTrackingRules.has(trackingRule)) return Response.json({ error: "Invalid duplicate rule." }, { status: 400 });
      drops[index] = { ...drops[index], trackingRule };
    }

    if (body.boss !== undefined) {
      const newBoss = String(body.boss || "").trim();
      const item = { ...drops[index], boss: newBoss };
      drops.splice(index, 1);
      const normalized = newBoss || "Unassigned";
      const lastSameBoss = drops.map(bossName).lastIndexOf(normalized);
      if (lastSameBoss >= 0) drops.splice(lastSameBoss + 1, 0, item);
      else drops.splice(Math.min(index, drops.length), 0, item);
      index = drops.indexOf(item);
    }

    const move = String(body.move || "");
    if (move === "up" && index > 0 && bossName(drops[index - 1]) === bossName(drops[index])) {
      [drops[index - 1], drops[index]] = [drops[index], drops[index - 1]];
    } else if (move === "down" && index < drops.length - 1 && bossName(drops[index + 1]) === bossName(drops[index])) {
      [drops[index + 1], drops[index]] = [drops[index], drops[index + 1]];
    }
  }

  await hybridKv(env, "drops").put(result.key || getDropListKey(eventId), JSON.stringify(drops));

  let supabaseWarning = null;
  if (!body.moveBoss && body.name) {
    const updated = drops.find(drop => String(drop?.name || "").toLowerCase() === String(body.newName || body.name || "").trim().toLowerCase());
    if (updated?.itemId) {
      const pluginEventId = await resolvePluginEventId(env, eventId);
      const sync = await upsertTrackedItem(env, {
        websiteEventId: eventId, pluginEventId, itemId: Number(updated.itemId), itemName: updated.name,
        imageUrl: updated.image || "", wikiUrl: updated.wikiUrl || "",
        rewardEmbers: Number(updated.rewardEmbers || 0), trackingRule: updated.trackingRule || "repeatable"
      }).catch(error => ({ synced: false, reason: error.message }));
      if (!sync?.synced) supabaseWarning = sync?.reason || "sync-failed";
    }
  }

  return Response.json({ success: true, eventId, drops, supabaseWarning });
}
