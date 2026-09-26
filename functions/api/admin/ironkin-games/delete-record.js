import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

function recalculateTeamPoints(state) {
  for (const team of state.teams || []) {
    team.points = (state.submissions || [])
      .filter(submission => submission.teamId === team.id && submission.status === "approved")
      .reduce((total, submission) => total + (Number(submission.points) || 0), 0);
  }
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const type = String(body.type || "");
  const id = String(body.id || "");
  if (!id || !["session", "submission"].includes(type)) {
    return Response.json({ error: "Choose a valid record to delete." }, { status: 400 });
  }

  const state = await loadGames(env);

  if (type === "session") {
    const sessions = state.sessions || [];
    const target = sessions.find(item => String(item.id) === id);
    if (!target) {
      return Response.json({ error: "Attempt not found." }, { status: 404 });
    }

    if (target.type === "boss-rush") {
      // A Boss Rush attempt is the record used to calculate attempts remaining.
      // Remove the selected attempt plus any duplicate copy of the same logical
      // attempt so an admin reset immediately gives the player their attempt back.
      state.sessions = sessions.filter(item => {
        if (String(item.id) === id) return false;
        return !(
          item.type === "boss-rush" &&
          String(item.weekId || "") === String(target.weekId || "") &&
          String(item.challengeId || "") === String(target.challengeId || "") &&
          String(item.playerDiscordId || "") === String(target.playerDiscordId || "") &&
          Number(item.attemptNumber || 0) === Number(target.attemptNumber || 0)
        );
      });
    } else {
      state.sessions = sessions.filter(item => String(item.id) !== id);
    }
  } else {
    const before = (state.submissions || []).length;
    state.submissions = (state.submissions || []).filter(item => String(item.id) !== id);
    if (state.submissions.length === before) {
      return Response.json({ error: "Submission not found." }, { status: 404 });
    }
    recalculateTeamPoints(state);
  }

  await saveGames(env, state);
  return Response.json({ ok: true, state });
}
