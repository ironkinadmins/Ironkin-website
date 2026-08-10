function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

async function readPluginUser(env, apiKey) {
  const raw = await env.DROPS_KV.get(`plugin-api-key:${apiKey}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function isPluginApiPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/, "") || "/";

  if (normalized === "/events/item-list") return true;

  return /^\/events\/[^/]+\/submissions$/i.test(normalized);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // /events is also the public Events page. Only require a plugin API key
  // for the actual RuneLite API routes under this folder.
  if (!isPluginApiPath(url.pathname)) {
    return context.next();
  }

  const apiKey = String(context.request.headers.get("x-api-key") || "").trim();
  if (!apiKey) return jsonError("Missing x-api-key header.", 401);

  const pluginUser = await readPluginUser(context.env, apiKey);
  if (!pluginUser?.discordId) return jsonError("Invalid API key.", 401);

  context.data.pluginUser = pluginUser;
  return context.next();
}
