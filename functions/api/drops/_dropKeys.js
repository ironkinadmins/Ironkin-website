export function getDropListKey(eventId) {
  return `drops:${eventId || "global"}`;
}

const LEGACY_CLAN_GOAL_DROP_IDS = [
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
  const value = await env.DROPS_KV.get(key);
  const drops = parseDrops(value);

  if (!isClanGoalEventId(normalizedEventId) || drops.length) {
    return { eventId: normalizedEventId, key, drops };
  }

  for (const legacyEventId of LEGACY_CLAN_GOAL_DROP_IDS) {
    const legacyKey = getDropListKey(legacyEventId);
    const legacyValue = await env.DROPS_KV.get(legacyKey);
    const legacyDrops = parseDrops(legacyValue);

    if (legacyDrops.length) {
      await env.DROPS_KV.put(key, JSON.stringify(legacyDrops));
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
