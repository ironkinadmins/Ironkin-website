export async function onRequestGet() {
  const GROUP_ID = "12095";

  const response = await fetch(
    `https://api.wiseoldman.net/v2/competitions?status=ongoing&limit=50`
  );

  const competitions = await response.json();

  if (!response.ok) {
    return Response.json(
      { error: "Failed to load WOM competitions", details: competitions },
      { status: response.status }
    );
  }

  const activeCompetition = competitions.find(comp =>
    String(comp.groupId) === GROUP_ID &&
    /sotw|botw|clan goal|clan xp|xp push/i.test(comp.title)
  );

  if (!activeCompetition) {
    return Response.json({
      active: false,
      message: "No active Ironkin WOM competition found."
    });
  }

  const title = activeCompetition.title || "";

  let eventType = "competition";

  if (/sotw/i.test(title)) eventType = "sotw";
  if (/botw/i.test(title)) eventType = "botw";
  if (/clan goal|clan xp|xp push/i.test(title)) eventType = "clan_goal";

  return Response.json({
    active: true,
    id: activeCompetition.id,
    title: activeCompetition.title,
    type: eventType,
    metric: activeCompetition.metric,
    startsAt: activeCompetition.startsAt,
    endsAt: activeCompetition.endsAt,
    participantCount: activeCompetition.participantCount || 0
  });
}