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
  return session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId));
}

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("bingo:board");

  if (!saved) {
    return Response.json({
      locked: false,
      tiles: []
    });
  }

  return Response.json(JSON.parse(saved));
}

export async function onRequestPost({ request, env }) {
  if (!isStaff(request)) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();

  if (!Array.isArray(body.tiles)) {
    return Response.json(
      { error: "Tiles must be an array." },
      { status: 400 }
    );
  }

  const board = {
    locked: Boolean(body.locked),
    updatedAt: body.updatedAt || new Date().toISOString(),
    tiles: body.tiles.slice(0, 100).map((tile, index) => ({
      id: Number.isFinite(Number(tile.id)) ? Number(tile.id) : index,
      name: String(tile.name || "").slice(0, 100),
      image: String(tile.image || "").slice(0, 500),
      claimedBy: String(tile.claimedBy || "").slice(0, 100),
      status: String(tile.status || "open").slice(0, 30)
    }))
  };

  await env.DROPS_KV.put("bingo:board", JSON.stringify(board));

  return Response.json({ success: true, ...board });
}

