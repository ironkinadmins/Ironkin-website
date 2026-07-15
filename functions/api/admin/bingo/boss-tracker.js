import { getSession, isStaffSession } from "../../_auth.js";
import {
  buildSummary,
  fetchWomSnapshots,
  getSignups,
  getTrackerSettings,
  getTrackerState,
  saveTrackerState,
  syncRoster,
  trackerSnapshotFromWomSnapshot
} from "../../bingo/_bossTracker.js";

const RSN_PATTERN = /^[a-zA-Z0-9 _-]{1,12}$/;

// Look back far enough to find the event's opening snapshot.
const REPAIR_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

// Rebuilds a member's baseline and current from Wise Old Man's own history
// instead of wiping them.
//
// This is what makes an RSN fix safe mid-event. A plain set-rsn resets the
// baseline to "now", so a member who renames in-game loses every kill they made
// before the fix. WOM keeps its record through a name change, so the true
// opening snapshot is still there to be read back.
//
// The baseline is the first snapshot at or after the reveal - the same one the
// tracker's own first sweep recorded - so a repaired member's totals match what
// they would have been had the rename never happened.
async function repairFromWomHistory(env, player, rsn, settings) {
  const revealMs = settings.boardRevealAt ? new Date(settings.boardRevealAt).getTime() : NaN;
  if (!Number.isFinite(revealMs)) return { error: "No board reveal time is set." };

  const now = Date.now();
  const result = await fetchWomSnapshots(env, rsn, revealMs - REPAIR_LOOKBACK_MS, now + 60 * 1000);
  if (result.error) return { error: result.error };

  const inEvent = result.snapshots.filter(snapshot => new Date(snapshot.createdAt).getTime() >= revealMs);
  if (!inEvent.length) {
    return { error: `Wise Old Man has no history for "${rsn}" since the event started.` };
  }

  player.rsnOverride = rsn;
  player.rsn = rsn;
  player.guessed = false;
  player.error = null;
  player.baseline = trackerSnapshotFromWomSnapshot(inEvent[0]);
  player.current = trackerSnapshotFromWomSnapshot(inEvent[inEvent.length - 1]);
  player.updatedAt = player.current.at;

  return {
    repaired: true,
    baselineAt: player.baseline.at,
    currentAt: player.current.at,
    snapshots: inEvent.length
  };
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim();

  const [state, settings, signups] = await Promise.all([
    getTrackerState(env),
    getTrackerSettings(env),
    getSignups(env)
  ]);
  syncRoster(state, signups);

  let repair = null;

  if (action === "set-rsn") {
    const discordId = String(body.discordId || "").trim();
    const rsn = String(body.rsn || "").trim();
    const player = state.players[discordId];

    if (!player) {
      return Response.json({ error: "That member is not signed up for Bingo." }, { status: 404 });
    }
    if (!RSN_PATTERN.test(rsn)) {
      return Response.json({ error: "RSNs are 1-12 characters: letters, numbers, spaces, - or _." }, { status: 400 });
    }

    // Prefer rebuilding from Wise Old Man's history so the member keeps the
    // kills they made before the fix. Only fall back to a wipe when WOM has
    // nothing to rebuild from (a brand new or genuinely wrong name).
    repair = await repairFromWomHistory(env, player, rsn, settings);

    if (repair.error) {
      // A changed RSN means the old snapshots may belong to the wrong account,
      // so wipe them and let the next refresh take a fresh baseline.
      player.rsnOverride = rsn;
      player.rsn = null;
      player.guessed = false;
      player.baseline = null;
      player.current = null;
      player.error = null;
    }
  } else if (action === "clear-rsn") {
    const discordId = String(body.discordId || "").trim();
    const player = state.players[discordId];

    if (!player) {
      return Response.json({ error: "That member is not signed up for Bingo." }, { status: 404 });
    }

    delete player.rsnOverride;
    player.rsn = null;
    player.guessed = false;
    player.baseline = null;
    player.current = null;
    player.error = null;
  } else if (action === "reset") {
    state.startedAt = null;
    state.lastCompletedAt = null;
    state.cycleStartedAt = null;
    state.cursor = 0;
    for (const player of Object.values(state.players)) {
      player.rsn = null;
      player.guessed = false;
      player.baseline = null;
      player.current = null;
      player.error = null;
    }
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  await saveTrackerState(env, state);

  return Response.json({
    success: true,
    // Tells staff whether the fix kept the member's existing kills or restarted
    // their count, rather than leaving them to guess.
    repair: repair?.repaired
      ? { restored: true, snapshots: repair.snapshots, baselineAt: repair.baselineAt }
      : repair
        ? { restored: false, reason: repair.error }
        : null,
    summary: buildSummary(state, settings)
  });
}
