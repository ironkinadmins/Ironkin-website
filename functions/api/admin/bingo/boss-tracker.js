import { getSession, isStaffSession } from "../../_auth.js";
import {
  buildSummary,
  getSignups,
  getTrackerSettings,
  getTrackerState,
  saveTrackerState,
  syncRoster
} from "../../bingo/_bossTracker.js";

const RSN_PATTERN = /^[a-zA-Z0-9 _-]{1,12}$/;

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

    // A changed RSN means the old snapshots may belong to the wrong account,
    // so wipe them and let the next refresh take a fresh baseline.
    player.rsnOverride = rsn;
    player.rsn = null;
    player.guessed = false;
    player.baseline = null;
    player.current = null;
    player.error = null;
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
    summary: buildSummary(state, settings)
  });
}
