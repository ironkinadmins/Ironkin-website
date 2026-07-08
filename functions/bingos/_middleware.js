function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function cleanApiKey(value) {
  return String(value || "").trim();
}

async function readPluginUser(env, apiKey) {
  const raw = await env.DROPS_KV.get(`plugin-api-key:${apiKey}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const apiKey = cleanApiKey(context.request.headers.get("x-api-key"));

  if (!apiKey) {
    return jsonError("Missing x-api-key header.", 401);
  }

  const pluginUser = await readPluginUser(context.env, apiKey);

  if (!pluginUser?.discordId) {
    return jsonError("Invalid API key.", 401);
  }

  context.data.pluginUser = pluginUser;
  return context.next();
}
