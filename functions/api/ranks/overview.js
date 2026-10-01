import { hybridKv } from "../../_hybridKv.js";
import { ensureDiscordProfilesSynced, getDiscordProfileSyncMeta } from "../_discordProfiles.js";

const PROFILE_INDEX_KEY = "member-profiles:index";

function safeJsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export async function onRequestGet({ env, context }) {
  // Keep this page lightweight while still refreshing the Discord directory periodically.
  // The current cached directory is returned even if Discord is temporarily unavailable.
  try {
    const syncPromise = ensureDiscordProfilesSynced(env, { ttlMs: 15 * 60 * 1000 });
    if (context?.waitUntil) context.waitUntil(syncPromise);
    else await syncPromise;
  } catch (error) {
    console.warn("Rank overview Discord sync skipped:", error?.message || error);
  }

  const index = safeJsonParse(await hybridKv(env, "drops").get(PROFILE_INDEX_KEY), []);
  const meta = await getDiscordProfileSyncMeta(env);
  const members = Array.isArray(index) ? index.filter(item => item?.discordId) : [];

  const rankMap = new Map();
  for (const member of members) {
    const name = member.staffRank || member.rank || "Member";
    const key = String(name).toLowerCase();
    if (!rankMap.has(key)) {
      rankMap.set(key, {
        name,
        count: 0,
        iconUrl: member.staffRank ? member.staffRankIconUrl : member.rankIconUrl,
        unicodeEmoji: member.staffRank ? member.staffRankUnicodeEmoji : member.rankUnicodeEmoji
      });
    }
    rankMap.get(key).count += 1;
  }

  const ranks = Array.from(rankMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  const recent = members
    .filter(member => member.memberSince && Number.isFinite(new Date(member.memberSince).getTime()))
    .sort((a, b) => new Date(b.memberSince) - new Date(a.memberSince))
    .slice(0, 8)
    .map(member => ({
      displayName: member.displayName || member.username || "Unknown member",
      memberSince: member.memberSince,
      rank: member.staffRank || member.rank || "Member",
      iconUrl: member.staffRank ? member.staffRankIconUrl : member.rankIconUrl,
      unicodeEmoji: member.staffRank ? member.staffRankUnicodeEmoji : member.rankUnicodeEmoji
    }));

  return Response.json({
    memberCount: members.length,
    updatedAt: meta?.syncedAt || null,
    ranks,
    recent
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}
