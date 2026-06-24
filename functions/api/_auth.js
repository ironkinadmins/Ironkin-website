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
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signPayload(payload, secret) {
  if (!secret) throw new Error("SESSION_SECRET is not configured.");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return toBase64Url(signature);
}

function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function createSessionCookie(session, env) {
  const payload = btoa(JSON.stringify(session));
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
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function isStaffSession(session) {
  return Boolean(
    session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId))
  );
}
