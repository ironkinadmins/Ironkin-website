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

export async function onRequestPost({ request, env }) {
  if (!isStaff(request)) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const events = body.events;

  if (!Array.isArray(events)) {
    return Response.json(
      { error: "Events must be an array." },
      { status: 400 }
    );
  }

  await env.DROPS_KV.put(
    "events:active",
    JSON.stringify(events)
  );

  return Response.json({
    success: true,
    events
  });
}