import {
  getWomCacheTtlSeconds,
  getWomCompetitionSnapshot,
  readWomStoredCache
} from "../_womCompetition.js";

function jsonResponse(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": `public, max-age=${getWomCacheTtlSeconds(payload)}`,
      ...(init.headers || {})
    }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const competitionId = String(url.searchParams.get("competitionId") || "").trim();
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!competitionId) {
    return Response.json({ error: "Missing competitionId" }, { status: 400 });
  }

  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.delete("refresh");
  const requestCacheKey = new Request(cacheUrl.toString(), context.request);
  const edgeCache = caches.default;

  if (!forceRefresh) {
    const edgeCached = await edgeCache.match(requestCacheKey);
    if (edgeCached) return edgeCached;
  }

  const storedCache = await readWomStoredCache(context.env, competitionId);
  const now = Date.now();
  const storedFetchedAt = storedCache?.cache?.fetchedAt
    ? new Date(storedCache.cache.fetchedAt).getTime()
    : 0;
  const storedFreshForMs = storedCache ? getWomCacheTtlSeconds(storedCache) * 1000 : 0;

  if (
    !forceRefresh &&
    storedCache &&
    Number.isFinite(storedFetchedAt) &&
    now - storedFetchedAt < storedFreshForMs
  ) {
    const response = jsonResponse({
      ...storedCache,
      cache: { ...(storedCache.cache || {}), status: "kv-fresh" }
    });
    context.waitUntil?.(edgeCache.put(requestCacheKey, response.clone()));
    return response;
  }

  try {
    const payload = await getWomCompetitionSnapshot(context.env, competitionId);

    if (!payload) {
      return Response.json({ error: "Competition not found" }, { status: 404 });
    }

    const cacheStatus = payload?.cache?.status || "fresh";
    const response = jsonResponse(payload, {
      headers: { "X-Ironkin-WOM-Cache": cacheStatus }
    });

    context.waitUntil?.(edgeCache.put(requestCacheKey, response.clone()));
    return response;
  } catch (error) {
    return Response.json(
      { error: "Failed to load competition details", details: { message: error?.message } },
      { status: 502 }
    );
  }
}
