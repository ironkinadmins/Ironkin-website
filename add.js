const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);

  if (!match) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

function isStaff(request) {
  const session = getSession(request);

  return session?.roles?.some(roleId =>
    STAFF_ROLE_IDS.includes(roleId)
  );
}

function getDropListKey(eventId) {
  return `drops:${eventId}`;
}

export async function onRequestPost({ request, env }) {
  if (!isStaff(request)) {
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