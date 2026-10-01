export const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function toBase64Url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8ToBase64Url(value) {
  return toBase64Url(new TextEncoder().encode(value));
}

function base64UrlToUtf8(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signPayload(payload, secret) {
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(signature);
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function createSessionCookie(session, env) {
  // UTF-8 encoding matters here: Discord display names/nicknames can contain
  // emoji and non-Latin characters, which plain btoa(JSON.stringify(...)) cannot encode.
  const payload = utf8ToBase64Url(JSON.stringify(session));
  const signature = await signPayload(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
}

export async function getSession(request, env) {
  const raw = getCookie(request, "ironkin_session");
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;

  try {
    const expected = await signPayload(payload, env.SESSION_SECRET);
    if (!constantTimeEqual(signature, expected)) return null;
    try {
      return JSON.parse(base64UrlToUtf8(payload));
    } catch {
      // Backwards compatibility for sessions created before UTF-8/base64url encoding.
      return JSON.parse(atob(payload));
    }
  } catch {
    return null;
  }
}

export async function createOAuthState(returnTo, env) {
  const safeReturnTo = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo : "/";
  const payload = utf8ToBase64Url(JSON.stringify({
    n: crypto.randomUUID(),
    r: safeReturnTo,
    exp: Date.now() + (10 * 60 * 1000)
  }));
  const signature = await signPayload(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
}

export async function verifyOAuthState(state, env) {
  if (!state) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  try {
    const expected = await signPayload(payload, env.SESSION_SECRET);
    if (!constantTimeEqual(signature, expected)) return null;
    const data = JSON.parse(base64UrlToUtf8(payload));
    if (!data?.exp || Date.now() > data.exp) return null;
    if (typeof data.r !== "string" || !data.r.startsWith("/") || data.r.startsWith("//")) data.r = "/";
    return data;
  } catch {
    return null;
  }
}

export function isStaffSession(session) {
  return Boolean(session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId)));
}
