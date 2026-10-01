import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";
export async function onRequestPost({request,env}){
  if(!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  const body=await request.json().catch(()=>({})),state=await loadGames(env);
  const week=(state.weeks||[]).find(w=>String(w.id)===String(body.weekId)),lib=(state.challengeLibrary||[]).find(c=>String(c.id)===String(body.libraryId));
  if(!week||!lib) return Response.json({error:"Week or challenge definition not found."},{status:404});
  const instanceId=crypto.randomUUID();
  const instance={...lib,id:instanceId,libraryId:lib.id,sourceChallengeId:undefined,opensAt:week.startDate||"",closesAt:week.endDate||"",results:[]};
  week.challenges=Array.isArray(week.challenges)?week.challenges:[]; week.challenges.push(instance);
  await saveGames(env,state); return Response.json({ok:true,state,challenge:instance});
}
