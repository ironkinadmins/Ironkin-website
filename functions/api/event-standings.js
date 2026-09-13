import {
  getWomCacheTtlSeconds,
  combineWomCompetitionSnapshots,
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
  const competitionIds = String(url.searchParams.get("competitionIds") || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (competitionId && !competitionIds.includes(competitionId)) competitionIds.unshift(competitionId);
  const uniqueCompetitionIds = [...new Set(competitionIds)];
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!uniqueCompetitionIds.length) {
    return Response.json({ error: "Missing competitionId" }, { status: 400 });
  }

  if (uniqueCompetitionIds.length > 1) {
    try {
      const snapshots = await Promise.all(uniqueCompetitionIds.map(id => getWomCompetitionSnapshot(context.env, id)));
      const payload = combineWomCompetitionSnapshots(snapshots);
      return jsonResponse(payload || { error: "Competition not found" });
    } catch (error) {
      return Response.json({ error: "Failed to load combined competition details", details: { message: error?.message } }, { status: 502 });
    }
  }

  const singleCompetitionId = uniqueCompetitionIds[0];

  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.delete("refresh");
  const requestCacheKey = new Request(cacheUrl.toString(), context.request);
  const edgeCache = caches.default;

  if (!forceRefresh) {
    const edgeCached = await edgeCache.match(requestCacheKey);
    if (edgeCached) return edgeCached;
  }

  const storedCache = await readWomStoredCache(context.env, singleCompetitionId);
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
    const payload = await getWomCompetitionSnapshot(context.env, singleCompetitionId);

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
