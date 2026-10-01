export async function onRequestGet({ request }) {
  try {
    const GROUP_ID = "12095";
    const CACHE_SECONDS = 60 * 60;
    const SAMPLE_MEMBERS = 25;
    const DISPLAY_LIMIT = 20;

    const cache = caches.default;
    const cacheKey = new Request(
      new URL(request.url).origin + "/api/recent-activity-cache-v6-rank-members"
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
      groupData.memberships ||
      groupData.members ||
      [];

    // Rank-page data is derived from the same WOM group request this endpoint
    // already uses, so ranks.html does not need a second WOM request or a new
    // Cloudflare Function. WOM GroupDetails exposes role and join timestamps
    // on each membership.
    const roleCounts = new Map();
    for (const membership of members) {
      const role = String(membership?.role || "member").trim().toLowerCase() || "member";
      roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    }

    const rankBreakdown = Array.from(roleCounts.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));

    // Keep the member names grouped by WOM role so the Ranks page can reveal
    // the roster for a rank without making another network request.
    const rankMembers = {};
    for (const membership of members) {
      const role = String(membership?.role || "member").trim().toLowerCase() || "member";
      const name = membership?.player?.displayName || membership?.player?.username || membership?.displayName || membership?.username;
      if (!name) continue;
      if (!rankMembers[role]) rankMembers[role] = [];
      rankMembers[role].push(String(name));
    }
    for (const role of Object.keys(rankMembers)) {
      rankMembers[role].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    const recentlyJoined = members
      .map(membership => ({
        name: membership?.player?.displayName || membership?.player?.username || membership?.displayName || membership?.username || "Unknown member",
        role: String(membership?.role || "member"),
        joinedAt: membership?.clientSyncJoinedAt || membership?.createdAt || null
      }))
      .filter(member => member.joinedAt)
      .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))
      .slice(0, 8);

    const usernames = members
      .map(member =>
        member.player?.displayName ||
        member.player?.username ||
        member.displayName ||
        member.username
      )
      .filter(Boolean)
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
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, DISPLAY_LIMIT);

    const response = Response.json({
      title: "Recent Achievements",
      updatedAt: new Date().toISOString(),
      cachedFor: `${CACHE_SECONDS} seconds`,
      sampledMembers: usernames.length,
      displayedAchievements: achievements.length,
      achievements,
      memberCount: Number(groupData.memberCount) || members.length,
      groupUpdatedAt: groupData.updatedAt || null,
      rankBreakdown,
      rankMembers,
      recentlyJoined
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