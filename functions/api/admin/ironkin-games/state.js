import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

function validateWeekChallengeWindows(weeks){
  if(!Array.isArray(weeks)) return null;
  for(let wi=0;wi<weeks.length;wi++){
    const w=weeks[wi]||{};
    const challenges=Array.isArray(w.challenges)?w.challenges:[];
    if(!challenges.length) continue;
    const ws=new Date(w.startDate).getTime();
    const we=new Date(w.endDate).getTime();
    if(!Number.isFinite(ws)||!Number.isFinite(we)||we<=ws){
      return `Week ${wi+1} needs a valid start and end date before challenges can be saved.`;
    }
    for(let ci=0;ci<challenges.length;ci++){
      const c=challenges[ci]||{};
      const label=c.name||`Challenge ${ci+1}`;
      for(const [field,value] of [["opensAt",c.opensAt],["closesAt",c.closesAt]]){
        if(!value) continue;
        const t=new Date(value).getTime();
        if(!Number.isFinite(t)||t<ws||t>we){
          return `${label} ${field} must be inside ${w.name||`Week ${wi+1}`}.`;
        }
      }
      if(c.opensAt&&c.closesAt&&new Date(c.closesAt).getTime()<new Date(c.opensAt).getTime()){
        return `${label} cannot close before it opens.`;
      }
    }
  }
  return null;
}

export async function onRequestGet({request,env}){
  if(!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  return Response.json(await loadGames(env),{headers:{"Cache-Control":"no-store"}});
}

export async function onRequestPost({request,env}){
  if(!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object") return Response.json({error:"Invalid state."},{status:400});
  const weekError=validateWeekChallengeWindows(body.weeks);
  if(weekError) return Response.json({error:weekError},{status:400});
  const current=await loadGames(env);
  const next={...current,...body,updatedAt:new Date().toISOString()};
  await saveGames(env,next);
  return Response.json({ok:true,state:next});
}
