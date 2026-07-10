import { getSession, isStaffSession } from "../_auth.js";
import {
  buildSummary,
  getSignups,
  getTrackerSettings,
  getTrackerState,
  processChunk,
  syncRoster
} from "./_bossTracker.js";

function hasValidSecret(request, env) {
  const expected = String(env.BINGO_TRACKER_SECRET || "").trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided =
    String(request.headers.get("X-Bingo-Tracker-Secret") || "").trim() ||
    String(url.searchParams.get("secret") || "").trim();
  return provided === expected;
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return Response.json(
      { error: "Sign in with Discord to view Battleship Bingo stats." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const [state, settings] = await Promise.all([
    getTrackerState(env),
    getTrackerSettings(env)
  ]);

  return Response.json(buildSummary(state, settings));
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  const isStaff = isStaffSession(session);

  if (!isStaff && !hasValidSecret(request, env)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [state, settings, signups] = await Promise.all([
    getTrackerState(env),
    getTrackerSettings(env),
    getSignups(env)
  ]);

  if (settings.active !== true) {
    return Response.json({ waiting: true, reason: "Bingo is not active." });
  }

  // Hold the baseline until the competition actually starts (board reveal),
  // so kills before the event never count toward the totals.
  if (!state.startedAt && settings.boardRevealAt) {
    const revealTime = new Date(settings.boardRevealAt).getTime();
    if (Number.isFinite(revealTime) && Date.now() < revealTime) {
      return Response.json({
        waiting: true,
        reason: "Tracking starts at board reveal.",
        startsAt: settings.boardRevealAt
      });
    }
  }

  syncRoster(state, signups);

  const url = new URL(request.url);
  const force = isStaff && url.searchParams.get("force") === "1";
  const result = await processChunk(env, state, { force });

  return Response.json(result);
}
