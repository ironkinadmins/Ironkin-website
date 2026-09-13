import { hybridKv } from "./_hybridKv.js";
const WOM_CACHE_PREFIX = "wom:competition:";
const ACTIVE_TTL_SECONDS = 10 * 60;
const UPCOMING_TTL_SECONDS = 60 * 60;
const COMPLETED_TTL_SECONDS = 24 * 60 * 60;

export function getWomCacheTtlSeconds(payload) {
  const now = Date.now();
  const starts = payload?.startsAt ? new Date(payload.startsAt).getTime() : null;
  const ends = payload?.endsAt ? new Date(payload.endsAt).getTime() : null;

  if (Number.isFinite(ends) && ends < now) return COMPLETED_TTL_SECONDS;
  if (Number.isFinite(starts) && starts > now) return UPCOMING_TTL_SECONDS;
  return ACTIVE_TTL_SECONDS;
}

function normalizePlayerName(player) {
  return (
    player?.displayName ||
    player?.username ||
    player?.name ||
    player?.player?.displayName ||
    player?.player?.username ||
    player?.player?.name ||
    player?.rsn ||
    player?.user ||
    "Unknown"
  );
}

function normalizeGained(row) {
  const raw = row?.progress?.gained ?? row?.gained ?? row?.score ?? row?.value ?? 0;
  return Number(raw || 0);
}

export function normalizeWomStandingsRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      name: normalizePlayerName(row),
      gained: normalizeGained(row),
      start: Number(row?.progress?.start ?? row?.start ?? 0),
      end: Number(row?.progress?.end ?? row?.end ?? 0),
      updatedAt: row?.updatedAt || null
    }))
    .filter(player => player.name && player.name !== "Unknown")
    .sort((a, b) => Number(b.gained || 0) - Number(a.gained || 0));
}

export function buildWomStandingsPayload(details, meta = {}) {
  const standings = normalizeWomStandingsRows(details?.participations || []);
  const totalGained = standings.reduce((sum, player) => sum + Number(player.gained || 0), 0);
  const contributors = standings.filter(player => Number(player.gained || 0) > 0).length;

  return {
    active: true,
    id: details?.id,
    title: details?.title,
    metric: details?.metric,
    startsAt: details?.startsAt,
    endsAt: details?.endsAt,
    participantCount: standings.length,
    totalGained,
    contributors,
    standings,
    cache: {
      status: meta.status || "fresh",
      fetchedAt: meta.fetchedAt || new Date().toISOString()
    }
  };
}

function getKv(env) {
  return hybridKv(env, "calendar") || hybridKv(env, "drops") || null;
}

export async function readWomStoredCache(env, competitionId) {
  const kv = getKv(env);
  if (!kv || !competitionId) return null;

  const stored = await kv.get(`${WOM_CACHE_PREFIX}${competitionId}`);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed?.standings) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeWomStoredCache(env, competitionId, payload) {
  const kv = getKv(env);
  if (!kv || !competitionId || !payload) return;

  const ttl = getWomCacheTtlSeconds(payload);
  await kv.put(`${WOM_CACHE_PREFIX}${competitionId}`, JSON.stringify(payload), {
    expirationTtl: Math.max(ttl * 6, 60 * 60)
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Ironkin-Website-WOM-Cache"
    }
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `WOM returned ${response.status}`);
  }

  return data;
}

async function fetchFreshWomSnapshot(competitionId) {
  const details = await fetchJson(`https://api.wiseoldman.net/v2/competitions/${competitionId}`);
  let payload = buildWomStandingsPayload(details, {
    status: "fresh",
    fetchedAt: new Date().toISOString()
  });

  // Older/different WOM responses may omit participations from the competition payload.
  if (!payload.standings.length) {
    const standingsResponse = await fetchJson(
      `https://api.wiseoldman.net/v2/competitions/${competitionId}/standings`
    );
    const rows = Array.isArray(standingsResponse)
      ? standingsResponse
      : standingsResponse?.standings || standingsResponse?.results || [];
    const standings = normalizeWomStandingsRows(rows);

    if (standings.length) {
      payload = {
        ...payload,
        participantCount: standings.length,
        totalGained: standings.reduce((sum, player) => sum + Number(player.gained || 0), 0),
        contributors: standings.filter(player => Number(player.gained || 0) > 0).length,
        standings
      };
    }
  }

  return payload;
}

export async function getWomCompetitionSnapshot(env, competitionId, options = {}) {
  const id = String(competitionId || "").trim();
  if (!id || id === "PUT_YOUR_WOM_ID_HERE") return null;

  const { preferCache = false } = options;
  const storedCache = await readWomStoredCache(env, id);

  if (preferCache && storedCache?.standings?.length) {
    return {
      ...storedCache,
      cache: { ...(storedCache.cache || {}), status: "kv-fallback" }
    };
  }

  try {
    const fresh = await fetchFreshWomSnapshot(id);
    if (fresh?.standings?.length) {
      await writeWomStoredCache(env, id, fresh);
      return fresh;
    }

    if (storedCache?.standings?.length) {
      return {
        ...storedCache,
        cache: {
          ...(storedCache.cache || {}),
          status: "stale",
          warning: "WOM returned an empty standings response; using the last cached snapshot."
        }
      };
    }

    return fresh;
  } catch (error) {
    if (storedCache?.standings?.length) {
      return {
        ...storedCache,
        cache: {
          ...(storedCache.cache || {}),
          status: "stale",
          warning: error?.message || "Could not refresh WOM data"
        }
      };
    }

    throw error;
  }
}


function normalizeRsnKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getEventWomCompetitionIds(event) {
  const ids = [];
  const push = value => {
    const id = String(value || "").trim();
    if (id && id !== "PUT_YOUR_WOM_ID_HERE" && !ids.includes(id)) ids.push(id);
  };
  push(event?.womCompetitionId);
  for (const item of Array.isArray(event?.womCompetitions) ? event.womCompetitions : []) {
    push(item?.competitionId || item?.womCompetitionId || item?.id);
  }
  for (const id of Array.isArray(event?.womCompetitionIds) ? event.womCompetitionIds : []) push(id);
  return ids;
}

export function combineWomCompetitionSnapshots(snapshots, meta = {}) {
  const valid = (Array.isArray(snapshots) ? snapshots : []).filter(Boolean);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];

  const players = new Map();
  for (const snapshot of valid) {
    for (const row of normalizeWomStandingsRows(snapshot?.standings || [])) {
      const key = normalizeRsnKey(row.name);
      if (!key) continue;
      const current = players.get(key) || { name: row.name, gained: 0, start: 0, end: 0, updatedAt: null };
      current.gained += Number(row.gained || 0);
      current.start += Number(row.start || 0);
      current.end += Number(row.end || 0);
      current.updatedAt = row.updatedAt || current.updatedAt;
      players.set(key, current);
    }
  }

  const standings = [...players.values()].sort((a, b) => Number(b.gained || 0) - Number(a.gained || 0) || a.name.localeCompare(b.name));
  const starts = valid.map(item => item?.startsAt).filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  const ends = valid.map(item => item?.endsAt).filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  const metrics = [...new Set(valid.map(item => String(item?.metric || "").trim()).filter(Boolean))];

  return {
    active: true,
    combined: true,
    id: meta.id || valid.map(item => item?.id).filter(Boolean).join("+"),
    competitionIds: valid.map(item => String(item?.id || "")).filter(Boolean),
    title: meta.title || valid[0]?.title || "Combined BOTW",
    metric: meta.metric || metrics.join(" + "),
    metrics,
    startsAt: starts.length ? new Date(Math.min(...starts)).toISOString() : valid[0]?.startsAt || null,
    endsAt: ends.length ? new Date(Math.max(...ends)).toISOString() : valid[0]?.endsAt || null,
    participantCount: standings.length,
    totalGained: standings.reduce((sum, player) => sum + Number(player.gained || 0), 0),
    contributors: standings.filter(player => Number(player.gained || 0) > 0).length,
    standings,
    cache: {
      status: valid.some(item => item?.cache?.status === "stale") ? "stale" : "combined",
      fetchedAt: new Date().toISOString()
    }
  };
}

export async function getEventWomSnapshot(env, event, options = {}) {
  const ids = getEventWomCompetitionIds(event);
  if (!ids.length) return null;
  const snapshots = await Promise.all(ids.map(id => getWomCompetitionSnapshot(env, id, options)));
  return combineWomCompetitionSnapshots(snapshots, {
    id: event?.id,
    title: event?.title || undefined,
    metric: event?.combinedMetric || undefined
  });
}

export async function repairArchiveEntryFromWom(env, entry) {
  const competitionIds = getEventWomCompetitionIds(entry);
  const competitionId = competitionIds[0] || "";
  const existingRows = normalizeWomStandingsRows(
    Array.isArray(entry?.leaderboard) && entry.leaderboard.length
      ? entry.leaderboard
      : entry?.topFive
  );
  const hasPositiveGain = existingRows.some(player => Number(player.gained || 0) > 0);
  const alreadyHealthy = Boolean(
    existingRows.length &&
    (!hasPositiveGain || entry?.winner) &&
    (!hasPositiveGain || Number(entry?.totalGained || 0) > 0)
  );

  if (!competitionId || competitionId === "PUT_YOUR_WOM_ID_HERE" || alreadyHealthy) {
    return { entry, repaired: false };
  }

  try {
    const snapshot = await getEventWomSnapshot(env, entry);
    const rows = normalizeWomStandingsRows(snapshot?.standings || []);
    if (!rows.length) return { entry, repaired: false };

    const topFive = rows.filter(player => Number(player.gained || 0) > 0).slice(0, 5);
    const winner = topFive[0] || rows[0] || entry?.winner || null;

    return {
      repaired: true,
      entry: {
        ...entry,
        title: snapshot?.title || entry?.title,
        metric: snapshot?.metric || entry?.metric || null,
        startDate: snapshot?.startsAt || entry?.startDate || null,
        endDate: snapshot?.endsAt || entry?.endDate || null,
        totalGained: Number(snapshot?.totalGained ?? entry?.totalGained ?? 0),
        contributors: Number(snapshot?.contributors ?? entry?.contributors ?? 0),
        winner,
        topFive,
        leaderboard: rows,
        repairedAt: new Date().toISOString()
      }
    };
  } catch {
    // Archive pages must remain available even if WOM is temporarily unreachable.
    return { entry, repaired: false };
  }
}
