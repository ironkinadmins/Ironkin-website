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
    const before = (state.sessions || []).length;
    state.sessions = (state.sessions || []).filter(item => String(item.id) !== id);
    if (state.sessions.length === before) {
      return Response.json({ error: "Attempt not found." }, { status: 404 });
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
