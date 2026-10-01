import { hybridKv } from "../_hybridKv.js";
function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
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

  let pluginUser = null;
  try {
    pluginUser = JSON.parse(raw);
  } catch {
    pluginUser = null;
  }

  if (!pluginUser?.discordId) {
    return { ok: false, response: jsonError("Invalid API key.", 401) };
  }

  return { ok: true, pluginUser };
}
