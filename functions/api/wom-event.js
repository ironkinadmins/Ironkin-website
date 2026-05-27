export async function onRequestGet() {
  const GROUP_ID = "12095";
  const METRIC = "woodcutting";
  const GOAL_XP = 1000000000;

  const START_DATE = "2026-01-01T00:00:00.000Z";
  const END_DATE = new Date().toISOString();

  const url =
    `https://api.wiseoldman.net/v2/groups/${GROUP_ID}/gained` +
    `?metric=${METRIC}` +
    `&startDate=${START_DATE}` +
    `&endDate=${END_DATE}` +
    `&limit=500`;

  try {
    const response = await fetch(url);

    const gains = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error: "Wise Old Man API failed",
          details: gains
        },
        { status: response.status }
      );
    }

    const totalGained = gains.reduce((sum, entry) => {
      return (
        sum +
        (
          entry.data?.skills?.[METRIC]?.experience?.gained || 0
        )
      );
    }, 0);

    const topContributors = gains
      .map(entry => ({
        name: entry.player.displayName,
        gained:
          entry.data?.skills?.[METRIC]?.experience?.gained || 0
      }))
      .filter(player => player.gained > 0)
      .sort((a, b) => b.gained - a.gained)
      .slice(0, 10);

    return Response.json({
      eventName: "Ironkin Clan XP Push",
      metric: METRIC,
      goalXp: GOAL_XP,
      totalGained,
      percent:
        Math.min(
          (totalGained / GOAL_XP) * 100,
          100
        ),
      startDate: START_DATE,
      updatedAt: new Date().toISOString(),
      topContributors
    });

  } catch (error) {

    return Response.json(
      {
        error: "Function crashed",
        details: error.message
      },
      { status: 500 }
    );
  }
}
