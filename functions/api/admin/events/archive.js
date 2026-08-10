import { getSession, isStaffSession } from "../../_auth.js";
import { readDropsWithClanGoalFallback } from "../../drops/_dropKeys.js";
import {
  getWomCompetitionSnapshot,
  normalizeWomStandingsRows
} from "../../../_womCompetition.js";

function hasWomCompetition(event) {
  const id = String(event?.womCompetitionId || "").trim();
  return Boolean(id && id !== "PUT_YOUR_WOM_ID_HERE");
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const event = body.event;
  const events = Array.isArray(body.events) ? body.events : null;

  if (!event || !event.id) {
    return Response.json(
      { error: "Missing event to archive." },
      { status: 400 }
    );
  }

  let standings = null;

  if (hasWomCompetition(event)) {
    try {
      // Request the newest final leaderboard from WOM. If WOM is temporarily
      // unavailable or returns an empty response, the shared helper falls back
      // to the last known-good standings cached by the live event page.
      standings = await getWomCompetitionSnapshot(env, event.womCompetitionId);
    } catch (error) {
      return Response.json(
        {
          error: "Could not archive this WOM event because its final standings could not be loaded.",
          details: error?.message || "Wise Old Man is temporarily unavailable. Please try again."
        },
        { status: 503 }
      );
    }

    if (!Array.isArray(standings?.standings) || !standings.standings.length) {
      return Response.json(
        {
          error: "Could not archive this WOM event because no leaderboard snapshot is available.",
          details: "Refresh the event standings and try End Event + Send to Archive again."
        },
        { status: 409 }
      );
    }
  }
  const dropsResult = await readDropsWithClanGoalFallback(env, event, { isClanGoal: String(event?.type || "").includes("clan-goal") });
  const drops = dropsResult.drops || [];

  const standingsRows =
    standings?.standings?.length
      ? standings.standings
      : Array.isArray(event.leaderboard)
        ? event.leaderboard
        : Array.isArray(event.topFive)
          ? event.topFive
          : [];

  const normalizedRows = normalizeWomStandingsRows(standingsRows);
  const topFive = normalizedRows
    .filter(player => Number(player.gained || 0) > 0)
    .slice(0, 5);

  const winner = topFive[0] || event.winner || null;
  const endedAt = new Date().toISOString();

  const archiveEntry = {
    id: `archive-${event.id}-${Date.now()}`,
    eventId: event.id,
    type: event.type,
    label: event.label,
    title: standings?.title || event.title,
    description: event.description || "",
    womCompetitionId: event.womCompetitionId || null,
    target: event.target || null,
    startDate: standings?.startsAt || event.startDate || null,
    endDate: standings?.endsAt || event.endDate || null,
    endedAt,
    metric: standings?.metric || null,
    totalGained: Number(standings?.totalGained ?? event.totalGained ?? 0),
    contributors: Number(standings?.contributors ?? event.contributors ?? 0),
    winner,
    topFive,
    // Preserve the complete final leaderboard, not only the top five. This makes
    // the archive a true snapshot and gives us enough data for future displays.
    leaderboard: normalizedRows,
    ...(event?.type === "bounties" || event?.id === "bounties"
      ? {}
      : { rewards: event.rewards || { placement: [], participation: [] } }),
    drops
  };

  const archiveValue = await env.DROPS_KV.get("events:archive");
  const archive = archiveValue ? JSON.parse(archiveValue) : [];

  archive.unshift(archiveEntry);

  await env.DROPS_KV.put(
    "events:archive",
    JSON.stringify(archive)
  );

  if (events) {
    const getResetEventTitle = item => {
      if (item?.type === "sotw") return "Skill of the Week";
      if (item?.type === "botw") return "Boss of the Week";
      if (String(item?.type || "").includes("clan-goal")) return "Clan Goal";
      return item?.label || item?.title || "Event";
    };

    const updatedEvents = events.map(item =>
      item.id === event.id
        ? {
            ...item,
            title: getResetEventTitle(item),
            description: "",
            womCompetitionId: null,
            target: null,
            startDate: null,
            endDate: null,
            active: false,
            featured: false,
            dropsEnabled: false
          }
        : item
    );

    const sanitizedEvents = updatedEvents.map(item => {
      if (item?.type !== "bounties" && item?.id !== "bounties") return item;
      const sanitized = { ...item };
      delete sanitized.rewards;
      return sanitized;
    });

    await env.DROPS_KV.put(
      "events:active",
      JSON.stringify(sanitizedEvents)
    );
  }

  return Response.json({
    success: true,
    archiveEntry
  });
}
