const PROFILE_INDEX_KEY = "member-profiles:index";
const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);
  if (!match) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

function isStaff(session) {
  return Boolean(session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId)));
}

function getDisplayName(session) {
  return session?.nick || session?.global_name || session?.username || "Unknown member";
}

function getDiscordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return "assets/ironkin-emblem.png";
  const extension = String(user.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getProfileRecord(env, discordId) {
  if (!discordId) return {};
  const raw = await env.DROPS_KV.get(`member-profile:${discordId}`);
  return safeJsonParse(raw, {});
}

async function saveProfileRecord(env, discordId, record) {
  await env.DROPS_KV.put(`member-profile:${discordId}`, JSON.stringify(record));

  const index = safeJsonParse(await env.DROPS_KV.get(PROFILE_INDEX_KEY), []);
  const nextIndex = Array.isArray(index) ? index.filter(item => item.discordId !== discordId) : [];
  nextIndex.push({
    discordId,
    displayName: record.displayName || "Unknown member",
    username: record.username || "",
    updatedAt: new Date().toISOString()
  });
  await env.DROPS_KV.put(PROFILE_INDEX_KEY, JSON.stringify(nextIndex));
}

async function getEmberBalance(env, discordId, displayName) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { balance: 0, source: "missing-supabase" };
  }

  const base = supabaseUrl.replace(/\/$/, "");
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json"
  };

  const queries = [];
  if (discordId) {
    queries.push(`${base}/rest/v1/balances?select=balance,display_name,user_id&user_id=eq.${encodeURIComponent(discordId)}&limit=1`);
  }
  if (displayName) {
    queries.push(`${base}/rest/v1/balances?select=balance,display_name,user_id&display_name=ilike.${encodeURIComponent(displayName)}&limit=1`);
  }

  for (const url of queries) {
    try {
      const response = await fetch(url, { headers });
      const data = await response.json().catch(() => []);
      if (response.ok && Array.isArray(data) && data[0]) {
        return {
          balance: Number(data[0].balance || 0),
          displayName: data[0].display_name || displayName,
          source: "supabase"
        };
      }
    } catch {
      // Try the next lookup.
    }
  }

  return { balance: 0, source: "not-found" };
}

function summarizeWomPlayer(data) {
  const skills = data?.latestSnapshot?.data?.skills || data?.skills || {};
  const bosses = data?.latestSnapshot?.data?.bosses || data?.bosses || {};
  const overall = skills.overall || {};
  const combat = data?.combatLevel || data?.latestSnapshot?.data?.combatLevel || null;

  const skillRows = Object.entries(skills)
    .filter(([key]) => key !== "overall")
    .map(([key, value]) => ({
      key,
      name: key.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase()),
      level: Number(value?.level || 0),
      experience: Number(value?.experience || 0),
      rank: value?.rank ?? null
    }))
    .filter(skill => skill.level || skill.experience)
    .sort((a, b) => b.experience - a.experience);

  return {
    found: true,
    username: data?.displayName || data?.username || "",
    type: data?.type || null,
    build: data?.build || null,
    combatLevel: combat,
    totalLevel: Number(overall.level || 0),
    overallXp: Number(overall.experience || 0),
    overallRank: overall.rank ?? null,
    topSkills: skillRows.slice(0, 5),
    skills: skillRows,
    bossCount: Object.keys(bosses || {}).length
  };
}

async function getWomStats(rsn) {
  if (!rsn) return { found: false, error: "No RSN available." };

  try {
    const response = await fetch(
      `https://api.wiseoldman.net/v2/players/username/${encodeURIComponent(rsn)}`,
      { headers: { "User-Agent": "Ironkin Clan Website profile stats" } }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { found: false, error: data?.message || "Wise Old Man player not found." };
    }

    return summarizeWomPlayer(data);
  } catch {
    return { found: false, error: "Could not load Wise Old Man stats." };
  }
}

function getArchiveRows(entry) {
  if (Array.isArray(entry?.topFive)) return entry.topFive;
  if (Array.isArray(entry?.leaderboard)) return entry.leaderboard;
  if (Array.isArray(entry?.standings)) return entry.standings;
  return [];
}

function formatEventType(type) {
  if (type === "sotw") return "SOTW";
  if (type === "botw") return "BOTW";
  if (String(type || "").includes("clan-goal")) return "Clan Goal";
  if (String(type || "").includes("bingo")) return "Bingo";
  return "Event";
}

