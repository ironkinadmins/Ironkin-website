import { getSession } from "../_auth.js";
import { loadGames, saveGames, memberTeam, challengeFor } from "./_store.js";

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({error:"Sign in with Discord first."},{status:401});
  const state = await loadGames(env); const team = memberTeam(state,session);
  if (!team) return Response.json({error:"You are not assigned to a team."},{status:403});
  const body = await request.json().catch(() => ({}));
  const { week, challenge } = challengeFor(state,body.weekId,body.challengeId);
  if (!week || !challenge) return Response.json({error:"Challenge not found."},{status:404});
  const proofUrl = String(body.proofUrl||"").trim().slice(0,1000);
  const score = String(body.score||"").trim().slice(0,120);
  const notes = String(body.notes||"").trim().slice(0,1500);
  if (!proofUrl && challenge.proofRequired !== false) return Response.json({error:"A VOD or proof link is required."},{status:400});
  const sessionRun = (state.sessions||[]).find(s=>s.weekId===week.id&&s.challengeId===challenge.id&&s.teamId===team.id);
  if (challenge.kind !== "side" && !sessionRun?.startedAt) return Response.json({error:"Your team has not started this Main Challenge."},{status:409});
  const submission = { id:crypto.randomUUID(),weekId:week.id,challengeId:challenge.id,teamId:team.id,submittedBy:String(session.id),submittedAt:new Date().toISOString(),score,proofUrl,notes,status:"pending",points:null,placement:null,staffNote:"" };
  state.submissions = [...(state.submissions||[]).filter(s=>!(s.weekId===week.id&&s.challengeId===challenge.id&&s.teamId===team.id)),submission];
  if (sessionRun) { sessionRun.status="submitted"; sessionRun.submittedAt=submission.submittedAt; }
  await saveGames(env,state);
  return Response.json({ok:true,submission});
}
