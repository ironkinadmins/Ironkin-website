import { ensureDiscordProfilesSynced } from "../_discordProfiles.js";

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function onRequestPost({ request, env }) {
  const configured = String(env.DISCORD_PROFILE_SYNC_SECRET || "");
  const provided = String(request.headers.get("X-Ironkin-Sync-Secret") || "");
  if (!configured || !safeEqual(configured, provided)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await ensureDiscordProfilesSynced(env, { force: true });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error?.message || "Could not sync Discord profiles." }, { status: 500 });
  }
}
