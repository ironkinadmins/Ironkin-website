import { hybridKv } from "../_hybridKv.js";
const PROFILE_INDEX_KEY = "member-profiles:index";
const PROFILE_SYNC_META_KEY = "member-profiles:discord-sync";
const RANK_EMBLEM_MAP_KEY = "member-profiles:rank-emblem-map";
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

function normalizeProfileName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function mergePreviousRsns(existing, nextRsn) {
  const aliases = Array.isArray(existing?.previousRsns) ? [...existing.previousRsns] : [];
  const priorRsn = String(existing?.rsn || existing?.displayName || "").trim();
  const nextKey = normalizeProfileName(nextRsn);

  if (priorRsn && normalizeProfileName(priorRsn) !== nextKey) aliases.push(priorRsn);

  const seen = new Set();
  return aliases
    .map(value => String(value || "").trim())
    .filter(value => {
      const key = normalizeProfileName(value);
      if (!key || key === nextKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(-10);
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

function discordErrorMessage(status, detail) {
  if (status === 403) {
    return "Discord refused the guild member list (403). Enable Server Members Intent for the website bot in Discord Developer Portal > Bot > Privileged Gateway Intents, then redeploy/force sync.";
  }
  if (status === 401) {
    return "Discord rejected DISCORD_BOT_TOKEN (401). Check the Cloudflare DISCORD_BOT_TOKEN secret.";
  }
  return `Discord member sync failed (${status})${detail ? `: ${detail.slice(0, 180)}` : ""}`;
}

function discordRoleIconUrl(role) {
  if (!role?.id || !role?.icon) return "";
  const extension = String(role.icon).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/role-icons/${role.id}/${role.icon}.${extension}?size=64`;
}

async function fetchGuildRoles(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return [];
  const response = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  if (!response.ok) return [];
  const roles = await response.json().catch(() => []);
  return Array.isArray(roles) ? roles : [];
}

function normalizeDiscordEmblemName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchGuildEmojis(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return [];
  const response = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/emojis`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  if (!response.ok) return [];
  const emojis = await response.json().catch(() => []);
  return Array.isArray(emojis) ? emojis : [];
}

function matchingGuildEmoji(rankName, guildEmojis) {
  const wanted = normalizeDiscordEmblemName(rankName);
  if (!wanted) return null;
  return (guildEmojis || []).find(emoji => normalizeDiscordEmblemName(emoji?.name) === wanted)
    || (guildEmojis || []).find(emoji => {
      const name = normalizeDiscordEmblemName(emoji?.name);
      return name && (name.includes(wanted) || wanted.includes(name));
    })
    || null;
}

function discordEmojiIconUrl(emoji) {
  if (!emoji?.id) return "";
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=64&quality=lossless`;
}

function normalizeRankEmblemMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const roleId = String(key || "").trim();
    const emojiId = String(rawValue || "").trim();
    if (roleId && emojiId) clean[roleId] = emojiId;
  }
  return clean;
}

export async function getDiscordRankEmblemMap(env) {
  return normalizeRankEmblemMap(safeJsonParse(await hybridKv(env, "drops").get(RANK_EMBLEM_MAP_KEY), {}));
}

export async function saveDiscordRankEmblemMap(env, map) {
  const clean = normalizeRankEmblemMap(map);
  await hybridKv(env, "drops").put(RANK_EMBLEM_MAP_KEY, JSON.stringify(clean));
  return clean;
}

function mappedGuildEmoji(roleId, guildEmojis, emblemMap) {
  const wantedId = String(emblemMap?.[String(roleId || "")] || "").trim();
  if (!wantedId) return null;
  return (guildEmojis || []).find(emoji => String(emoji?.id || "") === wantedId) || null;
}

export async function getDiscordRankEmblemDiagnostics(env) {
  const [guildRoles, guildEmojis, emblemMap] = await Promise.all([
    fetchGuildRoles(env),
    fetchGuildEmojis(env),
    getDiscordRankEmblemMap(env)
  ]);
  const trackedRanks = [...STAFF_RANKS, ...CLAN_RANKS];
  return {
    mappings: emblemMap,
    ranks: trackedRanks.map(rank => {
      const role = guildRoles.find(item => String(item?.id || "") === rank.id) || null;
      return {
        id: rank.id,
        name: rank.name,
        nativeIconUrl: discordRoleIconUrl(role),
        unicodeEmoji: role?.unicode_emoji || "",
        mappedEmojiId: emblemMap[rank.id] || ""
      };
    }),
    emojis: guildEmojis
      .filter(emoji => emoji?.id && emoji?.name)
      .map(emoji => ({
        id: String(emoji.id),
        name: String(emoji.name),
        animated: Boolean(emoji.animated),
        url: discordEmojiIconUrl(emoji)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
  };
}

function roleVisual(roleIds, ranks, guildRoles, guildEmojis = [], emblemMap = {}) {
  const roles = Array.isArray(roleIds) ? roleIds : [];
  for (let i = ranks.length - 1; i >= 0; i -= 1) {
    const rank = ranks[i];
    if (!roles.includes(rank.id)) continue;
    const discordRole = (guildRoles || []).find(role => String(role?.id || "") === rank.id) || null;
    const mappedEmoji = mappedGuildEmoji(rank.id, guildEmojis, emblemMap);
    const guildEmoji = mappedEmoji || matchingGuildEmoji(rank.name, guildEmojis);
    return {
      name: rank.name,
      roleId: rank.id,
      iconUrl: discordRoleIconUrl(discordRole) || discordEmojiIconUrl(guildEmoji),
      unicodeEmoji: discordRole?.unicode_emoji || ""
    };
  }
  return { name: null, roleId: "", iconUrl: "", unicodeEmoji: "" };
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
    if (after !== "0") url.searchParams.set("after", after);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(discordErrorMessage(response.status, detail));
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

function buildDirectoryEntry(member, now, guildRoles = [], guildEmojis = [], emblemMap = {}) {
  const user = member?.user || {};
  const discordId = String(user.id || "");
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  const displayName = member?.nick || user.global_name || user.username || "Unknown member";
  const clanRank = roleVisual(roles, CLAN_RANKS, guildRoles, guildEmojis, emblemMap);
  const staffRank = roleVisual(roles, STAFF_RANKS, guildRoles, guildEmojis, emblemMap);
  return {
    discordId,
    displayName,
    username: user.username || "",
    avatar: user.avatar || "",
    avatarUrl: discordAvatarUrl(user),
    roles,
    rank: clanRank.name || "Member",
    rankRoleId: clanRank.roleId || "",
    rankIconUrl: clanRank.iconUrl,
    rankUnicodeEmoji: clanRank.unicodeEmoji,
    staffRank: staffRank.name || null,
    staffRankRoleId: staffRank.roleId || "",
    staffRankIconUrl: staffRank.iconUrl,
    staffRankUnicodeEmoji: staffRank.unicodeEmoji,
    memberSince: member?.joined_at || null,
    updatedAt: now
  };
}

const DISCORD_MANAGED_PROFILE_FIELDS = [
  "discordId",
  "displayName",
  "username",
  "avatar",
  "discordAvatarUrl",
  "roles",
  "rank",
  "rankRoleId",
  "rankIconUrl",
  "rankUnicodeEmoji",
  "staffRank",
  "staffRankRoleId",
  "staffRankIconUrl",
  "staffRankUnicodeEmoji",
  "rsn",
  "previousRsns",
  "memberSince"
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stableValue(value[key])])
    );
  }
  return value ?? null;
}

function discordManagedProfileChanged(existing, nextRecord) {
  for (const field of DISCORD_MANAGED_PROFILE_FIELDS) {
    if (JSON.stringify(stableValue(existing?.[field])) !== JSON.stringify(stableValue(nextRecord?.[field]))) {
      return true;
    }
  }
  return false;
}

function directoryIndexChanged(previousIndex, nextIndex) {
  if (!Array.isArray(previousIndex) || previousIndex.length !== nextIndex.length) return true;
  for (let i = 0; i < nextIndex.length; i += 1) {
    const oldItem = previousIndex[i] || {};
    const newItem = nextIndex[i] || {};
    const oldComparable = { ...oldItem };
    const newComparable = { ...newItem };
    delete oldComparable.updatedAt;
    delete newComparable.updatedAt;
    if (JSON.stringify(stableValue(oldComparable)) !== JSON.stringify(stableValue(newComparable))) return true;
  }
  return false;
}

async function writeProfileRecord(env, member, now, guildRoles = [], guildEmojis = [], emblemMap = {}) {
  const user = member?.user;
  const discordId = String(user?.id || "");
  if (!discordId || user?.bot) return { skipped: true, written: false };

  const existing = safeJsonParse(await hybridKv(env, "drops").get(`member-profile:${discordId}`), {});
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const displayName = member.nick || user.global_name || user.username || existing.displayName || "Unknown member";
  const avatarUrl = discordAvatarUrl(user);
  const clanRank = roleVisual(roles, CLAN_RANKS, guildRoles, guildEmojis, emblemMap);
  const staffRank = roleVisual(roles, STAFF_RANKS, guildRoles, guildEmojis, emblemMap);

  const record = {
    ...existing,
    discordId,
    displayName,
    username: user.username || existing.username || "",
    avatar: user.avatar || "",
    discordAvatarUrl: avatarUrl,
    roles,
    rank: clanRank.name || existing.rank || "Member",
    rankRoleId: clanRank.roleId || existing.rankRoleId || "",
    rankIconUrl: clanRank.iconUrl || existing.rankIconUrl || "",
    rankUnicodeEmoji: clanRank.unicodeEmoji || existing.rankUnicodeEmoji || "",
    staffRank: staffRank.name || null,
    staffRankRoleId: staffRank.roleId || "",
    staffRankIconUrl: staffRank.iconUrl || "",
    staffRankUnicodeEmoji: staffRank.unicodeEmoji || "",
    // Discord nicknames are the clan's RSNs. Keep the saved RSN in sync when a
    // member renames, while retaining old names as aliases for in-flight WOM events.
    rsn: displayName,
    previousRsns: mergePreviousRsns(existing, displayName),
    memberSince: member.joined_at || existing.memberSince || null,
    discordSyncedAt: now
  };

  // KV writes are much more limited than KV reads on Cloudflare's free tier.
  // Preserve every existing profile field and only write when Discord-managed data
  // actually changed. The overall sync timestamp remains available in sync metadata.
  if (!discordManagedProfileChanged(existing, record)) {
    return { skipped: true, written: false };
  }

  await hybridKv(env, "drops").put(`member-profile:${discordId}`, JSON.stringify(record));
  return { skipped: false, written: true };
}

async function runInBatches(items, batchSize, worker) {
  let ok = 0;
  let failed = 0;
  let written = 0;
  let skipped = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(worker));
    for (const result of results) {
      if (result.status === "fulfilled") {
        ok += 1;
        if (result.value?.written) written += 1;
        else if (result.value?.skipped) skipped += 1;
      } else {
        failed += 1;
      }
    }
  }
  return { ok, failed, written, skipped };
}

export async function getDiscordProfileSyncMeta(env) {
  return safeJsonParse(await hybridKv(env, "drops").get(PROFILE_SYNC_META_KEY), null);
}

export async function syncDiscordProfiles(env) {
  const startedAt = Date.now();
  const previousIndex = safeJsonParse(await hybridKv(env, "drops").get(PROFILE_INDEX_KEY), []);
  const [members, guildRoles, guildEmojis, emblemMap] = await Promise.all([
    fetchGuildMembers(env),
    fetchGuildRoles(env),
    fetchGuildEmojis(env),
    getDiscordRankEmblemMap(env)
  ]);
  const now = new Date().toISOString();
  const nonBotMembers = members.filter(member => member?.user?.id && !member?.user?.bot);
  const index = nonBotMembers
    .map(member => buildDirectoryEntry(member, now, guildRoles, guildEmojis, emblemMap))
    .filter(item => item.discordId)
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), undefined, { sensitivity: "base" }));

  const previousById = new Map((Array.isArray(previousIndex) ? previousIndex : []).map(item => [String(item?.discordId || ""), item]));
  const currentById = new Map(index.map(item => [String(item.discordId), item]));
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const item of index) {
    const old = previousById.get(String(item.discordId));
    if (!old) {
      added += 1;
      continue;
    }

    const changed =
      old.displayName !== item.displayName ||
      old.username !== item.username ||
      old.avatar !== item.avatar ||
      old.rank !== item.rank ||
      old.rankRoleId !== item.rankRoleId ||
      old.staffRank !== item.staffRank ||
      old.staffRankRoleId !== item.staffRankRoleId ||
      old.rankIconUrl !== item.rankIconUrl ||
      old.rankUnicodeEmoji !== item.rankUnicodeEmoji ||
      old.staffRankIconUrl !== item.staffRankIconUrl ||
      old.staffRankUnicodeEmoji !== item.staffRankUnicodeEmoji ||
      old.memberSince !== item.memberSince ||
      JSON.stringify(old.roles || []) !== JSON.stringify(item.roles || []);
    if (changed) updated += 1;
  }

  for (const old of Array.isArray(previousIndex) ? previousIndex : []) {
    if (old?.discordId && !currentById.has(String(old.discordId))) removed += 1;
  }

  // CRITICAL: publish the complete Discord directory FIRST. The old implementation only
  // wrote the index after hundreds of per-member KV reads/writes, so a timeout/failure
  // left search stuck on the old partial directory.
  if (directoryIndexChanged(previousIndex, index)) {
    await hybridKv(env, "drops").put(PROFILE_INDEX_KEY, JSON.stringify(index));
  }

  const preliminaryMeta = {
    syncedAt: now,
    memberCount: index.length,
    botsSkipped: members.length - nonBotMembers.length,
    discordMemberCount: members.length,
    added,
    updated,
    removed,
    profileRecordsWritten: 0,
    profileRecordFailures: 0,
    durationMs: Date.now() - startedAt,
    directoryReady: true
  };
  await hybridKv(env, "drops").put(PROFILE_SYNC_META_KEY, JSON.stringify(preliminaryMeta));

  // Hydrate the full profile records afterwards, in bounded parallel batches. A failure
  // here no longer prevents everyone from appearing in search.
  const writeResult = await runInBatches(nonBotMembers, 20, member => writeProfileRecord(env, member, now, guildRoles, guildEmojis, emblemMap));
  const meta = {
    ...preliminaryMeta,
    profileRecordsWritten: writeResult.written,
    profileRecordsUnchanged: writeResult.skipped,
    profileRecordsProcessed: writeResult.ok,
    profileRecordFailures: writeResult.failed,
    durationMs: Date.now() - startedAt
  };
  await hybridKv(env, "drops").put(PROFILE_SYNC_META_KEY, JSON.stringify(meta));
  return meta;
}


export async function syncDiscordProfilesBatch(env, options = {}) {
  const startedAt = Date.now();
  const offset = Math.max(0, Number(options.offset || 0));
  const requestedBatchSize = Number(options.batchSize || 15);
  const batchSize = Math.max(1, Math.min(15, Number.isFinite(requestedBatchSize) ? requestedBatchSize : 15));

  const [members, guildRoles, guildEmojis, emblemMap] = await Promise.all([
    fetchGuildMembers(env),
    fetchGuildRoles(env),
    fetchGuildEmojis(env),
    getDiscordRankEmblemMap(env)
  ]);
  const now = new Date().toISOString();
  const nonBotMembers = members.filter(member => member?.user?.id && !member?.user?.bot);
  const total = nonBotMembers.length;

  // Only the first batch rebuilds/publishes the directory. Later requests hydrate profile
  // records only, keeping every Worker invocation safely below Cloudflare subrequest limits.
  if (offset === 0) {
    const previousIndex = safeJsonParse(await hybridKv(env, "drops").get(PROFILE_INDEX_KEY), []);
    const index = nonBotMembers
      .map(member => buildDirectoryEntry(member, now, guildRoles, guildEmojis, emblemMap))
      .filter(item => item.discordId)
      .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), undefined, { sensitivity: "base" }));
    if (directoryIndexChanged(previousIndex, index)) {
      await hybridKv(env, "drops").put(PROFILE_INDEX_KEY, JSON.stringify(index));
    }
  }

  const batch = nonBotMembers.slice(offset, offset + batchSize);
  const writeResult = await runInBatches(batch, 5, member =>
    writeProfileRecord(env, member, now, guildRoles, guildEmojis, emblemMap)
  );
  const nextOffset = offset + batch.length;
  const done = nextOffset >= total;
  const previousMeta = await getDiscordProfileSyncMeta(env) || {};
  const accumulatedWritten = offset === 0 ? writeResult.written : Number(previousMeta.profileRecordsWritten || 0) + writeResult.written;
  const accumulatedUnchanged = offset === 0 ? writeResult.skipped : Number(previousMeta.profileRecordsUnchanged || 0) + writeResult.skipped;
  const accumulatedProcessed = offset === 0 ? writeResult.ok : Number(previousMeta.profileRecordsProcessed || 0) + writeResult.ok;
  const accumulatedFailures = offset === 0 ? writeResult.failed : Number(previousMeta.profileRecordFailures || 0) + writeResult.failed;
  const meta = {
    ...previousMeta,
    syncedAt: done ? now : (previousMeta.syncedAt || now),
    syncStartedAt: offset === 0 ? now : (previousMeta.syncStartedAt || now),
    memberCount: total,
    discordMemberCount: members.length,
    botsSkipped: members.length - total,
    profileRecordsWritten: accumulatedWritten,
    profileRecordsUnchanged: accumulatedUnchanged,
    profileRecordsProcessed: accumulatedProcessed,
    profileRecordFailures: accumulatedFailures,
    directoryReady: true,
    syncInProgress: !done,
    syncOffset: nextOffset,
    durationMs: Date.now() - startedAt
  };
  await hybridKv(env, "drops").put(PROFILE_SYNC_META_KEY, JSON.stringify(meta));

  return {
    ...meta,
    processed: nextOffset,
    total,
    nextOffset: done ? null : nextOffset,
    done,
    batchSize: batch.length
  };
}

export async function ensureDiscordProfilesSynced(env, options = {}) {
  const force = options.force === true;
  const ttlMs = Number(options.ttlMs || DEFAULT_SYNC_TTL_MS);
  const meta = await getDiscordProfileSyncMeta(env);
  const lastSync = meta?.syncedAt ? new Date(meta.syncedAt).getTime() : 0;
  const stale = !lastSync || !Number.isFinite(lastSync) || Date.now() - lastSync >= ttlMs;

  if (!force && !stale && meta?.directoryReady) {
    return { ...meta, synced: false, reason: "fresh" };
  }

  const result = await syncDiscordProfiles(env);
  return { ...result, synced: true };
}
