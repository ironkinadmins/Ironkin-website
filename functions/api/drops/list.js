import { hybridKv } from "../../_hybridKv.js";
import { readDropsWithClanGoalFallback } from "./_dropKeys.js";
import { hasSupabase, supabaseRest } from "../_supabase.js";
import { getSession } from "../_auth.js";

async function resolveWebsiteEventId(env, requestedEventId) {
  const raw = await hybridKv(env, "drops").get("events:active");
  let events = [];
  try { events = raw ? JSON.parse(raw) : []; } catch { events = []; }
  const match = (Array.isArray(events) ? events : []).find(event =>
    String(event?.id || "") === requestedEventId || String(event?.pluginEventId || "") === requestedEventId
  );
  return String(match?.id || requestedEventId || "global");
}

function itemKey(itemId, itemName) {
  const id = Number(itemId || 0);
  if (Number.isInteger(id) && id > 0) return `id:${id}`;
  return `name:${String(itemName || "").trim().toLowerCase()}`;
}

function hunterKey(row) {
  return String(row?.discord_id || row?.player_key || row?.player_name || "").trim().toLowerCase();
}

function approvedAt(row) {
  return row?.processed_at || row?.claimed_at || row?.created_at || null;
}

async function approvedRows(env, websiteEventId) {
  if (!hasSupabase(env)) return null;
  const response = await supabaseRest(
    env,
    `ironkin_event_submissions?select=id,item_id,item_name,quantity,player_name,player_key,discord_id,processed_at,claimed_at,created_at&website_event_id=eq.${encodeURIComponent(websiteEventId)}&status=eq.approved&order=processed_at.desc.nullslast,created_at.desc&limit=5000`
  );
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function buildBountyDetail(drops, rows, session) {
  const rewardByKey = new Map();
  const imageByKey = new Map();
  for (const drop of drops) {
    const key = itemKey(drop?.itemId, drop?.name);
    rewardByKey.set(key, Math.max(0, Number(drop?.rewardEmbers || 0)));
    imageByKey.set(key, String(drop?.image || ""));
  }

  const activeKeys = new Set(rewardByKey.keys());
  const activeRows = rows.filter(row => activeKeys.has(itemKey(row?.item_id, row?.item_name)));
  const countByKey = new Map();
  const viewerCountByKey = new Map();
  const hunterMap = new Map();
  const viewerDiscordId = String(session?.id || "");
  let totalClaims = 0;
  let totalEmbers = 0;
  let viewerClaims = 0;
  let viewerEmbers = 0;

  for (const row of activeRows) {
    const quantity = Math.max(0, Number(row?.quantity || 0));
    if (!quantity) continue;
    const key = itemKey(row?.item_id, row?.item_name);
    const reward = Number(rewardByKey.get(key) || 0);
    totalClaims += quantity;
    totalEmbers += reward * quantity;
    countByKey.set(key, (countByKey.get(key) || 0) + quantity);

    const hKey = hunterKey(row);
    if (hKey) {
      const hunter = hunterMap.get(hKey) || {
        playerName: String(row?.player_name || "Clan member"),
        totalClaims: 0,
        itemKeys: new Set(),
        embers: 0
      };
      hunter.totalClaims += quantity;
      hunter.itemKeys.add(key);
      hunter.embers += reward * quantity;
      if (!hunter.playerName && row?.player_name) hunter.playerName = String(row.player_name);
      hunterMap.set(hKey, hunter);
    }

    if (viewerDiscordId && String(row?.discord_id || "") === viewerDiscordId) {
      viewerClaims += quantity;
      viewerEmbers += reward * quantity;
      viewerCountByKey.set(key, (viewerCountByKey.get(key) || 0) + quantity);
    }
  }

  const enrichedDrops = drops.map(drop => {
    const key = itemKey(drop?.itemId, drop?.name);
    return {
      ...drop,
      count: Number(countByKey.get(key) || 0),
      viewerCount: Number(viewerCountByKey.get(key) || 0)
    };
  });

  const recentClaims = activeRows.slice(0, 12).map(row => {
    const key = itemKey(row?.item_id, row?.item_name);
    const quantity = Math.max(1, Number(row?.quantity || 1));
    const reward = Number(rewardByKey.get(key) || 0);
    return {
      id: String(row?.id || ""),
      playerName: String(row?.player_name || "Clan member"),
      itemName: String(row?.item_name || "Bounty"),
      quantity,
      embers: reward * quantity,
      image: String(imageByKey.get(key) || ""),
      claimedAt: approvedAt(row)
    };
  });

  const topHunters = [...hunterMap.values()]
    .map(hunter => ({
      playerName: hunter.playerName,
      totalClaims: hunter.totalClaims,
      uniqueBounties: hunter.itemKeys.size,
      embers: hunter.embers
    }))
    .sort((a, b) => b.uniqueBounties - a.uniqueBounties || b.totalClaims - a.totalClaims || b.embers - a.embers || a.playerName.localeCompare(b.playerName))
    .slice(0, 5);

  return {
    drops: enrichedDrops,
    stats: {
      totalClaims,
      otherClanClaims: Math.max(0, totalClaims - viewerClaims),
      uniqueHunters: hunterMap.size,
      totalEmbers
    },
    viewer: {
      signedIn: Boolean(session?.id),
      totalClaims: viewerClaims,
      uniqueClaimed: viewerCountByKey.size,
      embersEarned: viewerEmbers
    },
    recentClaims,
    topHunters
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") || "global";
  const wantsBountyDetail = url.searchParams.get("detail") === "bounties" || eventId === "bounties";
  const result = await readDropsWithClanGoalFallback(env, eventId);

  let drops = Array.isArray(result.drops) ? result.drops : [];
  let countSource = "legacy-kv";
  let detail = null;
  try {
    const websiteEventId = await resolveWebsiteEventId(env, eventId);
    const rows = await approvedRows(env, websiteEventId);
    if (rows) {
      if (wantsBountyDetail) {
        const session = await getSession(request, env);
        detail = buildBountyDetail(drops, rows, session);
        drops = detail.drops;
      } else {
        const countsByKey = new Map();
        for (const row of rows) {
          const key = itemKey(row?.item_id, row?.item_name);
          countsByKey.set(key, (countsByKey.get(key) || 0) + Math.max(0, Number(row?.quantity || 0)));
        }
        drops = drops.map(drop => ({ ...drop, count: Number(countsByKey.get(itemKey(drop?.itemId, drop?.name)) || 0) }));
      }
      countSource = "supabase-approved";
    }
  } catch (error) {
    // Keep the existing KV counts as a safe fallback if Supabase is unavailable.
    console.warn("Could not load approved Supabase drop counts:", error?.message || error);
  }

  return Response.json({
    eventId: result.eventId,
    drops,
    migratedFrom: result.migratedFrom || null,
    countSource,
    ...(detail ? {
      stats: detail.stats,
      viewer: detail.viewer,
      recentClaims: detail.recentClaims,
      topHunters: detail.topHunters
    } : {})
  });
}
