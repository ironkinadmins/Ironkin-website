const PROFILE_INDEX_KEY = "member-profiles:index";

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

function getDiscordAvatarUrl(item) {
  if (item?.avatarUrl) return item.avatarUrl;
  if (!item?.discordId || !item?.avatar) return "assets/ironkin-emblem.png";
  const extension = String(item.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${item.discordId}/${item.avatar}.${extension}?size=64`;
}

async function getSupabaseBalances(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return [];

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/balances?select=display_name,balance,user_id&order=display_name.asc&limit=1000`,
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

export async function onRequestGet({ request, env }) {
  const session = getSession(request);

  if (!session) {
    return Response.json({ error: "Please sign in to search member profiles." }, { status: 401 });
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
        username: item.username || existing.username || "",
        avatar: item.avatar || "",
        avatarUrl: item.avatarUrl || "",
        rank: item.rank || existing.rank || "",
        staffRank: item.staffRank || existing.staffRank || ""
      });
    });
  }

  const results = Array.from(byId.values())
    .filter(item =>
      matches(item.displayName, q) ||
      matches(item.username, q) ||
      matches(item.discordId, q)
    )
    .slice(0, 8)
    .map(item => ({
      discordId: item.discordId,
      displayName: item.displayName,
      username: item.username,
      avatarUrl: getDiscordAvatarUrl(item),
      rank: item.rank || "",
      staffRank: item.staffRank || "",
      profileUrl: `profile.html?id=${encodeURIComponent(item.discordId)}`
    }));

  return Response.json({ results });
}
