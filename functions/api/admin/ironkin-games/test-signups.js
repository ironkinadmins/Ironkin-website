import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

const TEST_PREFIX = "ironkin-test-";

const TEST_SIGNUPS = [
  { discordId:"ironkin-test-1", displayName:"Test Player 1", rsn:"TestPlayer1", ehp:800, ehb:200, totalLevel:2277, timezone:"America/New_York", isTestSignup:true },
  { discordId:"ironkin-test-2", displayName:"Test Player 2", rsn:"TestPlayer2", ehp:650, ehb:450, totalLevel:2200, timezone:"America/Toronto", isTestSignup:true },
  { discordId:"ironkin-test-3", displayName:"Test Player 3", rsn:"TestPlayer3", ehp:500, ehb:600, totalLevel:2150, timezone:"America/Chicago", isTestSignup:true },
  { discordId:"ironkin-test-4", displayName:"Test Player 4", rsn:"TestPlayer4", ehp:400, ehb:300, totalLevel:2050, timezone:"America/Los_Angeles", isTestSignup:true },
  { discordId:"ironkin-test-5", displayName:"Test Player 5", rsn:"TestPlayer5", ehp:300, ehb:750, totalLevel:1950, timezone:"Europe/London", isTestSignup:true },
  { discordId:"ironkin-test-6", displayName:"Test Player 6", rsn:"TestPlayer6", ehp:200, ehb:150, totalLevel:1850, timezone:"America/Halifax", isTestSignup:true },
  { discordId:"ironkin-test-7", displayName:"Test Player 7", rsn:"TestPlayer7", ehp:100, ehb:500, totalLevel:1750, timezone:"America/Edmonton", isTestSignup:true },
  { discordId:"ironkin-test-8", displayName:"Test Player 8", rsn:"TestPlayer8", ehp:50, ehb:50, totalLevel:1600, timezone:"America/Vancouver", isTestSignup:true }
];

function isTestPlayer(player) {
  return player?.isTestSignup === true || String(player?.discordId || player?.id || "").startsWith(TEST_PREFIX);
}

function removeTestPlayers(state) {
  state.signups = (state.signups || []).filter(player => !isTestPlayer(player));
  state.teams = (state.teams || []).map(team => ({
    ...team,
    members: (team.members || []).filter(member => !isTestPlayer(member))
  }));
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error:"Staff only." }, { status:403 });
  }

  const state = await loadGames(env);
  if (state.rosterLocked) {
    return Response.json({ error:"Teams are locked. Unlock the roster before using test signups." }, { status:409 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "generate") {
    removeTestPlayers(state);
    state.signups = [...(state.signups || []), ...TEST_SIGNUPS.map(player => ({ ...player }))];
    await saveGames(env, state);
    return Response.json({ ok:true, state }, { headers:{"Cache-Control":"no-store"} });
  }

  if (action === "remove") {
    removeTestPlayers(state);
    await saveGames(env, state);
    return Response.json({ ok:true, state }, { headers:{"Cache-Control":"no-store"} });
  }

  return Response.json({ error:"Unknown test signup action." }, { status:400 });
}
