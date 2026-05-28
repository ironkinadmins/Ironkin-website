export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const competitionId = url.searchParams.get("competitionId");

  if (!competitionId) {
    return Response.json(
      { error: "Missing competitionId" },
      { status: 400 }
    );
  }

  const detailsResponse = await fetch(
    `https://api.wiseoldman.net/v2/competitions/${competitionId}`
  );

  const details = await detailsResponse.json();

  if (!detailsResponse.ok) {
    return Response.json(
      { error: "Failed to load competition details", details },
      { status: detailsResponse.status }
    );
  }

  const standings = (details.participations || [])
    .map(entry => ({
      name: entry.player?.displayName || entry.player?.username || "Unknown",
      gained: entry.progress?.gained || 0,
      start: entry.progress?.start || 0,
      end: entry.progress?.end || 0,
      updatedAt: entry.updatedAt
    }))
    .sort((a, b) => b.gained - a.gained);

  const totalGained = standings.reduce(
    (sum, player) => sum + player.gained,
    0
  );

  const contributors = standings.filter(player => player.gained > 0).length;

  return Response.json({
    active: true,
    id: details.id,
    title: details.title,
    metric: details.metric,
    startsAt: details.startsAt,
    endsAt: details.endsAt,
    participantCount: details.participations?.length || 0,
    totalGained,
    contributors,
    standings
  });
}