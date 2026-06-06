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

function matches(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

async function getSupabaseBalances(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return [];

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/balances?select=display_name,balance,user_id,guild_id&order=display_name.asc&limit=1000`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json"
        }
      }
    );

    const data = await response.json().catch(() => []);
    return response.ok && Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function getProfileRecord(env, discordId) {
  if (!discordId) return {};
  const raw = await env.DROPS_KV.get(`member-profile:${discordId}`);
  return safeJsonParse(raw, {});
}

export async function onRequestGet({ request, env }) {
  const session = getSession(request);

  if (!session || !isStaff(session)) {
    return Response.json({ error: "Only staff can search member profiles." }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();

  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  const index = safeJsonParse(await env.DROPS_KV.get(PROFILE_INDEX_KEY), []);
  const balances = await getSupabaseBalances(env);
  const byId = new Map();

  balances.forEach(row => {
    const discordId = String(row.user_id || "");
    if (!discordId) return;
    byId.set(discordId, {
      discordId,
      displayName: row.display_name || "Unknown member",
      username: "",
      embers: Number(row.balance || 0),
      source: "supabase"
    });
  });

  if (Array.isArray(index)) {
    index.forEach(item => {
      const discordId = String(item.discordId || "");
      if (!discordId) return;
      const existing = byId.get(discordId) || { discordId, embers: 0, source: "profile" };
      byId.set(discordId, {
        ...existing,
        displayName: item.displayName || existing.displayName || "Unknown member",
        username: item.username || existing.username || ""
      });
    });
  }

  const matched = Array.from(byId.values())
    .filter(item =>
      matches(item.displayName, q) ||
      matches(item.username, q) ||
      matches(item.discordId, q)
    )
    .slice(0, 20);

  const hydrated = [];

  for (const item of matched) {
    const record = await getProfileRecord(env, item.discordId);
    hydrated.push({
      ...item,
      customAvatarUrl: record.customAvatarUrl || "",
      blurb: record.blurb || "",
      adminAvatarOverride: record.adminAvatarOverride || "",
      adminBlurbOverride: record.adminBlurbOverride || "",
      rankOverride: record.rankOverride || ""
    });
  }

  return Response.json({ results: hydrated });
}
