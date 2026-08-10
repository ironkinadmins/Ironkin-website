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
  return env.CALENDAR_KV || env.DROPS_KV || null;
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

export async function repairArchiveEntryFromWom(env, entry) {
  const competitionId = String(entry?.womCompetitionId || "").trim();
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
    const snapshot = await getWomCompetitionSnapshot(env, competitionId);
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
