export async function onRequestGet() {
  const currentResponse = await fetch(
    "https://ironkin-website.pages.dev/api/current-event"
  );

  const currentEvent = await currentResponse.json();

  if (!currentResponse.ok || !currentEvent.active) {
    return Response.json(currentEvent, {
      status: currentResponse.status || 404
    });
  }

  const detailsResponse = await fetch(
    `https://api.wiseoldman.net/v2/competitions/${currentEvent.id}`
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

  const goal =
    currentEvent.type === "clan_goal"
      ? 300
      : 0;

  const percent =
    goal > 0
      ? Math.min((totalGained / goal) * 100, 100)
      : 0;

  return Response.json({
    ...currentEvent,
    goal,
    totalGained,
    percent,
    contributors,
    standings
  });
}