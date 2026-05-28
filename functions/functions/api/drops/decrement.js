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

export async function onRequestPost({ request, env }) {
  const session = getSession(request);

  const isStaff =
    session?.roles?.some(roleId =>
      STAFF_ROLE_IDS.includes(roleId)
    );

  if (!isStaff) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const name = body.name;

  if (!name) {
    return Response.json(
      { error: "Missing drop name." },
      { status: 400 }
    );
  }

const eventResponse = await fetch(
  "https://ironkin-website.pages.dev/api/event-standings"
);

const eventData = await eventResponse.json();

const metric = eventData.metric || "default";

const key = `drop-count:${metric}:${name}`;
  const current = Number(await env.DROPS_KV.get(key) || 0);
  const next = Math.max(current - 1, 0);

  await env.DROPS_KV.put(key, String(next));

  return Response.json({
    name,
    count: next
  });
}