const WOM_CACHE_PREFIX = "wom:competition:";
const ACTIVE_TTL_SECONDS = 10 * 60;
const UPCOMING_TTL_SECONDS = 60 * 60;
const COMPLETED_TTL_SECONDS = 24 * 60 * 60;

function getCacheTtlSeconds(payload) {
  const now = Date.now();
  const starts = payload?.startsAt ? new Date(payload.startsAt).getTime() : null;
  const ends = payload?.endsAt ? new Date(payload.endsAt).getTime() : null;

  if (Number.isFinite(ends) && ends < now) return COMPLETED_TTL_SECONDS;
  if (Number.isFinite(starts) && starts > now) return UPCOMING_TTL_SECONDS;
  return ACTIVE_TTL_SECONDS;
}

function buildStandingsPayload(details, meta = {}) {
  const standings = (details.participations || [])
    .map(entry => ({
      name: entry.player?.displayName || entry.player?.username || "Unknown",
      gained: entry.progress?.gained || 0,
      start: entry.progress?.start || 0,
      end: entry.progress?.end || 0,
      updatedAt: entry.updatedAt
    }))
    .sort((a, b) => b.gained - a.gained);

  const totalGained = standings.reduce(
    (sum, player) => sum + Number(player.gained || 0),
    0
  );

  const contributors = standings.filter(player => Number(player.gained || 0) > 0).length;

  return {
    active: true,
    id: details.id,
    title: details.title,
    metric: details.metric,
    startsAt: details.startsAt,
    endsAt: details.endsAt,
    participantCount: details.participations?.length || 0,
    totalGained,
    contributors,
    standings,
    cache: {
      status: meta.status || "fresh",
      fetchedAt: meta.fetchedAt || new Date().toISOString()
    }
  };
}

function jsonResponse(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": `public, max-age=${getCacheTtlSeconds(payload)}`,
      ...(init.headers || {})
    }
  });
}

async function readStoredCache(env, key) {
  const kv = env.CALENDAR_KV || env.DROPS_KV;
  if (!kv) return null;

  const stored = await kv.get(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

async function writeStoredCache(env, key, payload) {
  const kv = env.CALENDAR_KV || env.DROPS_KV;
  if (!kv) return;

  const ttl = getCacheTtlSeconds(payload);
  await kv.put(key, JSON.stringify(payload), {
    expirationTtl: Math.max(ttl * 6, 60 * 60)
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const competitionId = String(url.searchParams.get("competitionId") || "").trim();
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!competitionId) {
    return Response.json(
      { error: "Missing competitionId" },
      { status: 400 }
    );
  }

  const cacheKey = `${WOM_CACHE_PREFIX}${competitionId}`;
  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.delete("refresh");
  const requestCacheKey = new Request(cacheUrl.toString(), context.request);
  const edgeCache = caches.default;

  if (!forceRefresh) {
    const edgeCached = await edgeCache.match(requestCacheKey);
    if (edgeCached) return edgeCached;
  }

  const storedCache = await readStoredCache(context.env, cacheKey);
  const now = Date.now();
  const storedFetchedAt = storedCache?.cache?.fetchedAt ? new Date(storedCache.cache.fetchedAt).getTime() : 0;
  const storedFreshForMs = storedCache ? getCacheTtlSeconds(storedCache) * 1000 : 0;

  if (!forceRefresh && storedCache && Number.isFinite(storedFetchedAt) && now - storedFetchedAt < storedFreshForMs) {
    const response = jsonResponse({
      ...storedCache,
      cache: {
        ...(storedCache.cache || {}),
        status: "kv-fresh"
      }
    });
    context.waitUntil?.(edgeCache.put(requestCacheKey, response.clone()));
    return response;
  }

  try {
    const detailsResponse = await fetch(
      `https://api.wiseoldman.net/v2/competitions/${competitionId}`,
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Ironkin-Website-WOM-Cache"
        }
      }
    );

    const details = await detailsResponse.json().catch(() => ({}));

    if (!detailsResponse.ok) {
      if (storedCache) {
        return jsonResponse({
          ...storedCache,
          cache: {
            ...(storedCache.cache || {}),
            status: "stale",
            warning: details?.message || details?.error || `WOM returned ${detailsResponse.status}`
          }
        }, {
          headers: { "X-Ironkin-WOM-Cache": "stale" }
        });
      }

      return Response.json(
        { error: "Failed to load competition details", details },
        { status: detailsResponse.status }
      );
    }

    const payload = buildStandingsPayload(details, {
      status: "fresh",
      fetchedAt: new Date().toISOString()
    });

    const response = jsonResponse(payload, {
      headers: { "X-Ironkin-WOM-Cache": "fresh" }
    });

    context.waitUntil?.(writeStoredCache(context.env, cacheKey, payload));
    context.waitUntil?.(edgeCache.put(requestCacheKey, response.clone()));

    return response;
  } catch (error) {
    if (storedCache) {
      return jsonResponse({
        ...storedCache,
        cache: {
          ...(storedCache.cache || {}),
          status: "stale",
          warning: error.message || "Could not refresh WOM data"
        }
      }, {
        headers: { "X-Ironkin-WOM-Cache": "stale" }
      });
    }

    return Response.json(
      { error: "Failed to load competition details", details: { message: error.message } },
      { status: 502 }
    );
  }
}
