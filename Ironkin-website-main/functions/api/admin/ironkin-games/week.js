import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

export async function onRequestPost({request,env}){
  if(!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body?.weekId) return Response.json({error:"Week is required."},{status:400});
  const state=await loadGames(env);
  const week=(state.weeks||[]).find(w=>String(w.id)===String(body.weekId));
  if(!week) return Response.json({error:"Week not found."},{status:404});
  const start=new Date(body.startDate).getTime(),end=new Date(body.endDate).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return Response.json({error:"Week needs a valid start and end date."},{status:400});
  for(const c of (week.challenges||[])){
    for(const value of [c.opensAt,c.closesAt]){if(!value)continue;const t=new Date(value).getTime();if(!Number.isFinite(t)||t<start||t>end)return Response.json({error:`${c.name||"A challenge"} must stay inside the new week dates.`},{status:400});}
  }
  week.name=String(body.name||week.name||"");
  week.startDate=body.startDate;
  week.endDate=body.endDate;
  state.updatedAt=new Date().toISOString();
  await saveGames(env,state);
  return Response.json({ok:true,state});
}
