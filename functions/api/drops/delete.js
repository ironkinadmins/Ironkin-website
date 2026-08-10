import { getSession, isStaffSession } from "../_auth.js";
import { getDropListKey, LEGACY_CLAN_GOAL_DROP_IDS, readDropsWithClanGoalFallback } from "./_dropKeys.js";
import { deleteTrackedItem } from "../_supabase.js";

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();

  const eventId = body.eventId || "global";
  const name = body.name?.trim();

  if (!name) {
    return Response.json(
      { error: "Missing drop name." },
      { status: 400 }
    );
  }

  const result = await readDropsWithClanGoalFallback(env, eventId);
  const key = result.key || getDropListKey(eventId);
  const drops = result.drops || [];

  const removedDrop = drops.find(drop => drop.name === name);
  const updatedDrops = drops.filter(drop => drop.name !== name);

  await env.DROPS_KV.put(key, JSON.stringify(updatedDrops));
  if (removedDrop?.itemId) {
    await deleteTrackedItem(env, eventId, removedDrop.itemId).catch(() => null);
  }

  // Clan Goal drops used to be stored under event-specific legacy keys.
  // Remove the same drop from those keys too, otherwise an emptied canonical
  // list can immediately re-import the deleted legacy items on the next load.
  if (String(eventId).toLowerCase() === "clan-goal") {
    for (const legacyEventId of LEGACY_CLAN_GOAL_DROP_IDS) {
      const legacyKey = getDropListKey(legacyEventId);
      const legacyValue = await env.DROPS_KV.get(legacyKey);
      if (!legacyValue) continue;

      let legacyDrops = [];
      try {
        const parsed = JSON.parse(legacyValue);
        legacyDrops = Array.isArray(parsed) ? parsed : [];
      } catch {
        legacyDrops = [];
      }

      const updatedLegacyDrops = legacyDrops.filter(drop => drop?.name !== name);
      await env.DROPS_KV.put(legacyKey, JSON.stringify(updatedLegacyDrops));
    }
  }

  return Response.json({
    success: true,
    eventId,
    drops: updatedDrops
  });
}