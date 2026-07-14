// Shared logic for the Battleship Bingo boss kill tracker.
// Takes a baseline snapshot of every participant's boss kill counts from the
// Wise Old Man API, then refreshes in small chunks so each run stays inside
// WOM rate limits and Cloudflare subrequest limits.

const TRACKER_KEY = "bingo:boss-tracker";
const SIGNUPS_KEY = "bingo:signups";
const SETTINGS_KEY = "bingo:settings";
const WOM_GROUP_ID = "12095";
const WOM_BASE = "https://api.wiseoldman.net/v2";
const WOM_USER_AGENT = "Ironkin Clan Website - Battleship Bingo boss tracker";

export const CHUNK_SIZE = 9;
const MAX_WOM_CALLS_PER_RUN = 18;
const REFRESH_INTERVAL_MS = 90 * 60 * 1000;
const RSN_PATTERN = /^[a-zA-Z0-9 _-]{1,12}$/;

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function getTrackerState(env) {
  const raw = await env.DROPS_KV.get(TRACKER_KEY);
  const state = safeJsonParse(raw, {});
  return {
    startedAt: state.startedAt || null,
    lastCompletedAt: state.lastCompletedAt || null,
    cycleStartedAt: state.cycleStartedAt || null,
    cursor: Number.isInteger(state.cursor) ? state.cursor : 0,
    players: state.players && typeof state.players === "object" ? state.players : {}
  };
}

export async function saveTrackerState(env, state) {
  await env.DROPS_KV.put(TRACKER_KEY, JSON.stringify(state));
}

export async function getTrackerSettings(env) {
  const raw = await env.DROPS_KV.get(SETTINGS_KEY);
  const parsed = safeJsonParse(raw, {});
  return {
    active: parsed.active === true,
    boardRevealAt: typeof parsed.boardRevealAt === "string" ? parsed.boardRevealAt : "",
    teamOneName: parsed.teamOneName || "Team 1",
    teamTwoName: parsed.teamTwoName || "Team 2"
  };
}

export async function getSignups(env) {
  const raw = await env.DROPS_KV.get(SIGNUPS_KEY);
  const signups = safeJsonParse(raw, []);
  return Array.isArray(signups) ? signups : [];
}

function normalizeRsn(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}

// Discord nicknames are usually the RSN, but names like "apey | Apie" need
// splitting into candidates that are tried against WOM in order.
export function getRsnCandidates(player) {
  const candidates = [];
  const push = value => {
    const cleaned = String(value || "").trim();
    if (!cleaned || !RSN_PATTERN.test(cleaned)) return;
    if (candidates.some(item => normalizeRsn(item) === normalizeRsn(cleaned))) return;
    candidates.push(cleaned);
  };

  push(player.rsnOverride);
  if (player.rsnOverride) return candidates;

  push(player.rsn);
  push(player.displayName);
  String(player.displayName || "")
    .split("|")
    .forEach(part => push(part));
  return candidates;
}

function summarizeBosses(data) {
  const bosses = data?.latestSnapshot?.data?.bosses || {};
  const rawActivities = data?.latestSnapshot?.data?.activities || {};
  const kills = {};
  const activities = {};
  let total = 0;

  for (const [metric, value] of Object.entries(bosses)) {
    const count = Math.max(0, Number(value?.kills || 0));
    if (count > 0) {
      kills[metric] = count;
      total += count;
    }
  }

  // Activities use "score" instead of "kills". All of them are stored so the
  // event list can be changed retroactively; only whitelisted ones count.
  for (const [metric, value] of Object.entries(rawActivities)) {
    const score = Math.max(0, Number(value?.score || 0));
    if (score > 0) activities[metric] = score;
  }

  return { total, bosses: kills, activities };
}

function womHeaders(env) {
  const headers = { "User-Agent": WOM_USER_AGENT };
  if (env.WOM_API_KEY) headers["x-api-key"] = env.WOM_API_KEY;
  return headers;
}

