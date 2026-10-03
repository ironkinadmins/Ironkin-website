import { getSession, isStaffSession } from "../_auth.js";
import { loadGames, memberTeam } from "./_store.js";
import { shoppingEventId, shoppingItems, shoppingSubmissionRows, shoppingTeamProgress } from "./_shoppingList.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in required." }, { status:401 });
  const state = await loadGames(env);
  const url = new URL(request.url);
  const staff = isStaffSession(session);
  const testMode = staff && url.searchParams.get("test") === "1";
  let team = memberTeam(state, session);
  if (testMode) team = (state.teams || []).find(t => String(t.id) === String(url.searchParams.get("testTeamId") || "")) || team;
  if (!team) return Response.json({ error:"You are not assigned to an Ironkin Games team." }, { status:403 });
  const weekId = String(url.searchParams.get("weekId") || "");
  const challengeId = String(url.searchParams.get("challengeId") || "");
  const week = (state.weeks || []).find(w => String(w.id) === weekId);
  const challenge = (week?.challenges || []).find(c => String(c.id) === challengeId && String(c.trackerType || "") === "shopping-list");
  if (!week || !challenge) return Response.json({ error:"Shopping List challenge not found." }, { status:404 });
  const now = Date.now(), start = new Date(challenge.opensAt || week.startDate || 0).getTime(), end = new Date(challenge.closesAt || week.endDate || 0).getTime();
  const isOpen = testMode || ((!Number.isFinite(start) || now >= start) && (!Number.isFinite(end) || now <= end));
  if (!isOpen) return Response.json({ error:"This Shopping List is not currently available." }, { status:403 });
  const eventId = shoppingEventId(week.id, challenge.id, team.id);
  const rows = await shoppingSubmissionRows(env, eventId);
  const items = shoppingTeamProgress(state, team, challenge, rows);
  return Response.json({
    ok:true, eventId, teamId:team.id, teamName:team.name, isOpen,
    found:items.filter(x=>x.status==="approved").length,
    pending:items.filter(x=>x.status==="pending").length,
    total:shoppingItems(challenge).length,
    items
  }, { headers:{"Cache-Control":"no-store"} });
}
