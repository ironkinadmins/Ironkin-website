import { hybridKv } from "../../_hybridKv.js";

const PROFILE_INDEX_KEY = "member-profiles:index";
const PROFILE_SYNC_META_KEY = "member-profiles:discord-sync-meta";

function safeJsonParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

const RANK_ORDER = [
  "Owner", "Deputy Owner", "General", "Moderator", "Vanguard", "Nurse",
  "Raider", "Maxed", "Sapphire", "Carry", "TzKal", "TzTok", "Legend",
  "Sage", "Cadet", "Sergeant", "Novice", "Corporal", "Recruit"
];

export async function onRequestGet({ env }) {
  try {
    // IMPORTANT: this public page only reads the already-cached Discord directory.
    // Discord syncing is handled by the site's existing profile sync flow. Triggering a
    // full guild sync here can make a normal page request hang for a long time.
    const kv = hybridKv(env, "drops");
    const [indexRaw, metaRaw] = await Promise.all([
      kv.get(PROFILE_INDEX_KEY),
      kv.get(PROFILE_SYNC_META_KEY)
    ]);

    const index = safeJsonParse(indexRaw, []);
    const meta = safeJsonParse(metaRaw, null);
    const members = Array.isArray(index) ? index.filter(item => item?.discordId) : [];

    const rankMap = new Map();
    for (const member of members) {
      // Staff rank takes priority because that is the visible Discord rank for staff.
      const name = String(member.staffRank || member.rank || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
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

    const order = new Map(RANK_ORDER.map((name, i) => [name.toLowerCase(), i]));
    const ranks = Array.from(rankMap.values()).sort((a, b) => {
      const ai = order.has(a.name.toLowerCase()) ? order.get(a.name.toLowerCase()) : 999;
      const bi = order.has(b.name.toLowerCase()) ? order.get(b.name.toLowerCase()) : 999;
      return ai - bi || a.name.localeCompare(b.name);
    });

    const recent = members
      .filter(member => member.memberSince && Number.isFinite(new Date(member.memberSince).getTime()))
      .sort((a, b) => new Date(b.memberSince) - new Date(a.memberSince))
      .slice(0, 8)
      .map(member => ({
        displayName: member.displayName || member.username || "Unknown member",
        memberSince: member.memberSince,
        rank: member.staffRank || member.rank || "",
        iconUrl: member.staffRank ? member.staffRankIconUrl : member.rankIconUrl,
        unicodeEmoji: member.staffRank ? member.staffRankUnicodeEmoji : member.rankUnicodeEmoji
      }));

    return Response.json({
      memberCount: Number(meta?.memberCount) || members.length,
      updatedAt: meta?.syncedAt || null,
      ranks,
      recent
    }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("Rank overview failed:", error);
    return Response.json({ error: "Rank overview unavailable." }, { status: 500 });
  }
}
