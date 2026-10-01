import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

function memberId(value) {
  return String(value?.discordId || value?.id || "");
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const playerId = String(body.playerId || "").trim();
  if (!playerId) return Response.json({ error: "Player ID is required." }, { status: 400 });

  const state = await loadGames(env);
  const signup = (state.signups || []).find(player => memberId(player) === playerId);
  if (!signup) return Response.json({ error: "That signup could not be found." }, { status: 404 });

  const removedName = signup.rsn || signup.displayName || "Player";
  state.signups = (state.signups || []).filter(player => memberId(player) !== playerId);

  let removedFromTeam = false;
  state.teams = (state.teams || []).map(team => {
    const before = (team.members || []).length;
    const members = (team.members || []).filter(member => memberId(member) !== playerId);
    if (members.length !== before) removedFromTeam = true;
    return {
      ...team,
      members,
      captainDiscordId: String(team.captainDiscordId || "") === playerId ? "" : team.captainDiscordId
    };
  });

  await saveGames(env, state);
  return Response.json({ ok: true, removedName, removedFromTeam, state }, { headers: { "Cache-Control": "no-store" } });
}
