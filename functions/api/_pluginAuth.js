import { hybridKv } from "../_hybridKv.js";
function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function currentMemberProfile(env, discordId) {
  if (!discordId) return null;
  const raw = await hybridKv(env, "drops").get(`member-profile:${discordId}`);
  const profile = safeJsonParse(raw, null);
  return profile && typeof profile === "object" ? profile : null;
}

export async function requirePluginUser(request, env) {
  const apiKey = String(request.headers.get("x-api-key") || "").trim();
  if (!apiKey) {
    return { ok: false, response: jsonError("Missing x-api-key header.", 401) };
  }

  const raw = await hybridKv(env, "drops").get(`plugin-api-key:${apiKey}`);
  if (!raw) {
    return { ok: false, response: jsonError("Invalid API key.", 401) };
  }

  const keyRecord = safeJsonParse(raw, null);
  if (!keyRecord?.discordId) {
    return { ok: false, response: jsonError("Invalid API key.", 401) };
  }

  // The API key authenticates the Discord member, not an RSN snapshot.
  // Always hydrate current profile data so RuneLite integrations keep working
  // after an OSRS name change without requiring the member to rotate their key.
  const profile = await currentMemberProfile(env, keyRecord.discordId);
  const pluginUser = {
    ...keyRecord,
    ...(profile || {}),
    discordId: String(keyRecord.discordId)
  };

  return { ok: true, pluginUser };
}
