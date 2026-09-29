import { hybridKv } from "../../_hybridKv.js";
import { getSession, isStaffSession } from "../_auth.js";
import { getDropListKey, LEGACY_CLAN_GOAL_DROP_IDS, readDropsWithClanGoalFallback } from "./_dropKeys.js";
import { deleteTrackedItem, deleteOrphanedTrackedItems } from "../_supabase.js";

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

  try {
    await hybridKv(env, "drops").put(key, JSON.stringify(updatedDrops));

    // Clan Goal drops used to be stored under event-specific legacy keys.
    // Remove the same drop from those keys too, otherwise an emptied canonical
    // list can immediately re-import the deleted legacy items on the next load.
    if (String(eventId).toLowerCase() === "clan-goal") {
      for (const legacyEventId of LEGACY_CLAN_GOAL_DROP_IDS) {
        const legacyKey = getDropListKey(legacyEventId);
        const legacyValue = await hybridKv(env, "drops").get(legacyKey);
        if (!legacyValue) continue;

        let legacyDrops = [];
        try {
          const parsed = JSON.parse(legacyValue);
          legacyDrops = Array.isArray(parsed) ? parsed : [];
        } catch {
          legacyDrops = [];
        }

        const updatedLegacyDrops = legacyDrops.filter(drop => drop?.name !== name);
        await hybridKv(env, "drops").put(legacyKey, JSON.stringify(updatedLegacyDrops));
      }
    }
  } catch (error) {
    return Response.json({ error: `Could not save the drop list: ${error.message}` }, { status: 500 });
  }

  // hybridKv.put succeeds if either backend accepts the write, but reads prefer
  // Supabase. Re-read so a failed Supabase write can't silently resurrect the item.
  const verify = await readDropsWithClanGoalFallback(env, eventId).catch(() => null);
  if (!verify || verify.drops.some(drop => drop?.name === name)) {
    return Response.json({ error: "The item was not removed from the stored drop list. Please try again." }, { status: 500 });
  }

  let removedTrackedItems = [];
  try {
    if (removedDrop?.itemId) {
      await deleteTrackedItem(env, eventId, removedDrop.itemId);
    }
    // Also clear any tracked items left behind by earlier failed deletes. Skip
    // when the list read came back empty so a bad read can't wipe the event,
    // unless we just removed its last item.
    if (drops.length) {
      const sweep = await deleteOrphanedTrackedItems(env, eventId, updatedDrops);
      removedTrackedItems = sweep.removed;
    }
  } catch (error) {
    return Response.json({ error: `Removed from the drop list, but the RuneLite tracked item could not be deleted: ${error.message}` }, { status: 500 });
  }

  return Response.json({
    success: true,
    eventId,
    drops: updatedDrops,
    removedTrackedItems
  });
}
