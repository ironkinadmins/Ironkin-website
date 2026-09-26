const WOM_BASE = "https://api.wiseoldman.net/v2";

function headers(env) {
  const h = { "User-Agent": "Ironkin Games Boss Rush" };
  if (env.WOM_API_KEY) h["x-api-key"] = env.WOM_API_KEY;
  return h;
}

export function memberForSession(team, session) {
  const id = String(session?.id || "");
  return (team?.members || []).find(m => String(m.discordId || m.id || "") === id)
    || (String(team?.captainDiscordId || "") === id ? (team?.members || []).find(m => String(m.discordId || m.id || "") === id) : null);
}

export async function updateAndReadBosses(env, rsn) {
  const name = String(rsn || "").trim();
  if (!name) throw new Error("Your team profile does not have an RSN assigned.");
  // Ask WOM to create a fresh snapshot first. WOM can rate-limit updates, so a
  // failed update is followed by a read; if no player data exists we fail safely.
  try {
    await fetch(`${WOM_BASE}/players/${encodeURIComponent(name)}`, { method:"POST", headers:headers(env) });
  } catch {}
  const r = await fetch(`${WOM_BASE}/players/${encodeURIComponent(name)}`, { headers:headers(env) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || `Could not load ${name} from Wise Old Man.`);
  const raw = data?.latestSnapshot?.data?.bosses || {};
  const bosses = {};
  for (const [metric, value] of Object.entries(raw)) bosses[metric] = Math.max(0, Number(value?.kills || 0));
  return { rsn:name, bosses, womSnapshotAt:data?.latestSnapshot?.createdAt || "" };
}

export function bossGains(before = {}, after = {}) {
  const gains = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const gained = Math.max(0, Number(after[key] || 0) - Number(before[key] || 0));
    if (gained > 0) gains[key] = gained;
  }
  return gains;
}