export async function womFetch(env, path, options = {}, timeoutMs = 15000) {
  const response = await fetch(`${WOM_BASE}${path}`, {
    ...options,
    headers: womHeaders(env),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// POST asks WOM to pull fresh hiscores numbers (and creates the player if WOM
// has never seen them). Falls back to the last stored snapshot when the update
// is rejected (rate limit, hiscores down, updated seconds ago).
async function fetchWomPlayer(env, rsn) {
  const encoded = encodeURIComponent(rsn);

  try {
    const updated = await womFetch(env, `/players/${encoded}`, { method: "POST" });
    if (updated.ok) return { ok: true, data: updated.data };

    if (updated.status === 400 || updated.status === 404) {
      return { ok: false, status: updated.status, notFound: true };
    }
  } catch {
    // Timeout or network issue. Try the cached snapshot below.
  }

  try {
    const cached = await womFetch(env, `/players/${encoded}`, {}, 10000);
    if (cached.ok) return { ok: true, data: cached.data, stale: true };
    return { ok: false, status: cached.status, notFound: cached.status === 404 };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function fetchGroupUsernames(env) {
  try {
    const group = await womFetch(env, `/groups/${WOM_GROUP_ID}`);
    if (!group.ok) return null;
    const memberships = Array.isArray(group.data?.memberships) ? group.data.memberships : [];
    return new Set(
      memberships
        .map(item => normalizeRsn(item?.player?.displayName || item?.player?.username))
        .filter(Boolean)
    );
  } catch {
    return null;
  }
}

// Bosses that count for this event, dictated by the bingo board tiles.
// Uses WOM metric names (e.g. "zulrah", "chambers_of_xeric"). An empty list
// means every boss counts. Kills on bosses outside this list are still stored
// in the snapshots, so editing the list mid-event recalculates totals
// retroactively and loses nothing.
export const EVENT_BOSS_METRICS = [
  "abyssal_sire",
  "alchemical_hydra",
  "araxxor",
  "artio",
  "barrows_chests",
  "bryophyta",
  "callisto",
  "calvarion",
  "cerberus",
  "chambers_of_xeric",
  "chambers_of_xeric_challenge_mode",
  "commander_zilyana",
  "dagannoth_prime",
  "dagannoth_rex",
  "dagannoth_supreme",
  "doom_of_mokhaiotl",
  "duke_sucellus",
  "general_graardor",
  "grotesque_guardians",
  "kraken",
  "kreearra",
  "kril_tsutsaroth",
  "lunar_chests",
  "maggot_king",
  "nightmare",
  "phantom_muspah",
  "phosanis_nightmare",
  "shellbane_gryphon",
  "skotizo",
  "spindel",
  "tempoross",
  "the_hueycoatl",
  "the_leviathan",
  "the_royal_titans",
  "the_whisperer",
  "theatre_of_blood",
  "theatre_of_blood_hard_mode",
  "tombs_of_amascut",
  "tombs_of_amascut_expert",
  "vardorvis",
  "venenatis",
  "vetion",
  "vorkath",
  "wintertodt",
  "yama",
  "zalcano",
  "zulrah"
];

function getEventBossSet() {
  return EVENT_BOSS_METRICS.length ? new Set(EVENT_BOSS_METRICS) : null;
}

// Hiscores "activities" that also count for the event (e.g. Guardians of the
// Rift is an activity, not a boss - its number is rifts closed). Unlike the
// boss list, this one is opt-in only: an empty list means NO activities count,
// otherwise things like clue scrolls would pollute the totals.
export const EVENT_ACTIVITY_METRICS = ["guardians_of_the_rift"];

// Staff-provided average GP made per kill (per chest, raid completion, rift
// or game where applicable). Used to estimate money made during the event;
// metrics missing from this map simply contribute 0 gp.
export const BOSS_GP_PER_KILL = {
  abyssal_sire: 81772,
  alchemical_hydra: 196855.12,
  araxxor: 45442.15,
  artio: 40943.35,
  barrows_chests: 25000,
  bryophyta: 734.09,
  callisto: 146359.62,
  calvarion: 44265.89,
  cerberus: 71868.38,
  chambers_of_xeric: 2618458,
  chambers_of_xeric_challenge_mode: 5223132,
  commander_zilyana: 161708.08,
  dagannoth_prime: 27007.96,
  dagannoth_rex: 41219.51,
  dagannoth_supreme: 34542.22,
  doom_of_mokhaiotl: 2108869,
  duke_sucellus: 257994,
  general_graardor: 176386.83,
  grotesque_guardians: 71773.67,
  kraken: 20715.44,
  kreearra: 230038.29,
  kril_tsutsaroth: 85531.7,
  lunar_chests: 198104.44,
  maggot_king: 38304,
  nightmare: 359716,
  phantom_muspah: 264886.51,
  phosanis_nightmare: 957689,
  shellbane_gryphon: 8586.96,
  skotizo: 163629.69,
  spindel: 77225.34,
  tempoross: 4218,
  the_hueycoatl: 296445,
  the_leviathan: 268426,
  the_royal_titans: 114648.61,
  the_whisperer: 303720,
  theatre_of_blood: 3390763,
  theatre_of_blood_hard_mode: 4575871.4,
  tombs_of_amascut: 958547,
  tombs_of_amascut_expert: 2062832,
  vardorvis: 266341,
  venenatis: 240431.72,
  vetion: 134272.83,
  vorkath: 160655.27,
  wintertodt: 18320,
  yama: 650473,
  zalcano: 218477.43,
  zulrah: 133778.75,
  guardians_of_the_rift: 5177.13
};

// Verified RSNs for members whose Discord nickname is ambiguous or wrong,
// confirmed by staff before the event. Keyed by Discord ID so nickname
// changes cannot break them. Staff can still change these from the stats
// page; clearing an override there falls back to these defaults.
const DEFAULT_RSN_OVERRIDES = {
  "212373474134589441": "apey",         // apey | Apie
  "379767655458013185": "Evil-gunter",  // Evil-gunter | Bob Locked
  "391430419746390016": "GIM Seedling", // GIM Seedling | iBoolean
  "251139450417971210": "Bakara",       // David
  "192100654657961984": "soloikigai"    // Solo Ikigai
};

// Keep the tracked roster in sync with bingo signups. Signups removed by staff
// drop out of the totals; new signups get picked up on the next sweep.
export function syncRoster(state, signups) {
  const nextPlayers = {};

  signups.forEach(signup => {
    const existing = state.players[signup.discordId] || {};
    const player = {
      ...existing,
      discordId: signup.discordId,
      displayName: signup.displayName || existing.displayName || "Unknown member",
      team: signup.team || existing.team || "team1"
    };
    if (!player.rsnOverride && DEFAULT_RSN_OVERRIDES[signup.discordId]) {
      player.rsnOverride = DEFAULT_RSN_OVERRIDES[signup.discordId];
    }
    nextPlayers[signup.discordId] = player;
  });

  state.players = nextPlayers;
  return state;
}

function sortedPlayerIds(state) {
  return Object.keys(state.players).sort();
}

export async function processChunk(env, state, { force = false } = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const playerIds = sortedPlayerIds(state);

  if (!playerIds.length) {
    return { waiting: true, reason: "No bingo signups to track yet." };
  }

  const cycleInProgress = Boolean(state.cycleStartedAt);

  if (!cycleInProgress) {
    const lastCompleted = state.lastCompletedAt ? new Date(state.lastCompletedAt).getTime() : 0;
    if (!force && lastCompleted && now.getTime() - lastCompleted < REFRESH_INTERVAL_MS) {
      return { skipped: true, reason: "Refreshed recently.", lastCompletedAt: state.lastCompletedAt };
    }
    state.cycleStartedAt = nowIso;
    state.cursor = 0;
    if (!state.startedAt) state.startedAt = nowIso;
  }

  const chunk = playerIds.slice(state.cursor, state.cursor + CHUNK_SIZE);
  const needsResolution = chunk.some(id => !state.players[id].rsn);
  let groupUsernames = null;
  let womCalls = 0;

  if (needsResolution) {
    groupUsernames = await fetchGroupUsernames(env);
    womCalls += 1;
  }

  const processed = [];
  const failures = [];
  let stoppedEarly = false;

  for (const discordId of chunk) {
    if (womCalls >= MAX_WOM_CALLS_PER_RUN) {
      stoppedEarly = true;
      break;
    }

    const player = state.players[discordId];
    let candidates = getRsnCandidates(player);

    // Prefer the candidate that is already a member of the clan's WOM group.
    if (!player.rsn && groupUsernames && candidates.length > 1) {
      const inGroup = candidates.filter(name => groupUsernames.has(normalizeRsn(name)));
      if (inGroup.length) candidates = [...inGroup, ...candidates.filter(name => !inGroup.includes(name))];
    }

    if (!candidates.length) {
      player.error = "No valid RSN. Ask staff to set one.";
      failures.push({ discordId, displayName: player.displayName, error: player.error });
      state.cursor += 1;
      continue;
    }

    let resolved = null;
    let lastError = "Could not reach Wise Old Man.";

    for (const candidate of candidates) {
      if (womCalls >= MAX_WOM_CALLS_PER_RUN) break;
      womCalls += 1;
      const result = await fetchWomPlayer(env, candidate);

      if (result.ok) {
        resolved = { rsn: result.data?.displayName || candidate, data: result.data };
        break;
      }

      lastError = result.notFound
        ? `"${candidate}" was not found on the hiscores.`
        : "Wise Old Man is temporarily unavailable.";
    }

    if (!resolved) {
      player.error = lastError;
      failures.push({ discordId, displayName: player.displayName, error: lastError });
      state.cursor += 1;
      continue;
    }

    const snapshot = { at: nowIso, ...summarizeBosses(resolved.data) };
    player.rsn = resolved.rsn;
    player.guessed = !player.rsnOverride && candidates.length > 1 &&
      normalizeRsn(resolved.rsn) !== normalizeRsn(player.displayName);
    player.error = null;
    player.updatedAt = nowIso;
    if (!player.baseline) player.baseline = snapshot;
    player.current = snapshot;

    processed.push({ discordId, rsn: player.rsn, total: snapshot.total });
    state.cursor += 1;
  }

  let cycleComplete = false;
  if (!stoppedEarly && state.cursor >= playerIds.length) {
    state.cycleStartedAt = null;
    state.cursor = 0;
    state.lastCompletedAt = nowIso;
    cycleComplete = true;
  }

  await saveTrackerState(env, state);

  return {
    success: true,
    processed,
    failures,
    cursor: state.cursor,
    totalPlayers: playerIds.length,
    cycleComplete
  };
}

function formatBossName(metric) {
  return String(metric || "")
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getPlayerGains(player, eventBossSet) {
  if (!player.baseline || !player.current) return { total: 0, bosses: {} };

  const bosses = {};
  let total = 0;

  for (const [metric, kills] of Object.entries(player.current.bosses || {})) {
    if (eventBossSet && !eventBossSet.has(metric)) continue;
    const gained = Math.max(0, kills - (player.baseline.bosses?.[metric] || 0));
    if (gained > 0) {
      bosses[metric] = gained;
      total += gained;
    }
  }

  for (const metric of EVENT_ACTIVITY_METRICS) {
    const current = player.current.activities?.[metric] || 0;
    const gained = Math.max(0, current - (player.baseline.activities?.[metric] || 0));
    if (gained > 0) {
      bosses[metric] = gained;
      total += gained;
    }
  }

  return { total, bosses };
}

export function buildSummary(state, settings) {
  const eventBossSet = getEventBossSet();
  const bossTotals = {};
  const totals = { overall: 0, team1: 0, team2: 0 };
  const players = [];

  for (const player of Object.values(state.players)) {
    const gains = getPlayerGains(player, eventBossSet);
    const teamKey = player.team === "team2" ? "team2" : "team1";
    totals.overall += gains.total;
    totals[teamKey] += gains.total;

    for (const [metric, kills] of Object.entries(gains.bosses)) {
      if (!bossTotals[metric]) {
        bossTotals[metric] = { metric, name: formatBossName(metric), total: 0, team1: 0, team2: 0, contributors: [] };
      }
      bossTotals[metric].total += kills;
      bossTotals[metric][teamKey] += kills;
      bossTotals[metric].contributors.push({ name: player.displayName, team: teamKey, kills });
    }

    players.push({
      discordId: player.discordId,
      displayName: player.displayName,
      rsn: player.rsn || null,
      team: player.team,
      gained: gains.total,
      tracked: Boolean(player.baseline),
      guessed: player.guessed === true,
      error: player.error || null,
      updatedAt: player.updatedAt || null
    });
  }

  players.sort((a, b) => b.gained - a.gained || String(a.displayName).localeCompare(String(b.displayName)));

  const gpTotals = { overall: 0, team1: 0, team2: 0 };
  const bosses = Object.values(bossTotals)
    .map(boss => {
      const gpEach = BOSS_GP_PER_KILL[boss.metric] || 0;
      gpTotals.overall += boss.total * gpEach;
      gpTotals.team1 += boss.team1 * gpEach;
      gpTotals.team2 += boss.team2 * gpEach;

      // Keep the top 8 contributors per team: enough for a top-5 list under
      // any filter without shipping every member for every boss.
      const teamCounts = { team1: 0, team2: 0 };
      const contributors = boss.contributors
        .sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name))
        .filter(entry => (teamCounts[entry.team] += 1) <= 8);

      return { ...boss, contributors, gpEach };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  gpTotals.overall = Math.round(gpTotals.overall);
  gpTotals.team1 = Math.round(gpTotals.team1);
  gpTotals.team2 = Math.round(gpTotals.team2);

  return {
    tracking: Boolean(state.startedAt),
    startedAt: state.startedAt,
    lastUpdatedAt: state.lastCompletedAt,
    refreshing: Boolean(state.cycleStartedAt),
    settings: {
      teamOneName: settings.teamOneName,
      teamTwoName: settings.teamTwoName
    },
    totals,
    gpTotals,
    bosses,
    players,
    eventBosses: [...EVENT_BOSS_METRICS],
    eventActivities: [...EVENT_ACTIVITY_METRICS],
    trackedCount: players.filter(player => player.tracked).length,
    untrackedCount: players.filter(player => !player.tracked).length
  };
}
