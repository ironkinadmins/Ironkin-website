import { getSession, isStaffSession } from "../../_auth.js";
import { ensureDiscordProfilesSynced, syncDiscordProfilesBatch, getDiscordProfileSyncMeta, getDiscordRankEmblemDiagnostics, saveDiscordRankEmblemMap } from "../../_discordProfiles.js";

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
    const body = await request.json().catch(() => ({}));
    const offset = Math.max(0, Number(body?.offset || 0));
    const result = await syncDiscordProfilesBatch(env, { offset, batchSize: 15 });
    // Diagnostics are only needed once at the end; avoiding them on every batch saves subrequests.
    const diagnostics = result.done ? await getDiscordRankEmblemDiagnostics(env) : undefined;
    return Response.json({ success: true, ...result, ...(diagnostics ? { diagnostics } : {}) });
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
    const diagnostics = await getDiscordRankEmblemDiagnostics(env);
    // Profile hydration is intentionally not performed in this same Worker invocation.
    // The admin client starts the safe batched sync immediately after this response.
    return Response.json({ success: true, mappings, diagnostics, needsSync: true });
  } catch (error) {
    return Response.json({ error: error?.message || "Could not save Discord rank emblems." }, { status: 500 });
  }
}
