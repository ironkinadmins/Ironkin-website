// Event timeline for the Battleship Bingo boss tracker.
//
// The tracker itself only keeps `baseline` and `current` per player and
// overwrites `current` on every sweep, so the shape of the event over time is
// thrown away. Wise Old Man keeps it for us: the tracker's 2-hourly
// `POST /players/{rsn}` forces WOM to record a snapshot, and WOM retains those
// permanently. So the whole event can be reconstructed from WOM at any time -
// this module treats WOM as the source of truth and KV purely as a cache.
//
// That means the timeline is retroactive (it survives a KV wipe, a tracker
// reset, or an edit to EVENT_BOSS_METRICS) rather than only accruing from the
// moment the feature shipped.

import {
  EVENT_ACTIVITY_METRICS,
  EVENT_BOSS_METRICS,
  getTrackerSettings,
  getTrackerState,
  womFetch
} from "./_bossTracker.js";

const TIMELINE_KEY = "bingo:boss-timeline";

export const TIMELINE_CHUNK_SIZE = 9;

// Points are placed on a fixed grid so both teams share an x axis regardless of
// when each player's snapshot happened to land.
const STEP_MS = 2 * 60 * 60 * 1000;

// A rebuild is only useful once WOM has new snapshots, which arrive every 2h.
const REBUILD_INTERVAL_MS = 100 * 60 * 1000;

// How far before the reveal to look for the pre-event baseline snapshot.
const BASELINE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

// Guards KV size on a long event: 2h steps means ~12 points/player/day.
const MAX_SERIES_POINTS = 800;

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function getTimelineState(env) {
  const raw = await env.DROPS_KV.get(TIMELINE_KEY);
  const state = safeJsonParse(raw, {});
  return {
    revealAt: typeof state.revealAt === "string" ? state.revealAt : null,
    cycleStartedAt: state.cycleStartedAt || null,
    lastCompletedAt: state.lastCompletedAt || null,
    cursor: Number.isInteger(state.cursor) ? state.cursor : 0,
    players: state.players && typeof state.players === "object" ? state.players : {},
    rollup: state.rollup && typeof state.rollup === "object" ? state.rollup : null
  };
}

export async function saveTimelineState(env, state) {
  await env.DROPS_KV.put(TIMELINE_KEY, JSON.stringify(state));
}

function eventBossSet() {
  return EVENT_BOSS_METRICS.length ? new Set(EVENT_BOSS_METRICS) : null;
}

// Event-countable metrics of a WOM snapshot as { metric: value }. WOM reports
// unranked metrics as -1, so only positive values are kept - the same rule
// summarizeBosses() applies in _bossTracker.js.
function eventMetricsFromWomSnapshot(snapshot) {
  const bossSet = eventBossSet();
  const metrics = {};

  for (const [metric, value] of Object.entries(snapshot?.data?.bosses || {})) {
    if (bossSet && !bossSet.has(metric)) continue;
    const kills = Number(value?.kills || 0);
    if (kills > 0) metrics[metric] = kills;
  }

  for (const metric of EVENT_ACTIVITY_METRICS) {
    const score = Number(snapshot?.data?.activities?.[metric]?.score || 0);
    if (score > 0) metrics[metric] = score;
  }

  return metrics;
}

// Same shape, but from a snapshot the tracker already stored
// ({ bosses: { metric: kills }, activities: { metric: score } }). Lets a
// finished sweep extend the series with no extra WOM calls.
function eventMetricsFromTrackerSnapshot(snapshot) {
  const bossSet = eventBossSet();
  const metrics = {};

  for (const [metric, kills] of Object.entries(snapshot?.bosses || {})) {
    if (bossSet && !bossSet.has(metric)) continue;
    if (Number(kills) > 0) metrics[metric] = Number(kills);
  }

  for (const metric of EVENT_ACTIVITY_METRICS) {
    const score = Number(snapshot?.activities?.[metric] || 0);
    if (score > 0) metrics[metric] = score;
  }

  return metrics;
}

// Deliberately mirrors getPlayerGains() in _bossTracker.js: clamp at zero PER
// METRIC, never on the aggregate. A boss that falls off the hiscores must not
// cancel out real kills elsewhere, and the chart has to land on the same number
// the rest of the page shows.
function gainedSince(baselineMetrics, currentMetrics) {
  let total = 0;
  for (const [metric, value] of Object.entries(currentMetrics)) {
    total += Math.max(0, value - (baselineMetrics[metric] || 0));
  }
  return total;
}

