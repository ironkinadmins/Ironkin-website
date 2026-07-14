import { getSession, isStaffSession } from "../_auth.js";
import { getTrackerSettings } from "./_bossTracker.js";
import {
  buildTimelineResponse,
  getTimelineState,
  processTimelineChunk
} from "./_bossTimeline.js";

// Mirrors the tracker endpoint: an unset secret leaves the refresh open, which
// is the existing behaviour for the cron-driven endpoints on this site.
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
    getTimelineState(env),
    getTrackerSettings(env)
  ]);

  return Response.json(buildTimelineResponse(state, settings), {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  const isStaff = isStaffSession(session);

  if (!isStaff && !hasValidSecret(request, env)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = isStaff && url.searchParams.get("force") === "1";

  return Response.json(await processTimelineChunk(env, { force }));
}
