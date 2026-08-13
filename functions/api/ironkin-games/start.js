import { getSession, isStaffSession } from "../_auth.js";
import { loadGames, saveGames, memberTeam, challengeFor } from "./_store.js";

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({error:"Sign in with Discord first."},{status:401});
  const state = await loadGames(env);
  const team = memberTeam(state, session);
  const staff = isStaffSession(session);
  const body = await request.json().catch(() => ({}));
  const { week, challenge } = challengeFor(state, body.weekId, body.challengeId);
  if (!week || !challenge) return Response.json({error:"Challenge not found."},{status:404});
  if (!team && !staff) return Response.json({error:"You are not assigned to an Ironkin Games team."},{status:403});
  const teamId = staff && body.teamId ? String(body.teamId) : team.id;
  const allowedTeam = (state.teams || []).find(t => t.id === teamId);
  if (!allowedTeam) return Response.json({error:"Team not found."},{status:400});
  if (!staff && String(allowedTeam.captainDiscordId || "") && String(allowedTeam.captainDiscordId) !== String(session.id)) {
    return Response.json({error:"Only your team captain can start a Main Challenge."},{status:403});
  }
  const now = Date.now();
  if (!staff && challenge.opensAt && now < new Date(challenge.opensAt).getTime()) return Response.json({error:"This challenge window has not opened yet."},{status:409});
  if (!staff && challenge.closesAt && now > new Date(challenge.closesAt).getTime()) return Response.json({error:"This challenge window is closed."},{status:409});
  const existing = (state.sessions || []).find(s => s.weekId===week.id && s.challengeId===challenge.id && s.teamId===teamId);
  if (existing?.startedAt) return Response.json({error:"Your team has already started this challenge.", session:existing},{status:409});
  if (!staff && !existing?.scheduledAt) return Response.json({error:"Your captain must book an attempt slot before starting."},{status:409});
  if (!staff && existing?.scheduledAt) {
    const scheduled = new Date(existing.scheduledAt).getTime();
    if (now < scheduled - 15 * 60000) return Response.json({error:"Your challenge reveal unlocks 15 minutes before the booked start time."},{status:409});
    if (now > scheduled + 30 * 60000) return Response.json({error:"The booked start window has passed. Ask staff to reset or reschedule it."},{status:409});
  }
  const duration = Math.max(1, Number(challenge.durationMinutes || 60));
  const startedAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + duration * 60000).toISOString();
  const created = { ...(existing || {}), id:existing?.id || crypto.randomUUID(), weekId:week.id, challengeId:challenge.id, teamId, scheduledAt:existing?.scheduledAt || "", startedAt, endsAt, startedBy:String(session.id), status:"running" };
  state.sessions = [...(state.sessions || []).filter(s => !(s.weekId===week.id && s.challengeId===challenge.id && s.teamId===teamId)), created];
  await saveGames(env,state);
  return Response.json({ok:true, session:created, challenge:{ id:challenge.id,name:challenge.name,objective:challenge.objective||"",instructions:challenge.instructions||"",rules:challenge.rules||[],durationMinutes:duration }},{headers:{"Cache-Control":"no-store"}});
}