// Walks every player's series once across a shared time grid, carrying the last
// known total forward (a step function): a player with no new snapshot simply
// holds their previous value rather than dropping to zero.
function buildRollup(state, revealMs, nowMs) {
  const players = Object.values(state.players)
    .filter(player => !player.error && Array.isArray(player.series));

  const times = [];
  for (let t = revealMs; t < nowMs; t += STEP_MS) times.push(t);
  times.push(nowMs);

  const cursors = players.map(() => 0);
  // Series values are already gains against each player's own baseline, so
  // everyone starts the event on zero.
  const lastGains = players.map(() => 0);
  const points = [];

  for (const time of times) {
    let team1 = 0;
    let team2 = 0;

    players.forEach((player, index) => {
      let cursor = cursors[index];
      while (cursor < player.series.length && player.series[cursor][0] <= time) {
        lastGains[index] = player.series[cursor][1];
        cursor += 1;
      }
      cursors[index] = cursor;

      if (player.team === "team2") team2 += lastGains[index];
      else team1 += lastGains[index];
    });

    points.push({ at: new Date(time).toISOString(), team1, team2, overall: team1 + team2 });
  }

  return {
    points,
    builtAt: new Date(nowMs).toISOString(),
    playerCount: players.length
  };
}

function resetSeries(state) {
  state.players = {};
  state.cursor = 0;
  state.cycleStartedAt = null;
  state.lastCompletedAt = null;
  state.rollup = null;
}

