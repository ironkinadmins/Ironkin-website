import { hybridKv } from "../../_hybridKv.js";
const DEFAULT_SETTINGS = { showOnEventsPage: true };
export async function onRequestGet({ env }) {
  const raw = await hybridKv(env, "drops").get("giveaways:settings");
  const saved = raw ? JSON.parse(raw) : {};
  return Response.json({ settings: { ...DEFAULT_SETTINGS, ...saved } });
}
