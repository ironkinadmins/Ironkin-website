import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

function validateChallenge(week, challenge){
  const ws=new Date(week?.startDate).getTime();
  const we=new Date(week?.endDate).getTime();
  if(!Number.isFinite(ws)||!Number.isFinite(we)||we<=ws) return "Save valid week start/end dates before saving this challenge.";
  for(const [label,value] of [["opening",challenge?.opensAt],["closing",challenge?.closesAt]]){
    if(!value) continue;
    const t=new Date(value).getTime();
    if(!Number.isFinite(t)||t<ws||t>we) return `Challenge ${label} time must be inside ${week.name||"its week"}.`;
  }
  if(challenge?.opensAt&&challenge?.closesAt&&new Date(challenge.closesAt).getTime()<new Date(challenge.opensAt).getTime()) return "Challenge cannot close before it opens.";
  return "";
}

export async function onRequestPost({request,env}){
  if(!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body?.weekId||!body?.challenge?.id) return Response.json({error:"Week and challenge are required."},{status:400});
  const state=await loadGames(env);
  const week=(state.weeks||[]).find(w=>String(w.id)===String(body.weekId));
  if(!week) return Response.json({error:"Week not found."},{status:404});
  const index=(week.challenges||[]).findIndex(c=>String(c.id)===String(body.challenge.id));
  const err=validateChallenge(week,body.challenge);
  if(err) return Response.json({error:err},{status:400});
  if(index>=0) week.challenges[index]={...week.challenges[index],...body.challenge};
  else { week.challenges=Array.isArray(week.challenges)?week.challenges:[]; week.challenges.push(body.challenge); }
  state.updatedAt=new Date().toISOString();
  await saveGames(env,state);
  return Response.json({ok:true,state});
}
