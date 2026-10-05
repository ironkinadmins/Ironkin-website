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
  return (Array.isArray(challenge?.shoppingItems) ? challenge.shoppingItems : []).map((item, index) => {
    const legacyId = Number(item.itemId) || 0;
    const itemIds = [...new Set((Array.isArray(item.itemIds) ? item.itemIds : [legacyId])
      .map(Number).filter(id => Number.isInteger(id) && id > 0))];
    return {
      id: String(item.id || `shopping-${index + 1}`),
      itemId: itemIds[0] || 0,
      itemIds,
      name: String(item.name || `Item ${itemIds[0] || ""}`).trim(),
      image: String(item.image || "").trim()
    };
  }).filter(item => item.itemIds.length);
}

export function shoppingObjectiveForItem(challenge, itemId) {
  const id = Number(itemId) || 0;
  return shoppingItems(challenge).find(item => item.itemIds.includes(id)) || null;
}

export async function shoppingSubmissionRows(env, eventId) {
  if (!hasSupabase(env)) return [];
  // RuneLite submissions use the team-specific Shopping List event id. Manual
  // Discord /submit rows use one shared catalog event so the bot never has to
  // choose between duplicate per-team catalog entries. Team ownership is
  // resolved below from the submitter's Discord id against the live Games
  // roster, so an in-progress Games configuration never needs to be re-saved.
  const manualEventId = "ig-shopping-manual";
  const eventFilter = `or=(website_event_id.eq.${encodeURIComponent(eventId)},website_event_id.eq.${encodeURIComponent(manualEventId)})`;
  const response = await supabaseRest(env, `ironkin_event_submissions?select=id,item_id,item_name,shopping_objective_id,player_name,discord_id,status,proof_url,client_timestamp,processed_at,claimed_at,created_at&${eventFilter}&status=in.(pending,approved)&order=created_at.asc&limit=5000`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

export function shoppingTeamProgress(state, team, challenge, rows) {
  const memberIds = new Set([String(team?.captainDiscordId || ""), ...(team?.members || []).map(m => String(m.discordId || m.id || ""))].filter(Boolean));
  const items = shoppingItems(challenge);
  const byObjective = new Map();
  for (const row of rows || []) {
    if (!memberIds.has(String(row.discord_id || ""))) continue;
    const itemId = Number(row.item_id) || 0;
    const objective = items.find(item => String(row.shopping_objective_id || "") === item.id || item.itemIds.includes(itemId));
    if (!objective) continue;
    const previous = byObjective.get(objective.id);
    if (!previous || String(row.status) === "approved" || String(previous.status) !== "approved") byObjective.set(objective.id, row);
  }
  return items.map(item => {
    const row = byObjective.get(item.id) || null;
    return {
      ...item,
      matchedItemId: row ? (Number(row.item_id) || 0) : 0,
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