async function fetchPlayerSeries(env, rsn, revealMs, nowMs) {
  const startIso = new Date(revealMs - BASELINE_LOOKBACK_MS).toISOString();
  const endIso = new Date(nowMs + 60 * 1000).toISOString();
  const query = `startDate=${encodeURIComponent(startIso)}&endDate=${encodeURIComponent(endIso)}&limit=200`;

  const response = await womFetch(env, `/players/${encodeURIComponent(rsn)}/snapshots?${query}`);
  if (!response.ok) {
    return { error: response.status === 404 ? `"${rsn}" was not found on Wise Old Man.` : "Wise Old Man is temporarily unavailable." };
  }

  const raw = Array.isArray(response.data) ? response.data : (response.data?.data || []);
  const snapshots = raw
    .map(snapshot => ({
      time: new Date(snapshot?.createdAt).getTime(),
      metrics: eventMetricsFromWomSnapshot(snapshot)
    }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);

  if (!snapshots.length) return { error: "No Wise Old Man history for this player yet." };

  // The tracker holds off until the reveal and then baselines each player on
  // its first sweep - and that sweep is itself a forced WOM update, so the
  // first snapshot at or after the reveal IS the tracker's baseline. Using it
  // keeps the chart's final value consistent with the headline total on the
  // same page. The last pre-reveal snapshot would instead count kills made
  // before the event started.
  const inEvent = snapshots.filter(entry => entry.time >= revealMs);

  let baselineMetrics = null;
  if (inEvent.length) {
    baselineMetrics = inEvent[0].metrics;
  } else {
    // No snapshots since the reveal: fall back to the most recent one before
    // it, so the player holds a flat line rather than vanishing from the chart.
    baselineMetrics = snapshots[snapshots.length - 1].metrics;
  }

  const series = inEvent
    .map(entry => [entry.time, gainedSince(baselineMetrics, entry.metrics)])
    .slice(-MAX_SERIES_POINTS);

  return { baselineMetrics, series };
}

// Rebuilds one chunk of players per call, mirroring the tracker's cursor
// approach so a sweep stays inside WOM rate limits and Cloudflare subrequest
// limits (one WOM call per player).
export async function processTimelineChunk(env, { force = false } = {}) {
  const [tracker, settings] = await Promise.all([
    getTrackerState(env),
    getTrackerSettings(env)
  ]);

  const revealMs = settings.boardRevealAt ? new Date(settings.boardRevealAt).getTime() : NaN;
  if (!Number.isFinite(revealMs)) {
    return { waiting: true, reason: "No board reveal time is set." };
  }

  const now = Date.now();
  if (now < revealMs) {
    return { waiting: true, reason: "The timeline starts at board reveal.", startsAt: settings.boardRevealAt };
  }

  const state = await getTimelineState(env);

  // A changed reveal time means a different event: the old series is meaningless.
  if (state.revealAt && state.revealAt !== settings.boardRevealAt) resetSeries(state);
  state.revealAt = settings.boardRevealAt;

  const playerIds = Object.keys(tracker.players)
    .filter(id => tracker.players[id]?.rsn)
    .sort();

  if (!playerIds.length) {
    return { waiting: true, reason: "No players have a resolved RuneScape name yet." };
  }

  if (!state.cycleStartedAt) {
    const lastCompleted = state.lastCompletedAt ? new Date(state.lastCompletedAt).getTime() : 0;
    if (!force && lastCompleted && now - lastCompleted < REBUILD_INTERVAL_MS) {
      return { skipped: true, reason: "Rebuilt recently.", lastCompletedAt: state.lastCompletedAt };
    }
    state.cycleStartedAt = new Date(now).toISOString();
    state.cursor = 0;
  }

  const chunk = playerIds.slice(state.cursor, state.cursor + TIMELINE_CHUNK_SIZE);
  const processed = [];
  const failures = [];

  for (const discordId of chunk) {
    const player = tracker.players[discordId];
    const identity = {
      rsn: player.rsn,
      displayName: player.displayName,
      team: player.team === "team2" ? "team2" : "team1"
    };

    // A staff RSN change invalidates whatever history we hold for this member.
    const previous = state.players[discordId];
    const reusable = previous && previous.rsn === player.rsn
      && previous.baselineMetrics && previous.series?.length
      ? previous
      : null;

    const failed = message => {
      failures.push({ discordId, rsn: player.rsn, error: message, keptHistory: Boolean(reusable) });
      // Wise Old Man rate-limits hard during a rebuild. A transient failure must
      // not drop a player out of the chart - keep the history already fetched
      // and let the next rebuild refresh it.
      return reusable
        ? { ...reusable, ...identity, error: null }
        : { ...identity, baselineMetrics: null, series: [], error: message };
    };

    let entry;
    try {
      const result = await fetchPlayerSeries(env, player.rsn, revealMs, now);
      if (result.error) {
        entry = failed(result.error);
      } else {
        entry = { ...identity, baselineMetrics: result.baselineMetrics, series: result.series, error: null };
        processed.push({ discordId, rsn: player.rsn, points: result.series.length });
      }
    } catch {
      entry = failed("Wise Old Man request failed.");
    }

    state.players[discordId] = entry;
    state.cursor += 1;
  }

  // Drop players who have left the roster so their kills stop counting.
  for (const id of Object.keys(state.players)) {
    if (!tracker.players[id]) delete state.players[id];
  }

  let cycleComplete = false;
  if (state.cursor >= playerIds.length) {
    state.cursor = 0;
    state.cycleStartedAt = null;
    state.lastCompletedAt = new Date(now).toISOString();
    state.rollup = buildRollup(state, revealMs, now);
    cycleComplete = true;
  }

  await saveTimelineState(env, state);

  return {
    success: true,
    processed,
    failures,
    cursor: state.cursor,
    totalPlayers: playerIds.length,
    cycleComplete
  };
}

// Extends the series from a finished tracker sweep. Costs no WOM calls: the
// tracker has already fetched everyone. Stores the same absolute totals the
// backfill stores, so both writers stay consistent and a later rebuild simply
// replaces these points with the WOM-derived ones.
export async function appendTimelinePoint(env, trackerState) {
  const state = await getTimelineState(env);
  if (!state.revealAt || !Object.keys(state.players).length) return { skipped: true };

  const revealMs = new Date(state.revealAt).getTime();
  if (!Number.isFinite(revealMs)) return { skipped: true };

  const now = Date.now();
  let appended = 0;

  for (const [discordId, player] of Object.entries(trackerState.players || {})) {
    const entry = state.players[discordId];
    if (!entry || entry.error || !entry.baselineMetrics || !player?.current) continue;

    const time = new Date(player.current.at || now).getTime();
    if (!Number.isFinite(time) || time <= revealMs) continue;

    const last = entry.series[entry.series.length - 1];
    if (last && time - last[0] < STEP_MS / 2) continue;

    // Measured against the timeline's own baseline, not the tracker's, so the
    // series stays internally consistent with the backfilled points.
    entry.series.push([time, gainedSince(entry.baselineMetrics, eventMetricsFromTrackerSnapshot(player.current))]);
    if (entry.series.length > MAX_SERIES_POINTS) {
      entry.series.splice(0, entry.series.length - MAX_SERIES_POINTS);
    }
    appended += 1;
  }

  if (!appended) return { skipped: true };

  state.rollup = buildRollup(state, revealMs, now);
  await saveTimelineState(env, state);
  return { appended };
}

export function buildTimelineResponse(state, settings) {
  const untracked = Object.values(state.players).filter(player => player.error);

  return {
    ready: Boolean(state.rollup?.points?.length),
    revealAt: state.revealAt,
    builtAt: state.rollup?.builtAt || null,
    lastCompletedAt: state.lastCompletedAt,
    rebuilding: Boolean(state.cycleStartedAt),
    stepMinutes: STEP_MS / 60000,
    settings: {
      teamOneName: settings.teamOneName,
      teamTwoName: settings.teamTwoName
    },
    points: state.rollup?.points || [],
    playerCount: state.rollup?.playerCount || 0,
    failedCount: untracked.length
  };
}
