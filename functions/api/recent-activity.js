export async function onRequestGet() {

  const GROUP_ID = "12095";

  const groupResponse = await fetch(
    `https://api.wiseoldman.net/v2/groups/${GROUP_ID}`
  );

  const groupData = await groupResponse.json();

  if (!groupResponse.ok) {
    return Response.json(
      {
        error: "Failed to load WOM group",
        details: groupData
      },
      {
        status: groupResponse.status
      }
    );
  }

  const members =
    groupData.members ||
    groupData.memberships ||
    [];

const usernames = members
  .map(member =>
    member.player?.displayName ||
    member.player?.username ||
    member.displayName ||
    member.username
  )
  .filter(Boolean)
  .slice(0, 20);

  const achievementResults =
    await Promise.allSettled(

      usernames.map(async username => {

        const response = await fetch(
          `https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}/achievements`
        );

        if (!response.ok) {
          return [];
        }

        const achievements =
          await response.json();

        return achievements.map(achievement => ({

          player: username,

          name:
            achievement.name ||
            achievement.metric ||
            "Achievement unlocked",

          metric: achievement.metric,

          measure: achievement.measure,

          createdAt: achievement.createdAt

        }));

      })

    );

const oneMonthAgo = new Date();

oneMonthAgo.setMonth(
  oneMonthAgo.getMonth() - 1
);

const achievements =
  achievementResults
    .flatMap(result =>
      result.status === "fulfilled"
        ? result.value
        : []
    )

    .filter(item => {

      if (!item.createdAt) return false;

      return (
        new Date(item.createdAt) >=
        oneMonthAgo
      );

    })

    .sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

  return Response.json({

    title: "Recent Achievements",

    updatedAt:
      new Date().toISOString(),

    achievements

  });

}