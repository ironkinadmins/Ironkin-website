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

async function fetchStandingsSnapshot(event) {
  if (!event?.womCompetitionId || event.womCompetitionId === "PUT_YOUR_WOM_ID_HERE") {
    return null;
  }

  const detailsResponse = await fetch(
    `https://api.wiseoldman.net/v2/competitions/${event.womCompetitionId}`
  );

  const details = await detailsResponse.json();

  if (!detailsResponse.ok) {
    return null;
  }

  const standingsResponse = await fetch(
    `https://api.wiseoldman.net/v2/competitions/${event.womCompetitionId}/standings`
  );

  const standings = await standingsResponse.json();

  if (!standingsResponse.ok) {
    return null;
  }

  const rows = Array.isArray(standings)
    ? standings
    : standings.standings || [];

  const normalized = rows
    .map(row => {
      const player =
        row.player?.displayName ||
        row.player?.username ||
        row.player?.name ||
        row.username ||
        row.name ||
        "Unknown";

      const gained =
        row.progress?.gained ||
        row.gained ||
        row.score ||
        0;

      return {
        name: player,
        gained: Number(gained || 0)
      };
    })
    .sort((a, b) => b.gained - a.gained);

  const totalGained = normalized.reduce(
    (sum, player) => sum + Number(player.gained || 0),
    0
  );

  const contributors =
    normalized.filter(player => Number(player.gained || 0) > 0).length;

  return {
    title: details.title || event.title,
    metric: details.metric,
    startsAt: details.startsAt,
    endsAt: details.endsAt,
    totalGained,
    contributors,
    standings: normalized
  };
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

  const topFive =
    standings?.standings
      ?.filter(player => Number(player.gained || 0) > 0)
      .slice(0, 5) || [];

  const winner = topFive[0] || null;
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
        ? { ...item, active: false, featured: false }
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
