import { hybridKv } from "../../../_hybridKv.js";
import { syncRecordEmbeds } from "../../../_recordsAutoSync.js";
import { getSession, isStaffSession } from "../../_auth.js";
import {
  buildEventResultsSnapshot,
  postEventResultsToDiscord
} from "../../../_eventResultsAnnouncement.js";

// Winner nomination eligibility is derived from the approved archive snapshot.
// Never infer a Discord account from an unverified Discord display name.
async function syncNominationWinner(env, entry) {
  if (!["botw", "sotw"].includes(entry.type)) return null;
  const kv = hybridKv(env, "drops");
  const key = "events:sotw-botw-nomination-winners:v1";
  const nominationsKey = "events:sotw-botw-nominations:v1";
  const statusKey = "events:sotw-botw-winner-status:v1";
  const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
  const normalize = value => String(value || "").trim().toLowerCase().replace(/[ _-]+/g, " ");
  const rows = (Array.isArray(entry.leaderboard) ? entry.leaderboard : [])
    .filter(row => Number(row?.gained || 0) > 0)
    .sort((a, b) => Number(b.gained || 0) - Number(a.gained || 0));
  let status = { eventId: entry.eventId, archiveRequestId: entry.archiveRequestId, type: entry.type,
    updatedAt: new Date().toISOString(), state: "unresolved", reason: "No positive WOM result." };
  if (rows.length && rows[1] && Number(rows[0].gained) === Number(rows[1].gained)) {
    status.reason = "First-place tie: no single winner can be assigned automatically.";
  } else if (rows.length) {
    status.rsn = rows[0].name;
    const index = parse(await kv.get("member-profiles:index"), []);
    const candidates = [];
    for (const profile of Array.isArray(index) ? index : []) {
      if (!/^\d{17,20}$/.test(String(profile?.discordId || ""))) continue;
      const record = parse(await kv.get(`member-profile:${profile.discordId}`), {});
      const names = [record.rsn, ...(Array.isArray(record.previousRsns) ? record.previousRsns : [])]
        .map(normalize).filter(Boolean);
      if (names.includes(normalize(rows[0].name))) candidates.push(String(profile.discordId));
    }
    if (candidates.length === 1) {
      status = {...status, state: "resolved", discordId: candidates[0], reason: null};
    } else {
      status.reason = candidates.length ? "Multiple member profiles match the winning RSN." : "Winning RSN has no uniquely linked member profile.";
    }
  }
  const [winnersRaw, nominationsRaw, statusesRaw] = await Promise.all([
    kv.get(key), kv.get(nominationsKey), kv.get(statusKey)
  ]);
  const winners = parse(winnersRaw, {});
  const nominations = parse(nominationsRaw, {});
  const statuses = parse(statusesRaw, {});
  // A correction or a new winner must invalidate nominations from the old winner.
  if (winners[entry.type] !== (status.discordId || null)) delete nominations[entry.type];
  winners[entry.type] = status.discordId || null;
  statuses[entry.type] = status;
  await kv.put(key, JSON.stringify(winners));
  await kv.put(nominationsKey, JSON.stringify(nominations));
  await kv.put(statusKey, JSON.stringify(statuses));
  // Best-effort private nomination invitation; a failed DM never blocks results.
  // A new winner receives a single invitation for this finalized event.
  if (status.state === "resolved" && status.discordId && env.DISCORD_BOT_TOKEN) {
    const noticeKey = `events:sotw-botw-winner-notice:${entry.type}:${entry.eventId}`;
    if (!(await kv.get(noticeKey))) {
      try {
        const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
        const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
          method: "POST", headers, body: JSON.stringify({ recipient_id: status.discordId })
        });
        if (!dm.ok) throw Error(`Discord DM channel HTTP ${dm.status}`);
        const channel = await dm.json();
        const site = String(env.SITE_URL || "https://ironkinclan.com").replace(/\/+$/, "");
        const sent = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
          method: "POST", headers,
          body: JSON.stringify({ embeds: [{ title: `🏆 Your next ${entry.type.toUpperCase()} picks`,
            description: `Congratulations! Choose **two** options for the next ${entry.type.toUpperCase()} poll. The third option is selected automatically.\n\n[Submit your two picks](${site}/events.html#ikNominationPanel)`,
            color: 15891968 }], allowed_mentions: { parse: [] } })
        });
        if (!sent.ok) throw Error(`Discord DM message HTTP ${sent.status}`);
        await kv.put(noticeKey, JSON.stringify({ sentAt: new Date().toISOString(), discordId: status.discordId }));
        status.notification = "sent";
      } catch (error) {
        status.notification = "failed";
        status.notificationError = String(error?.message || error).slice(0, 180);
        console.warn("Winner nomination DM failed:", error);
      }
    } else status.notification = "previously_sent";
  }
  return status;
}

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
  return archiveEventInternal({env, body:await request.json()});
}

// Trusted server-side entrypoint for the scheduled cycle; no public route.
// It uses exactly the same validation and archival workflow as the admin route.
export async function archiveEventInternal({env, body}) {
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

  // Resolve the next nomination winner from finalized standings, independently of
  // whether the Discord announcement succeeds. Unmatched/tied winners stay blocked.
  if (event.type === "botw" || event.type === "sotw") {
    try { archiveEntry.nominationWinner = await syncNominationWinner(env, archiveEntry); }
    catch (error) {
      archiveEntry.nominationWinner = {state:"error", reason:String(error?.message || error).slice(0,250)};
      console.error("Automatic winner mapping failed:", error);
    }
    const index = archive.findIndex(item => item.archiveRequestId === archiveRequestId);
    if (index !== -1) archive[index] = archiveEntry;
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
