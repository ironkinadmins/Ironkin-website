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

  const drop = drops.find(item => item.name === name);

  if (drop) {
    drop.count = Math.max(drop.count - 1, 0);
  }

  await env.DROPS_KV.put(key, JSON.stringify(drops));

  return Response.json({
    success: true,
    eventId,
    drop
  });
}