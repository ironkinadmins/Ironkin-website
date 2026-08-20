import { hybridKv } from "../../_hybridKv.js";
export function getDropListKey(eventId) {
  return `drops:${eventId || "global"}`;
}

export const LEGACY_CLAN_GOAL_DROP_IDS = [
  "clan-goal-hueycoatl",
  "clan-goal-vetion"
];

function isClanGoalEventId(eventId) {
  return String(eventId || "").toLowerCase() === "clan-goal";
}

function parseDrops(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function readDropsWithClanGoalFallback(env, eventId) {
  const normalizedEventId = eventId || "global";
  const key = getDropListKey(normalizedEventId);
  const value = await hybridKv(env, "drops").get(key);
  const drops = parseDrops(value);

  if (!isClanGoalEventId(normalizedEventId) || drops.length) {
    return { eventId: normalizedEventId, key, drops };
  }

  for (const legacyEventId of LEGACY_CLAN_GOAL_DROP_IDS) {
    const legacyKey = getDropListKey(legacyEventId);
    const legacyValue = await hybridKv(env, "drops").get(legacyKey);
    const legacyDrops = parseDrops(legacyValue);

    if (legacyDrops.length) {
      await hybridKv(env, "drops").put(key, JSON.stringify(legacyDrops));

      // The canonical Clan Goal key is now the only source of truth. Purging
      // the old event-specific keys prevents deleted drops from reappearing
      // later if the canonical list becomes empty.
      for (const staleEventId of LEGACY_CLAN_GOAL_DROP_IDS) {
        await hybridKv(env, "drops").delete(getDropListKey(staleEventId));
      }

      return {
        eventId: normalizedEventId,
        key,
        drops: legacyDrops,
        migratedFrom: legacyEventId
      };
    }
  }

  return { eventId: normalizedEventId, key, drops: [] };
}
