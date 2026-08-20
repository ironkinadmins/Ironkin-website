import { hybridKv } from "../../_hybridKv.js";
import { getSession } from "../_auth.js";
import { ensureDiscordProfilesSynced } from "../_discordProfiles.js";
const PROFILE_INDEX_KEY = "member-profiles:index";

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
  const session = await getSession(request, env);

  if (!session) {
    return Response.json({ error: "Please sign in to search member profiles." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();

  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  // Keep the directory populated with every current non-bot Discord guild member,
  // including members who have never signed into the website.
  let syncWarning = "";
  try {
    await ensureDiscordProfilesSynced(env);
  } catch (error) {
    syncWarning = error?.message || "Discord profile sync failed.";
    console.warn("Discord profile sync skipped:", syncWarning);
  }

  // Only members present in the profile index are eligible to appear in search.
  // Supabase is used solely to enrich those real profiles with Ember data.
  const index = safeJsonParse(await hybridKv(env, "drops").get(PROFILE_INDEX_KEY), []);
  const balances = await getSupabaseBalances(env);
  const balanceById = new Map();

  balances.forEach(row => {
    const discordId = String(row.user_id || "");
    if (!discordId) return;
    balanceById.set(discordId, {
      displayName: row.display_name || "",
      embers: Number(row.balance || 0)
    });
  });

  const byId = new Map();

  if (Array.isArray(index)) {
    index.forEach(item => {
      const discordId = String(item.discordId || "");
      if (!discordId) return;

      const balance = balanceById.get(discordId);

      byId.set(discordId, {
        discordId,
        displayName: item.displayName || balance?.displayName || "Unknown member",
        username: item.username || "",
        avatar: item.avatar || "",
        avatarUrl: item.avatarUrl || "",
        rank: item.rank || "",
        staffRank: item.staffRank || "",
        embers: balance?.embers || 0
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

  return Response.json({ results, syncWarning });
}
