const DEFAULT_SETTINGS = { showOnEventsPage: true };
export async function onRequestGet({ env }) {
  const raw = await env.DROPS_KV.get("giveaways:settings");
  const saved = raw ? JSON.parse(raw) : {};
  return Response.json({ settings: { ...DEFAULT_SETTINGS, ...saved } });
}
