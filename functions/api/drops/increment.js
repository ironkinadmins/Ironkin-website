import { getSession, isStaffSession } from "../_auth.js";
import { getDropListKey, readDropsWithClanGoalFallback } from "./_dropKeys.js";

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

  let drop = drops.find(item => item.name === name);

  if (!drop) {
    drop = {
      name,
      count: 0
    };

    drops.push(drop);
  }

  drop.count += 1;

  await env.DROPS_KV.put(key, JSON.stringify(drops));

  return Response.json({
    success: true,
    eventId,
    drop
  });
}