export async function onRequestGet() {
  const GROUP_ID = "12095";

  async function fetchCompetitions(status) {
    const response = await fetch(
      `https://api.wiseoldman.net/v2/competitions?status=${status}&limit=50`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to load ${status} competitions`);
    }

    return data;
  }

  const ongoing = await fetchCompetitions("ongoing");
  const upcoming = await fetchCompetitions("upcoming");

  const competitions = [...ongoing, ...upcoming];

  const activeCompetition = competitions.find(comp =>
    String(comp.groupId) === GROUP_ID &&
    /sotw|botw|clan goal|clan xp|xp push/i.test(comp.title)
  );

  if (!activeCompetition) {
    return Response.json({
      active: false,
      message: "No active or upcoming Ironkin WOM competition found."
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