import { hybridKv } from "../../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../../_auth.js";
import { postEventResultsToDiscord } from "../../../../_eventResultsAnnouncement.js";

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({ error: "Staff only." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const archiveId = String(body?.archiveId || "").trim();
  if (!archiveId) return Response.json({ error: "Missing archive ID." }, { status: 400 });

  const raw = await hybridKv(env, "drops").get("events:archive");
  let archive = [];
  try { archive = raw ? JSON.parse(raw) : []; } catch { archive = []; }
  const index = Array.isArray(archive) ? archive.findIndex(item => item?.id === archiveId) : -1;
  if (index < 0) return Response.json({ error: "Archive entry not found." }, { status: 404 });

  const entry = archive[index];
  if (entry?.resultsAnnouncement?.status === "posted" && entry?.resultsAnnouncement?.messageId) {
    return Response.json({ success: true, announcement: entry.resultsAnnouncement, alreadyPosted: true });
  }

  try {
    const posted = await postEventResultsToDiscord(env, entry);
    entry.resultsAnnouncement = {
      ...(entry.resultsAnnouncement || {}),
      enabled: true,
      status: "posted",
      channelId: posted.channelId,
      messageId: posted.messageId,
      postedAt: posted.postedAt,
      error: null
    };
    archive[index] = entry;
    await hybridKv(env, "drops").put("events:archive", JSON.stringify(archive));
    return Response.json({ success: true, announcement: entry.resultsAnnouncement });
  } catch (error) {
    entry.resultsAnnouncement = {
      ...(entry.resultsAnnouncement || {}),
      status: "failed",
      error: error?.message || "Discord publishing failed."
    };
    archive[index] = entry;
    await hybridKv(env, "drops").put("events:archive", JSON.stringify(archive));
    return Response.json({ error: "Discord publishing failed.", details: entry.resultsAnnouncement.error, announcement: entry.resultsAnnouncement }, { status: 502 });
  }
}
