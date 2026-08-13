import { getSession } from "../_auth.js";
import { loadGames, saveGames, memberTeam, challengeFor } from "./_store.js";
export async function onRequestPost({request,env}){
  const session=await getSession(request,env); if(!session)return Response.json({error:"Sign in with Discord first."},{status:401});
  const state=await loadGames(env),team=memberTeam(state,session); if(!team)return Response.json({error:"You are not assigned to a team."},{status:403});
  if(String(team.captainDiscordId||"") && String(team.captainDiscordId)!==String(session.id)) return Response.json({error:"Only your team captain can book the Main Challenge slot."},{status:403});
  const b=await request.json().catch(()=>({})),{week,challenge}=challengeFor(state,b.weekId,b.challengeId); if(!week||!challenge||challenge.kind==="side")return Response.json({error:"Main Challenge not found."},{status:404});
  const scheduled=new Date(b.scheduledAt); if(!Number.isFinite(scheduled.getTime()))return Response.json({error:"Choose a valid start time."},{status:400});
  const open=challenge.opensAt?new Date(challenge.opensAt).getTime():-Infinity,close=challenge.closesAt?new Date(challenge.closesAt).getTime():Infinity,duration=Math.max(1,Number(challenge.durationMinutes||60))*60000;
  if(scheduled.getTime()<open || scheduled.getTime()+duration>close) return Response.json({error:"That slot falls outside the challenge window."},{status:409});
  const old=(state.sessions||[]).find(s=>s.weekId===week.id&&s.challengeId===challenge.id&&s.teamId===team.id);
  if(old?.startedAt)return Response.json({error:"This attempt has already started and cannot be rescheduled."},{status:409});
  const booking={...(old||{}),id:old?.id||crypto.randomUUID(),weekId:week.id,challengeId:challenge.id,teamId:team.id,scheduledAt:scheduled.toISOString(),bookedAt:new Date().toISOString(),bookedBy:String(session.id),status:"scheduled"};
  state.sessions=[...(state.sessions||[]).filter(s=>!(s.weekId===week.id&&s.challengeId===challenge.id&&s.teamId===team.id)),booking]; await saveGames(env,state); return Response.json({ok:true,session:booking});
}
