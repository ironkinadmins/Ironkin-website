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

export function womFetch(env, path, init = {}, userAgent = DEFAULT_USER_AGENT) {
  return fetch(womUrl(path), {
    ...init,
    headers: womHeaders(env, init.headers, userAgent)
  });
}
