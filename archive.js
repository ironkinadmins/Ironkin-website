const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);

  if (!match) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

function isStaff(request) {
  const session = getSession(request);

  return session?.roles?.some(roleId =>
    STAFF_ROLE_IDS.includes(roleId)
  );
}

function normalizePlayerName(player) {
  return (
    player?.displayName ||
    player?.username ||
    player?.name ||
    player?.player?.displayName ||
    player?.player?.username ||
    player?.player?.name ||
    player?.rsn ||
    player?.user ||
    "Unknown"
  );
}

function normalizeGained(row) {
  const raw =
    row?.progress?.gained ??
    row?.gained ??
    row?.score ??
    row?.value ??
    0;

  return Number(raw || 0);
}

function normalizeStandingsRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      name: normalizePlayerName(row),
      gained: normalizeGained(row),
      start: Number(row?.progress?.start ?? row?.start ?? 0),
      end: Number(row?.progress?.end ?? row?.end ?? 0),
      updatedAt: row?.updatedAt || null
    }))
    .filter(player => player.name && player.name !== "Unknown")
    .sort((a, b) => Number(b.gained || 0) - Number(a.gained || 0));
}


function getResetTitle(event) {
  if (event?.type === "sotw") return "Skill of the Week";
  if (event?.type === "botw") return "Boss of the Week";
  if (String(event?.type || "").includes("clan-goal")) return "Clan Goal";
  return event?.label || event?.title || "Event";
}

function resetEventAfterArchive(event) {
  return {
    ...event,
    title: getResetTitle(event),
    description: "",
    womCompetitionId: null,
    active: false,
    featured: false,
    target: null,
    startDate: null,
    endDate: null
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed: ${response.status}`);
  }

  return data;
}

async function fetchStandingsSnapshot(event) {
  if (!event?.womCompetitionId || event.womCompetitionId === "PUT_YOUR_WOM_ID_HERE") {
    return null;
  }

  try {
    const details = await fetchJson(
      `https://api.wiseoldman.net/v2/competitions/${event.womCompetitionId}`
    );

    // Wise Old Man competition details already include participations. This is the
    // most reliable source and matches the live dashboard endpoint.
    let normalized = normalizeStandingsRows(details.participations || []);

    // Fallback for older/different WOM responses where standings are separate.
    if (!normalized.length) {
      try {
        const standings = await fetchJson(
          `https://api.wiseoldman.net/v2/competitions/${event.womCompetitionId}/standings`
        );

        const rows = Array.isArray(standings)
          ? standings
          : standings?.standings || standings?.results || [];

        normalized = normalizeStandingsRows(rows);
      } catch (error) {
        // Keep the archive working even if the fallback endpoint is unavailable.
      }
    }

    const totalGained = normalized.reduce(
      (sum, player) => sum + Number(player.gained || 0),
      0
    );

    const contributors = normalized.filter(player => Number(player.gained || 0) > 0).length;

    return {
      title: details.title || event.title,
      metric: details.metric || event.metric || null,
      startsAt: details.startsAt || event.startDate || null,
      endsAt: details.endsAt || event.endDate || null,
      totalGained,
      contributors,
      standings: normalized
    };
  } catch (error) {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  if (!isStaff(request)) {
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

  const standings = await fetchStandingsSnapshot(event);
  const dropsValue = await env.DROPS_KV.get(`drops:${event.id}`);
  const drops = dropsValue ? JSON.parse(dropsValue) : [];

  const standingsRows =
    standings?.standings?.length
      ? standings.standings
      : Array.isArray(event.leaderboard)
        ? event.leaderboard
        : Array.isArray(event.topFive)
          ? event.topFive
          : [];

  const topFive = normalizeStandingsRows(standingsRows)
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
    totalGained: standings?.totalGained || 0,
    contributors: standings?.contributors || 0,
    winner,
    topFive,
    leaderboard: topFive,
    rewards: event.rewards || { placement: [], participation: [] },
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
    const updatedEvents = events.map(item =>
      item.id === event.id
        ? resetEventAfterArchive(item)
        : item
    );

    await env.DROPS_KV.put(
      "events:active",
      JSON.stringify(updatedEvents)
    );
  }

  return Response.json({
    success: true,
    archiveEntry
  });
}
