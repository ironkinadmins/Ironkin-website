import { getSession, isStaffSession } from "../../_auth.js";
import { ensureDiscordProfilesSynced, getDiscordProfileSyncMeta, getDiscordRankEmblemDiagnostics, saveDiscordRankEmblemMap } from "../../_discordProfiles.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session || !isStaffSession(session)) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  const meta = await getDiscordProfileSyncMeta(env);
  const diagnostics = await getDiscordRankEmblemDiagnostics(env);
  return Response.json({ meta, diagnostics });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session || !isStaffSession(session)) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  try {
    const result = await ensureDiscordProfilesSynced(env, { force: true });
    const diagnostics = await getDiscordRankEmblemDiagnostics(env);
    return Response.json({ success: true, ...result, diagnostics });
  } catch (error) {
    return Response.json({ error: error?.message || "Could not sync Discord member profiles." }, { status: 500 });
  }
}

export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  if (!session || !isStaffSession(session)) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const mappings = await saveDiscordRankEmblemMap(env, body?.mappings || {});
    const sync = await ensureDiscordProfilesSynced(env, { force: true });
    const diagnostics = await getDiscordRankEmblemDiagnostics(env);
    return Response.json({ success: true, mappings, diagnostics, sync });
  } catch (error) {
    return Response.json({ error: error?.message || "Could not save Discord rank emblems." }, { status: 500 });
  }
}
