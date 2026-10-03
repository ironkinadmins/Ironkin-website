import { hasSupabase, supabaseRest } from "../_supabase.js";

export function shoppingEventId(weekId, challengeId, teamId) {
  const clean = v => String(v || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `ig-shopping-${clean(weekId)}-${clean(challengeId)}-${clean(teamId)}`;
}

export function teamForDiscord(state, discordId) {
  const id = String(discordId || "");
  if (!id) return null;
  return (state.teams || []).find(team => String(team.captainDiscordId || "") === id || (team.members || []).some(m => String(m.discordId || m.id || "") === id)) || null;
}

export function shoppingChallenges(state, now = Date.now()) {
  const out = [];
  for (const week of state.weeks || []) {
    for (const challenge of week.challenges || []) {
      if (String(challenge.trackerType || "") !== "shopping-list") continue;
      const start = new Date(challenge.opensAt || week.startDate || 0).getTime();
      const end = new Date(challenge.closesAt || week.endDate || 0).getTime();
      const open = (!Number.isFinite(start) || now >= start) && (!Number.isFinite(end) || now <= end);
      out.push({ week, challenge, open });
    }
  }
  return out;
}

export function shoppingItems(challenge) {
  return (Array.isArray(challenge?.shoppingItems) ? challenge.shoppingItems : []).map((item, index) => ({
    id: String(item.id || `shopping-${index + 1}`),
    itemId: Number(item.itemId) || 0,
    name: String(item.name || `Item ${item.itemId || ""}`).trim(),
    image: String(item.image || "").trim()
  })).filter(item => Number.isInteger(item.itemId) && item.itemId > 0);
}

export async function shoppingSubmissionRows(env, eventId) {
  if (!hasSupabase(env)) return [];
  const response = await supabaseRest(env, `ironkin_event_submissions?select=id,item_id,item_name,player_name,discord_id,status,proof_url,client_timestamp,processed_at,claimed_at,created_at&website_event_id=eq.${encodeURIComponent(eventId)}&status=in.(pending,approved)&order=created_at.asc&limit=5000`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

export function shoppingTeamProgress(state, team, challenge, rows) {
  const memberIds = new Set([String(team?.captainDiscordId || ""), ...(team?.members || []).map(m => String(m.discordId || m.id || ""))].filter(Boolean));
  const items = shoppingItems(challenge);
  const byItem = new Map();
  for (const row of rows || []) {
    if (!memberIds.has(String(row.discord_id || ""))) continue;
    const itemId = Number(row.item_id) || 0;
    if (!items.some(item => item.itemId === itemId)) continue;
    const previous = byItem.get(itemId);
    if (!previous || String(row.status) === "approved" || String(previous.status) !== "approved") byItem.set(itemId, row);
  }
  return items.map(item => {
    const row = byItem.get(item.itemId) || null;
    return {
      ...item,
      status: row ? String(row.status || "pending") : "missing",
      submissionId: row?.id || "",
      playerName: row?.player_name || "",
      proofUrl: row?.proof_url || "",
      obtainedAt: row?.processed_at || row?.claimed_at || row?.client_timestamp || row?.created_at || ""
    };
  });
}

export async function resolveShoppingEvent(state, env, requestedEventId, discordId) {
  const team = teamForDiscord(state, discordId);
  if (!team) return null;
  const entry = shoppingChallenges(state).find(x => x.open && shoppingEventId(x.week.id, x.challenge.id, team.id) === String(requestedEventId || ""));
  if (!entry) return null;
  const eventId = shoppingEventId(entry.week.id, entry.challenge.id, team.id);
  const rows = await shoppingSubmissionRows(env, eventId);
  const progress = shoppingTeamProgress(state, team, entry.challenge, rows);
  return { ...entry, eventId, team, rows, progress };
}
