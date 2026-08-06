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

  const eventId = body.eventId;
  const name = body.name?.trim();
  const image = body.image?.trim() || "";
  const wikiUrl = body.wikiUrl?.trim() || "";
  const rewardEmbers = Math.max(0, Number(body.rewardEmbers || 0));

  if (!eventId || !name) {
    return Response.json(
      { error: "Missing eventId or drop name." },
      { status: 400 }
    );
  }

  const key = getDropListKey(eventId);

  const existingValue = await env.DROPS_KV.get(key);
  const drops = existingValue ? JSON.parse(existingValue) : [];

  const existing = drops.find(drop => drop.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    if (image) existing.image = image;
    if (wikiUrl) existing.wikiUrl = wikiUrl;
    if (body.rewardEmbers !== undefined) existing.rewardEmbers = rewardEmbers;
  } else {
    drops.push({ name, image, wikiUrl, rewardEmbers, count: 0 });
  }

  await env.DROPS_KV.put(key, JSON.stringify(drops));

  return Response.json({
    success: true,
    drops
  });
}