import { getSession, isStaffSession } from "./functions/api/_auth.js";
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

  if (!eventId || !name) {
    return Response.json(
      { error: "Missing eventId or drop name." },
      { status: 400 }
    );
  }

  const key = getDropListKey(eventId);

  const existingValue = await env.DROPS_KV.get(key);
  const drops = existingValue ? JSON.parse(existingValue) : [];

  const exists = drops.some(drop => drop.name === name);

  if (!exists) {
    drops.push({
      name,
      count: 0
    });
  }

  await env.DROPS_KV.put(key, JSON.stringify(drops));

  return Response.json({
    success: true,
    drops
  });
}