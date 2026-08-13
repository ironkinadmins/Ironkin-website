import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames, balanceSignups } from "../../ironkin-games/_store.js";

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error:"Staff only." }, { status:403 });
  }
  const state = await loadGames(env);
  if (state.rosterLocked) return Response.json({ error:"Teams are locked. Unlock the roster before balancing again." }, { status:409 });
  balanceSignups(state);
  await saveGames(env, state);
  return Response.json({ ok:true, state }, { headers:{"Cache-Control":"no-store"} });
}
