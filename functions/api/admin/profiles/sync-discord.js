import { getSession, isStaffSession } from "../../_auth.js";
import { ensureDiscordProfilesSynced, getDiscordProfileSyncMeta } from "../../_discordProfiles.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session || !isStaffSession(session)) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  const meta = await getDiscordProfileSyncMeta(env);
  return Response.json({ meta });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session || !isStaffSession(session)) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  try {
    const result = await ensureDiscordProfilesSynced(env, { force: true });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error?.message || "Could not sync Discord member profiles." }, { status: 500 });
  }
}
