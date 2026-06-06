const PROFILE_INDEX_KEY = "member-profiles:index";
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

function isStaff(session) {
  return Boolean(session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId)));
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getProfileRecord(env, discordId) {
  const raw = await env.DROPS_KV.get(`member-profile:${discordId}`);
  return safeJsonParse(raw, {});
}

async function saveProfileRecord(env, discordId, record) {
  await env.DROPS_KV.put(`member-profile:${discordId}`, JSON.stringify(record));

  const index = safeJsonParse(await env.DROPS_KV.get(PROFILE_INDEX_KEY), []);
  const nextIndex = Array.isArray(index) ? index.filter(item => item.discordId !== discordId) : [];
  nextIndex.push({
    discordId,
    displayName: record.displayName || "Unknown member",
    username: record.username || "",
    updatedAt: new Date().toISOString()
  });
  await env.DROPS_KV.put(PROFILE_INDEX_KEY, JSON.stringify(nextIndex));
}

export async function onRequestPost({ request, env }) {
  const session = getSession(request);

  if (!session || !isStaff(session)) {
    return Response.json({ error: "Only staff can update member profiles." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const discordId = String(body.discordId || "").trim();

  if (!discordId) {
    return Response.json({ error: "Missing member Discord ID." }, { status: 400 });
  }

  const existing = await getProfileRecord(env, discordId);
  const next = {
    ...existing,
    displayName: String(body.displayName || existing.displayName || "Unknown member").trim(),
    username: String(body.username || existing.username || "").trim(),
    adminAvatarOverride: String(body.adminAvatarOverride || "").trim(),
    adminBlurbOverride: String(body.adminBlurbOverride || "").trim().slice(0, 250),
    rankOverride: String(body.rankOverride || "").trim().slice(0, 80),
    moderatedBy: session.id,
    moderatedAt: new Date().toISOString()
  };

  await saveProfileRecord(env, discordId, next);

  return Response.json({ success: true, profile: next });
}
