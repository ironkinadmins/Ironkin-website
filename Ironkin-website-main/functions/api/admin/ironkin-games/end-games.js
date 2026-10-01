import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

function buildFinalData(state) {
  const teams = state.teams || [];
  const approved = (state.submissions || []).filter(s => String(s.status || "").toLowerCase() === "approved");
  const totals = new Map(teams.map(t => [String(t.id), 0]));
  const wins = new Map(teams.map(t => [String(t.id), 0]));
  const progression = [];

  for (const week of state.weeks || []) {
    const weekSubs = approved.filter(s => String(s.weekId) === String(week.id));
    for (const sub of weekSubs) totals.set(String(sub.teamId), (totals.get(String(sub.teamId)) || 0) + (Number(sub.points) || 0));

    for (const challenge of week.challenges || []) {
      const rows = weekSubs.filter(s => String(s.challengeId) === String(challenge.id));
      if (!rows.length) continue;
      const best = Math.max(...rows.map(r => Number(r.points) || 0));
      if (best <= 0) continue;
      for (const row of rows.filter(r => (Number(r.points) || 0) === best)) wins.set(String(row.teamId), (wins.get(String(row.teamId)) || 0) + 1);
    }

    progression.push({
      weekId: String(week.id),
      weekName: String(week.name || "Week"),
      totals: Object.fromEntries(teams.map(t => [String(t.id), totals.get(String(t.id)) || 0]))
    });
  }

  const rows = teams.map(team => ({
    teamId: String(team.id),
    teamName: String(team.name || "Team"),
    points: totals.get(String(team.id)) || 0,
    wins: wins.get(String(team.id)) || 0
  })).sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));

  let previousPoints = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    if (previousPoints === null || row.points !== previousPoints) previousRank = index + 1;
    row.rank = previousRank;
    previousPoints = row.points;
  });
  return { finalStandings: rows, finalProgression: progression };
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return Response.json({ error: "Staff only." }, { status: 403 });

  const state = await loadGames(env);
  if (state.gamesCompleted) return Response.json({ error: "Ironkin Games have already been ended." }, { status: 409 });

  const weeks = state.weeks || [];
  if (!weeks.length) return Response.json({ error: "No weeks are configured." }, { status: 400 });

  const published = new Set((state.publishedResultWeeks || []).map(String));
  const missing = weeks.filter(w => !published.has(String(w.id)));
  if (missing.length) {
    return Response.json({ error: `Publish all week results first. Still unpublished: ${missing.map(w => w.name || w.id).join(", ")}.` }, { status: 400 });
  }

  const pending = (state.submissions || []).filter(s => !["approved", "rejected"].includes(String(s.status || "").toLowerCase()));
  if (pending.length) return Response.json({ error: `Review all submitted results first. ${pending.length} submission(s) are still pending.` }, { status: 400 });

  const approvedCount = (state.submissions || []).filter(s => String(s.status || "").toLowerCase() === "approved").length;
  if (!approvedCount) return Response.json({ error: "At least one approved result is required before the Games can be ended." }, { status: 400 });

  const { finalStandings, finalProgression } = buildFinalData(state);
  if (!finalStandings.length) return Response.json({ error: "No teams are configured." }, { status: 400 });

  const winningPoints = finalStandings[0].points;
  const champions = finalStandings.filter(r => r.points === winningPoints);
  const completedAt = new Date().toISOString();

  state.gamesCompleted = true;
  state.completedAt = completedAt;
  state.finalStandings = finalStandings;
  state.finalProgression = finalProgression;
  state.winnerTeamId = champions[0]?.teamId || "";
  state.winnerTeamIds = champions.map(r => r.teamId);
  state.winnerTeamName = champions.length === 1 ? champions[0].teamName : champions.map(r => r.teamName).join(" & ");
  state.signupOpen = false;
  state.rosterLocked = true;
  state.autoBalanceSignups = false;

  await saveGames(env, state);

  return Response.json({
    ok: true,
    gamesCompleted: true,
    completedAt,
    champions,
    finalStandings,
    finalProgression
  });
}
