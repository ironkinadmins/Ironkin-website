const WOM_GROUP_ID = "12095";
const WOM_GROUP_URL = `https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}`;
const CACHE_SECONDS = 300;

function memberName(member) {
  return member?.player?.displayName || member?.player?.username || member?.displayName || member?.username || "Unknown member";
}

function joinedAt(member) {
  return member?.createdAt || member?.joinedAt || member?.updatedAt || null;
}

function normalizeRole(value) {
  return String(value || "recruit").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export async function onRequestGet({ request }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/api/ranks/overview-cache-v1");

  try {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let womResponse;
    try {
      womResponse = await fetch(WOM_GROUP_URL, {
        headers: { Accept: "application/json", "User-Agent": "Ironkin-Website/1.0" },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await womResponse.text();
    let group;
    try { group = text ? JSON.parse(text) : null; } catch { group = null; }
    if (!womResponse.ok || !group) {
      return Response.json({ error: "Failed to load clan ranks from Wise Old Man." }, { status: 502 });
    }

    const members = Array.isArray(group.memberships) ? group.memberships : (Array.isArray(group.members) ? group.members : []);
    const counts = {};
    for (const member of members) {
      const role = normalizeRole(member?.role || member?.rank);
      counts[role] = (counts[role] || 0) + 1;
    }

    const recent = members
      .map(member => ({ name: memberName(member), role: normalizeRole(member?.role || member?.rank), joinedAt: joinedAt(member) }))
      .filter(member => member.joinedAt && Number.isFinite(new Date(member.joinedAt).getTime()))
      .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))
      .slice(0, 8);

    const response = Response.json({
      memberCount: Number(group.memberCount || members.length),
      counts,
      recent,
      updatedAt: new Date().toISOString()
    });
    response.headers.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    return Response.json({ error: error?.name === "AbortError" ? "Wise Old Man timed out." : "Unable to load clan ranks." }, { status: 502 });
  }
}
