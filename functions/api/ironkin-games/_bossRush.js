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

  // A Boss Rush baseline must be fresh. Never silently fall back to an older WOM
  // snapshot: the timer only begins after WOM has accepted the update and we have
  // a snapshot created for this start request.
  const requestedAt = Date.now();
  let updateResponse;
  try {
    updateResponse = await fetch(`${WOM_BASE}/players/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { ...headers(env), "Accept": "application/json" }
    });
  } catch {
    throw new Error("Could not reach Wise Old Man. Your attempt has NOT started. Please try again.");
  }

  const updateText = await updateResponse.text().catch(() => "");
  let updateData = {};
  try { updateData = updateText ? JSON.parse(updateText) : {}; } catch {}
  if (!updateResponse.ok) {
    const detail = updateData?.message || updateData?.error || "Wise Old Man did not accept the update.";
    throw new Error(`${detail} Your attempt has NOT started.`);
  }

  const snapshotFrom = data => data?.latestSnapshot || data?.player?.latestSnapshot || data?.snapshot || null;
  const bossesFrom = snapshot => {
    const raw = snapshot?.data?.bosses || {};
    const bosses = {};
    for (const [metric, value] of Object.entries(raw)) bosses[metric] = Math.max(0, Number(value?.kills || 0));
    return bosses;
  };
  const isFresh = snapshot => {
    const stamp = new Date(snapshot?.createdAt || snapshot?.updatedAt || 0).getTime();
    // Small clock tolerance for WOM/server clock differences.
    return Number.isFinite(stamp) && stamp >= requestedAt - 5000;
  };

  let snapshot = snapshotFrom(updateData);
  if (!snapshot || !isFresh(snapshot)) {
    // WOM may acknowledge the update before the new snapshot is visible on GET.
    // Poll briefly so we never start the official timer against a stale baseline.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 650));
      let response;
      try {
        response = await fetch(`${WOM_BASE}/players/${encodeURIComponent(name)}`, {
          headers: { ...headers(env), "Accept": "application/json" }
        });
      } catch { continue; }
      if (!response.ok) continue;
      const data = await response.json().catch(() => ({}));
      const candidate = snapshotFrom(data);
      if (candidate && isFresh(candidate)) { snapshot = candidate; break; }
    }
  }

  if (!snapshot || !isFresh(snapshot)) {
    throw new Error("WOM has not confirmed a fresh starting snapshot yet. Your attempt has NOT started. Stay logged out and try again in a moment.");
  }

  return {
    rsn: name,
    bosses: bossesFrom(snapshot),
    womSnapshotAt: snapshot.createdAt || snapshot.updatedAt || ""
  };
}

export function bossGains(before = {}, after = {}) {
  const gains = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const gained = Math.max(0, Number(after[key] || 0) - Number(before[key] || 0));
    if (gained > 0) gains[key] = gained;
  }
  return gains;
}
