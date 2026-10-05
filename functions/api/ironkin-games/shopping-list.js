import { getSession, isStaffSession } from "../_auth.js";
import { loadGames, memberTeam } from "./_store.js";
import { shoppingEventId, shoppingItems, shoppingSubmissionRows, shoppingTeamProgress } from "./_shoppingList.js";
import { insertEventSubmission } from "../_supabase.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in required." }, { status:401 });
  const state = await loadGames(env);
  const url = new URL(request.url);
  const staff = isStaffSession(session);
  const testMode = staff && url.searchParams.get("test") === "1";
  let team = memberTeam(state, session);
  const adminTeamId = staff ? String(url.searchParams.get("adminTeamId") || "") : "";
  if (adminTeamId) team = (state.teams || []).find(t => String(t.id) === adminTeamId) || team;
  if (testMode) team = (state.teams || []).find(t => String(t.id) === String(url.searchParams.get("testTeamId") || "")) || team;
  // Staff do not need to be rostered. If no explicit admin team was selected,
  // default the admin Shopping List manager to the first configured team.
  if (!team && staff) team = (state.teams || [])[0] || null;
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
  // Staff Test Mode is a private preview. Never read live Shopping List
  // submissions here, otherwise the preview can expose/live-reflect team results.
  // An empty row set renders every configured objective as still needed while
  // preserving the selected test week/team and the real configured item pool.
  const rows = testMode ? [] : await shoppingSubmissionRows(env, eventId);
  const items = shoppingTeamProgress(state, team, challenge, rows);
  return Response.json({
    ok:true, eventId, teamId:team.id, teamName:team.name, isOpen, testMode, isStaff:staff,
    teams: staff ? (state.teams || []).map(t => ({ id:String(t.id || ""), name:String(t.name || "Team") })).filter(t=>t.id) : [],
    teamMembers: staff ? (team.members || []).map(m => ({ discordId:String(m.discordId || m.id || ""), name:String(m.name || m.rsn || m.displayName || m.discordName || m.discordId || "Member") })).filter(m=>m.discordId) : [],
    found:items.filter(x=>x.status==="approved").length,
    pending:items.filter(x=>x.status==="pending").length,
    total:shoppingItems(challenge).length,
    items
  }, { headers:{"Cache-Control":"no-store"} });
}


export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session || !isStaffSession(session)) return Response.json({ error:"Staff access required." }, { status:403 });
  const body = await request.json().catch(()=>null);
  if (!body) return Response.json({ error:"Invalid request." }, { status:400 });
  const state = await loadGames(env);
  const week = (state.weeks || []).find(w => String(w.id) === String(body.weekId || ""));
  const challenge = (week?.challenges || []).find(c => String(c.id) === String(body.challengeId || "") && String(c.trackerType || "") === "shopping-list");
  const team = (state.teams || []).find(t => String(t.id) === String(body.teamId || ""));
  if (!week || !challenge || !team) return Response.json({ error:"Shopping List/team not found." }, { status:404 });
  const objective = shoppingItems(challenge).find(x => String(x.id) === String(body.objectiveId || ""));
  if (!objective) return Response.json({ error:"Shopping List item not found." }, { status:404 });
  const discordId = String(body.discordId || "");
  const member = (team.members || []).find(m => String(m.discordId || m.id || "") === discordId);
  if (!member) return Response.json({ error:"Choose a member of this team." }, { status:400 });
  const eventId = shoppingEventId(week.id, challenge.id, team.id);
  const rows = await shoppingSubmissionRows(env, eventId);
  const progress = shoppingTeamProgress(state, team, challenge, rows);
  const existing = progress.find(x => x.id === objective.id);
  if (existing && existing.status !== "missing") return Response.json({ error:`${objective.name} is already ${existing.status}.` }, { status:409 });
  const playerName = String(member.name || member.rsn || member.displayName || member.discordName || discordId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await insertEventSubmission(env, {
    id, plugin_event_id:eventId, website_event_id:eventId, event_type:"ironkin-games-shopping-list",
    event_name:String(challenge.name || "Shopping List"), player_name:playerName, discord_id:discordId,
    player_key:discordId.toLowerCase(), item_id:Number(objective.itemId), item_name:objective.name,
    shopping_objective_id:objective.id, quantity:1, participants:[], tracking_rule:"once_per_event",
    client_submission_key:`admin:${id}`, source:"admin", status:"approved", proof_url:"",
    client_timestamp:now, processed_at:now, processed_by:String(session.id || "staff")
  });
  return Response.json({ ok:true, submissionId:id, item:objective.name, playerName });
}
