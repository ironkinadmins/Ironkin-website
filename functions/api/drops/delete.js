import { getSession, isStaffSession } from "../_auth.js";
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

  const eventId = body.eventId || "global";
  const name = body.name?.trim();

  if (!name) {
    return Response.json(
      { error: "Missing drop name." },
      { status: 400 }
    );
  }

  const key = getDropListKey(eventId);

  const value = await env.DROPS_KV.get(key);
  const drops = value ? JSON.parse(value) : [];

  const updatedDrops = drops.filter(drop => drop.name !== name);

  await env.DROPS_KV.put(key, JSON.stringify(updatedDrops));

  return Response.json({
    success: true,
    eventId,
    drops: updatedDrops
  });
}