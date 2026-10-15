import { hybridKv } from "../../../_hybridKv.js";
import { syncRecordEmbeds } from "../../../_recordsAutoSync.js";
import { getSession, isStaffSession } from "../../_auth.js";
import {
  buildEventResultsSnapshot,
  postEventResultsToDiscord
} from "../../../_eventResultsAnnouncement.js";

function hasWomCompetition(event) {
  const ids = [
    event?.womCompetitionId,
    ...(Array.isArray(event?.womCompetitionIds) ? event.womCompetitionIds : []),
    ...(Array.isArray(event?.womCompetitions) ? event.womCompetitions.map(item => item?.competitionId || item?.womCompetitionId) : [])
  ].map(value => String(value || "").trim()).filter(value => value && value !== "PUT_YOUR_WOM_ID_HERE");
  return ids.length > 0;
}

function wantsAutomaticResults(event, body) {
  if (body?.postResults === false) return false;
  return event?.resultsAnnouncement?.enabled !== false;
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json();
  const event = body.event;
  const events = Array.isArray(body.events) ? body.events : null;
  const archiveRequestId = String(body.archiveRequestId || "").trim() || crypto.randomUUID();
  const approvedResultsContent = String(body.resultsContent || "").trim();

  if (!event || !event.id) {
    return Response.json({ error: "Missing event to archive." }, { status: 400 });
  }
  if (wantsAutomaticResults(event, body) && !approvedResultsContent) {
    return Response.json({ error: "Generate and approve the results post before publishing." }, { status: 400 });
  }
  if (approvedResultsContent.length > 1950) {
    return Response.json({ error: "The approved results post is too long.", details: `${approvedResultsContent.length}/1950 characters.` }, { status: 400 });
  }

  const archiveValue = await hybridKv(env, "drops").get("events:archive");
  const archive = archiveValue ? JSON.parse(archiveValue) : [];
  const existing = Array.isArray(archive) ? archive.find(item => item?.archiveRequestId === archiveRequestId) : null;
  if (existing) {
    return Response.json({ success: true, archiveEntry: existing, idempotent: true, announcement: existing.resultsAnnouncement || null });
  }

  // The request ID handles retries of one request. This additional guard also
  // blocks a second click/new request ID for the same finished WOM competition.
  const womId = String(event.womCompetitionId || "").trim();
  if (womId && Array.isArray(archive)) {
    const duplicate = archive.find(item =>
      String(item?.eventId || "") === String(event.id) &&
      String(item?.womCompetitionId || "").trim() === womId &&
      String(item?.endDate || "") === String(event.endDate || ""));
    if (duplicate) {
      return Response.json({
        success: true, archiveEntry: duplicate, idempotent: true,
        announcement: duplicate.resultsAnnouncement || null,
        warning: "This WOM competition has already been archived."
      });
    }
  }

  let snapshot;
  try {
    snapshot = await buildEventResultsSnapshot(env, event);
  } catch (error) {
    return Response.json({
      error: hasWomCompetition(event)
        ? "Could not archive this WOM event because its final standings could not be loaded."
        : "Could not build the final event snapshot.",
      details: error?.message || "Please try again."
    }, { status: 503 });
  }

  if (hasWomCompetition(event) && (!Array.isArray(snapshot?.leaderboard) || !snapshot.leaderboard.length)) {
    return Response.json({
      error: "Could not archive this WOM event because no leaderboard snapshot is available.",
      details: "Refresh the event standings and try End Event + Publish Results again."
    }, { status: 409 });
  }

  // Preserve the configured item catalog, not only the results snapshot.
  // The latter may omit unclaimed items, making old event templates incomplete.
  let configuredDrops = [];
  try {
    const stored = await hybridKv(env, "drops").get(`drops:${event.id}`);
    const parsed = stored ? JSON.parse(stored) : [];
    configuredDrops = Array.isArray(parsed) ? parsed.map(item => ({
      name: String(item?.name || ""),
      itemId: Number(item?.itemId || 0),
      image: String(item?.image || ""),
      wikiUrl: String(item?.wikiUrl || ""),
      rewardEmbers: Math.max(0, Number(item?.rewardEmbers || 0)),
      trackingRule: String(item?.trackingRule || "repeatable"),
      boss: String(item?.boss || "")
    })).filter(item => item.name) : [];
  } catch { configuredDrops = []; }

  const endedAt = new Date().toISOString();
  const archiveEntry = {
    id: `archive-${event.id}-${Date.now()}`,
    archiveRequestId,
    eventId: event.id,
    type: event.type,
    label: event.label,
    title: snapshot.title,
    description: event.description || "",
    womCompetitionId: event.womCompetitionId || null,
    womCompetitionIds: Array.isArray(event.womCompetitionIds) ? event.womCompetitionIds : [],
    womCompetitions: Array.isArray(event.womCompetitions) ? event.womCompetitions : [],
    combinedMetric: event.combinedMetric || null,
    botwTier: event.botwTier || null,
    target: event.target || null,
    milestones: Array.isArray(event.milestones) ? event.milestones : [],
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    endedAt,
    metric: snapshot.metric,
    totalGained: Number(snapshot.totalGained || 0),
    contributors: Number(snapshot.contributors || 0),
    participantCount: Number(snapshot.participantCount || snapshot.contributors || 0),
    winner: snapshot.winner,
    topFive: snapshot.topFive,
    leaderboard: snapshot.leaderboard,
    ...(event?.type === "bounties" || event?.id === "bounties" ? {} : { rewards: event.rewards || { placement: [], participation: [] } }),
    drops: snapshot.drops || [],
    configuredDrops,
    templateVersion: 1,
    template: {
      type: event.type,
      botwTier: event.botwTier || null,
      description: event.description || "",
      rewards: event.type === "bounties" || event.id === "bounties" ? null : (event.rewards || null),
      milestones: Array.isArray(event.milestones) ? event.milestones : [],
      target: event.target || null,
      configuredDrops
    },
    ...(snapshot.bountyStats ? { bountyStats: snapshot.bountyStats } : {}),
    resultsAnnouncement: {
      enabled: wantsAutomaticResults(event, body),
      channelId: String(event?.resultsAnnouncement?.channelId || "").trim() || null,
      status: wantsAutomaticResults(event, body) ? "pending" : "skipped",
      messageId: null,
      postedAt: null,
      content: approvedResultsContent || null,
      source: approvedResultsContent ? "approved-editor" : null,
      error: null
    }
  };

  archive.unshift(archiveEntry);
  await hybridKv(env, "drops").put("events:archive", JSON.stringify(archive));

  if (wantsAutomaticResults(event, body)) {
    try {
      const posted = await postEventResultsToDiscord(env, archiveEntry, approvedResultsContent);
      archiveEntry.resultsAnnouncement = {
        ...archiveEntry.resultsAnnouncement,
        status: "posted",
        channelId: posted.channelId,
        messageId: posted.messageId,
        postedAt: posted.postedAt,
        error: null
      };
    } catch (error) {
      archiveEntry.resultsAnnouncement = {
        ...archiveEntry.resultsAnnouncement,
        status: "failed",
        error: error?.message || "Discord publishing failed."
      };
    }
    archive[0] = archiveEntry;
    await hybridKv(env, "drops").put("events:archive", JSON.stringify(archive));
  }

  // Archive is already committed: Discord failures must never roll back the event.
  // Only the affected competition category is republished.
  if (event.type === "sotw" || event.type === "botw") {
    try {
      const synced = await syncRecordEmbeds(env, archive, [event.type]);
      archiveEntry.recordsSync = { status: "synced", at: new Date().toISOString(), results: synced };
    } catch (error) {
      archiveEntry.recordsSync = { status: "failed", error: String(error?.message || error).slice(0, 250) };
    }
    const index = archive.findIndex(item => item.archiveRequestId === archiveRequestId);
    if (index !== -1) archive[index] = archiveEntry;
    await hybridKv(env, "drops").put("events:archive", JSON.stringify(archive));
  }

  if (events) {
    const getResetEventTitle = item => {
      if (item?.type === "sotw") return "Skill of the Week";
      if (item?.type === "botw") return "Boss of the Week";
      if (String(item?.type || "").includes("clan-goal")) return "Clan Goal";
      return item?.label || item?.title || "Event";
    };

    const updatedEvents = events.map(item => item.id === event.id ? {
      ...item,
      title: getResetEventTitle(item),
      description: "",
      womCompetitionId: null,
      womCompetitionIds: [],
      womCompetitions: [],
      combinedMetric: null,
      eventPassword: null,
      target: null,
      startDate: null,
      endDate: null,
      active: false,
      featured: false,
      dropsEnabled: false
    } : item);

    const sanitizedEvents = updatedEvents.map(item => {
      if (item?.type !== "bounties" && item?.id !== "bounties") return item;
      const sanitized = { ...item };
      delete sanitized.rewards;
      return sanitized;
    });

    await hybridKv(env, "drops").put("events:active", JSON.stringify(sanitizedEvents));
  }

  try {
    const auditKv = hybridKv(env, "drops");
    const logRaw = await auditKv.get("admin:audit:v1");
    const log = logRaw ? JSON.parse(logRaw) : [];
    const next = Array.isArray(log) ? log : [];
    next.unshift({ id: crypto.randomUUID(), at: endedAt, action: "event.archived", eventId: event.id,
      summary: `Archived ${String(event.title || event.label || event.id).slice(0, 120)}`,
      requestId: archiveRequestId, resultStatus: archiveEntry.resultsAnnouncement?.status || "skipped" });
    await auditKv.put("admin:audit:v1", JSON.stringify(next.slice(0, 250)));
  } catch (error) { console.warn("Audit write failed:", error); }
  return Response.json({ success: true, archiveEntry, announcement: archiveEntry.resultsAnnouncement, recordsSync: archiveEntry.recordsSync || null });
}
