const WOM_BASE = "https://api.wiseoldman.net/v2";
const DEFAULT_USER_AGENT = "Ironkin Clan Event";

export function womUrl(path) {
  const value = String(path || "");
  if (/^https:\/\//i.test(value)) return value;
  return `${WOM_BASE}${value.startsWith("/") ? value : `/${value}`}`;
}

export function womHeaders(env, headers = {}, userAgent = DEFAULT_USER_AGENT) {
  const merged = new Headers(headers || {});
  if (!merged.has("Accept")) merged.set("Accept", "application/json");
  if (!merged.has("User-Agent")) merged.set("User-Agent", userAgent);
  const key = String(env?.WOM_API_KEY || "").trim();
  if (key) merged.set("x-api-key", key);
  return merged;
}

// Cloudflare cache provides best-effort cooldown sharing between Pages isolates.
// It is not an atomic global quota; the coordinator maintains its own safety lock.
const COOLDOWN_URL = "https://ironkin.internal/wom-cooldown-v1";
function retrySeconds(response) {
  const raw = response.headers.get("Retry-After");
  const numeric = Number(raw);
  if (raw && Number.isFinite(numeric) && numeric >= 0) return Math.max(30, Math.min(3600, Math.ceil(numeric)));
  const date = Date.parse(raw || "");
  if (Number.isFinite(date)) return Math.max(30, Math.min(3600, Math.ceil((date-Date.now())/1000)));
  return 300;
}
export async function womFetch(env, path, init = {}, userAgent = DEFAULT_USER_AGENT) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    try {
      const stored = await cache.match(COOLDOWN_URL);
      if (stored) {
        const until = Number(await stored.text());
        if (until > Date.now()) {
          const seconds = Math.ceil((until-Date.now())/1000);
          return Response.json({error:"WOM requests temporarily paused after rate limiting",retryAfterSeconds:seconds},
            {status:429,headers:{"Retry-After":String(seconds),"X-Ironkin-WOM-Cooldown":"1"}});
        }
      }
    } catch { /* Never break normal WOM reads if the cache is unavailable. */ }
  }
  const response = await fetch(womUrl(path), {...init, headers:womHeaders(env,init.headers,userAgent)});
  if (response.status === 429 && cache) {
    const seconds = retrySeconds(response);
    try {
      await cache.put(COOLDOWN_URL, new Response(String(Date.now()+seconds*1000),
        {headers:{"Cache-Control":`public, max-age=${seconds}`}}));
    } catch { /* Best-effort protection. */ }
  }
  return response;
}
