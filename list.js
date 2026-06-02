function getDropListKey(eventId) {
  return `drops:${eventId}`;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  const eventId =
    url.searchParams.get("eventId") ||
    "global";

  const key = getDropListKey(eventId);

  const value = await env.DROPS_KV.get(key);
  const drops = value ? JSON.parse(value) : [];

  return Response.json({
    eventId,
    drops
  });
}