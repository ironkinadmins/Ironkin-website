const PROFILE_INDEX_KEY = "member-profiles:index";
const PROFILE_SYNC_META_KEY = "member-profiles:discord-sync";
const DEFAULT_SYNC_TTL_MS = 6 * 60 * 60 * 1000;

const CLAN_RANKS = [
  { id: "1366076296399949926", name: "Prospect" },
  { id: "1365446145051987970", name: "Initiate" },
  { id: "1365446223145730161", name: "Tempered" },
  { id: "1365446302451896422", name: "Forged" },
  { id: "1365446348614144063", name: "Warden" },
  { id: "1369388927672123422", name: "Founder" },
  { id: "1365446393216503828", name: "Ironkin" },
  { id: "1403119309970210936", name: "Bloodbound" },
  { id: "1403117777572859924", name: "Archivist" },
  { id: "1365446563874476123", name: "Runeborn" },
  { id: "1403119718960726146", name: "Writekeeper" },
  { id: "1403119580825518140", name: "Curator" },
  { id: "1371191498246324244", name: "Ascendant" },
  { id: "1365446611395940432", name: "Elderkin" },
  { id: "1365446652466298940", name: "Paragon" }
];

const STAFF_RANKS = [
  { id: "1364734283356569620", name: "Chainbearer" },
  { id: "1365445491776815104", name: "Chainkeeper" }
];

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function highestRank(roleIds, ranks) {
  const roles = Array.isArray(roleIds) ? roleIds : [];
  for (let i = ranks.length - 1; i >= 0; i -= 1) {
    if (roles.includes(ranks[i].id)) return ranks[i].name;
  }
  return null;
}

function discordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return "assets/ironkin-emblem.png";
  const extension = String(user.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`;
}

async function fetchGuildMembers(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID.");
  }

  const members = [];
  let after = "0";

  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members`);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("after", after);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Discord member sync failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }

    const pageMembers = await response.json().catch(() => []);
    if (!Array.isArray(pageMembers)) break;

    members.push(...pageMembers);
    if (pageMembers.length < 1000) break;

    const lastId = pageMembers[pageMembers.length - 1]?.user?.id;
    if (!lastId || lastId === after) break;
    after = lastId;
  }

  return members;
}

export async function getDiscordProfileSyncMeta(env) {
  return safeJsonParse(await env.DROPS_KV.get(PROFILE_SYNC_META_KEY), null);
}

export async function syncDiscordProfiles(env) {
  const members = await fetchGuildMembers(env);
  const now = new Date().toISOString();
  const index = [];
  let synced = 0;
  let botsSkipped = 0;

  for (const member of members) {
    const user = member?.user;
    const discordId = String(user?.id || "");
    if (!discordId) continue;
    if (user?.bot) {
      botsSkipped += 1;
      continue;
    }

    const existing = safeJsonParse(await env.DROPS_KV.get(`member-profile:${discordId}`), {});
    const roles = Array.isArray(member.roles) ? member.roles : [];
    const displayName = member.nick || user.global_name || user.username || existing.displayName || "Unknown member";
    const avatarUrl = discordAvatarUrl(user);

    // Preserve member-owned/custom website fields while refreshing Discord-owned fields.
    const record = {
      ...existing,
      discordId,
      displayName,
      username: user.username || existing.username || "",
      avatar: user.avatar || "",
      discordAvatarUrl: avatarUrl,
      roles,
      rank: highestRank(roles, CLAN_RANKS) || existing.rank || "Member",
      staffRank: highestRank(roles, STAFF_RANKS) || null,
      rsn: existing.rsn || displayName,
      memberSince: member.joined_at || existing.memberSince || null,
      discordSyncedAt: now
    };

    await env.DROPS_KV.put(`member-profile:${discordId}`, JSON.stringify(record));

    index.push({
      discordId,
      displayName: record.displayName,
      username: record.username,
      avatar: record.avatar,
      avatarUrl: record.adminAvatarOverride || record.customAvatarUrl || record.discordAvatarUrl || "",
      roles: record.roles,
      rank: record.rank,
      staffRank: record.staffRank,
      memberSince: record.memberSince,
      updatedAt: now
    });
    synced += 1;
  }

  index.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), undefined, { sensitivity: "base" }));
  await env.DROPS_KV.put(PROFILE_INDEX_KEY, JSON.stringify(index));

  const meta = {
    syncedAt: now,
    memberCount: synced,
    botsSkipped,
    discordMemberCount: members.length
  };
  await env.DROPS_KV.put(PROFILE_SYNC_META_KEY, JSON.stringify(meta));
  return meta;
}

export async function ensureDiscordProfilesSynced(env, options = {}) {
  const force = options.force === true;
  const ttlMs = Number(options.ttlMs || DEFAULT_SYNC_TTL_MS);
  const meta = await getDiscordProfileSyncMeta(env);
  const lastSync = meta?.syncedAt ? new Date(meta.syncedAt).getTime() : 0;
  const stale = !lastSync || !Number.isFinite(lastSync) || Date.now() - lastSync >= ttlMs;

  if (!force && !stale) {
    return { ...meta, synced: false, reason: "fresh" };
  }

  const result = await syncDiscordProfiles(env);
  return { ...result, synced: true };
}
