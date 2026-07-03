import { getDropListKey, readDropsWithClanGoalFallback } from "./_dropKeys.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  const eventId =
    url.searchParams.get("eventId") ||
    "global";

  const result = await readDropsWithClanGoalFallback(env, eventId);

  return Response.json({
    eventId: result.eventId,
    drops: result.drops,
    migratedFrom: result.migratedFrom || null
  });
}