async function getEventPlacements(env, rsn) {
  const target = normalizeName(rsn);
  if (!target) {
    return { wins: {}, topThreeFinishes: 0, recent: [] };
  }

  const raw = await env.DROPS_KV.get("events:archive");
  const archive = safeJsonParse(raw, []);
  const recent = [];
  const wins = { sotw: 0, botw: 0, bingo: 0, clanGoal: 0 };
  let topThreeFinishes = 0;

  if (!Array.isArray(archive)) {
    return { wins, topThreeFinishes, recent };
  }

  archive.forEach(entry => {
    const rows = getArchiveRows(entry);
    const matchIndex = rows.findIndex(row => normalizeName(row.name || row.displayName || row.username) === target);
    if (matchIndex === -1) return;

    const placement = matchIndex + 1;
    const row = rows[matchIndex];
    const eventType = formatEventType(entry.type);

    if (placement === 1) {
      if (entry.type === "sotw") wins.sotw += 1;
      else if (entry.type === "botw") wins.botw += 1;
      else if (String(entry.type || "").includes("bingo")) wins.bingo += 1;
      else if (String(entry.type || "").includes("clan-goal")) wins.clanGoal += 1;
    }

    if (placement <= 3) topThreeFinishes += 1;

    recent.push({
      eventId: entry.id || null,
      title: entry.title || entry.label || "Archived Event",
      type: eventType,
      placement,
      gained: Number(row.gained || row.score || 0),
      endedAt: entry.endedAt || entry.endDate || null
    });
  });

  recent.sort((a, b) => new Date(b.endedAt || 0) - new Date(a.endedAt || 0));

  return {
    wins,
    topThreeFinishes,
    recent: recent.slice(0, 5)
  };
}

function buildProfile({ session, record, embers, wom, placements }) {
  const displayName = record.displayName || getDisplayName(session);
  const rsn = record.rsn || getDisplayName(session);
  const discordAvatarUrl = getDiscordAvatarUrl(session);
  const avatarUrl = record.adminAvatarOverride || record.customAvatarUrl || discordAvatarUrl;
  const blurb = record.adminBlurbOverride || record.blurb || "";
  const rank = record.rankOverride || (isStaff(session) ? "Staff" : "Ironkin Member");

  return {
    discordId: session.id,
    username: session.username,
    displayName,
    rsn,
    rank,
    memberSince: session.joined_at || session.joinedAt || null,
    avatarUrl,
    discordAvatarUrl,
    customAvatarUrl: record.customAvatarUrl || "",
    blurb,
    ownBlurb: record.blurb || "",
    ownAvatarUrl: record.customAvatarUrl || "",
    hasAdminAvatarOverride: Boolean(record.adminAvatarOverride),
    hasAdminBlurbOverride: Boolean(record.adminBlurbOverride),
    embers,
    wom,
    placements
  };
}

export async function onRequestGet({ request, env }) {
  const session = getSession(request);

  if (!session) {
    return Response.json({ error: "Please sign in with Discord first." }, { status: 401 });
  }

  const record = await getProfileRecord(env, session.id);
  const displayName = getDisplayName(session);
  const rsn = record.rsn || displayName;

  const [embers, wom, placements] = await Promise.all([
    getEmberBalance(env, session.id, displayName),
    getWomStats(rsn),
    getEventPlacements(env, rsn)
  ]);

  const refreshedRecord = {
    ...record,
    displayName,
    username: session.username,
    rsn,
    lastSeenAt: new Date().toISOString()
  };
  await saveProfileRecord(env, session.id, refreshedRecord);

  return Response.json({
    signedIn: true,
    isStaff: isStaff(session),
    profile: buildProfile({
      session,
      record: refreshedRecord,
      embers,
      wom,
      placements
    })
  });
}

export async function onRequestPost({ request, env }) {
  const session = getSession(request);

  if (!session) {
    return Response.json({ error: "Please sign in with Discord first." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const customAvatarUrl = String(body.customAvatarUrl || "").trim();
  const blurb = String(body.blurb || "").trim().slice(0, 250);
  const displayName = getDisplayName(session);

  const existing = await getProfileRecord(env, session.id);
  const next = {
    ...existing,
    displayName,
    username: session.username,
    rsn: displayName,
    customAvatarUrl,
    blurb,
    updatedAt: new Date().toISOString()
  };

  await saveProfileRecord(env, session.id, next);

  const [embers, wom, placements] = await Promise.all([
    getEmberBalance(env, session.id, displayName),
    getWomStats(displayName),
    getEventPlacements(env, displayName)
  ]);

  return Response.json({
    success: true,
    profile: buildProfile({ session, record: next, embers, wom, placements })
  });
}
