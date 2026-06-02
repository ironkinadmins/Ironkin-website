export async function onRequestGet({ request }) {
  try {
    const GROUP_ID = "12095";
    const CACHE_SECONDS = 60 * 60;
    const SAMPLE_MEMBERS = 25;
    const DISPLAY_LIMIT = 20;

    const cache = caches.default;
    const cacheKey = new Request(
      new URL(request.url).origin + "/api/recent-activity-cache-v3"
    );

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

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
        { status: groupResponse.status }
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
      .sort(() => Math.random() - 0.5)
      .slice(0, SAMPLE_MEMBERS);

    const achievementResults = await Promise.allSettled(
      usernames.map(async username => {
        try {
          const response = await fetch(
            `https://api.wiseoldman.net/v2/players/${encodeURIComponent(username)}/achievements`
          );

          if (!response.ok) return [];

          const achievements = await response.json();

          if (!Array.isArray(achievements)) return [];

          return achievements.map(achievement => ({
            player: username,
            name: achievement.name || achievement.metric || "Achievement unlocked",
            metric: achievement.metric || null,
            measure: achievement.measure || null,
            createdAt: achievement.createdAt || null
          }));
        } catch {
          return [];
        }
      })
    );

    const achievements = achievementResults
      .flatMap(result =>
        result.status === "fulfilled" ? result.value : []
      )
      .filter(item =>
        item.createdAt &&
        new Date(item.createdAt) >= cutoff
      )
      .sort(() => Math.random() - 0.5)
      .slice(0, DISPLAY_LIMIT);

    const response = Response.json({
      title: "Recent Achievements",
      updatedAt: new Date().toISOString(),
      cachedFor: `${CACHE_SECONDS} seconds`,
      sampledMembers: usernames.length,
      displayedAchievements: achievements.length,
      achievements
    });

    response.headers.set(
      "Cache-Control",
      `public, max-age=${CACHE_SECONDS}`
    );

    await cache.put(cacheKey, response.clone());

    return response;
  } catch (error) {
    return Response.json(
      {
        error: "Recent activity function crashed",
        message: error.message
      },
      { status: 500 }
    );
  }
}