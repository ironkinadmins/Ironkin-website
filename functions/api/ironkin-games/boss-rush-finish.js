import { getSession, isStaffSession } from "../_auth.js";
import { loadGames, saveGames } from "./_store.js";
import { updateAndReadBosses, bossGains } from "./_bossRush.js";

export async function onRequestPost({request,env}) {
  const session=await getSession(request,env); if(!session)return Response.json({error:"Sign in with Discord first."},{status:401});
  const body=await request.json().catch(()=>({})), state=await loadGames(env);
  const attempt=(state.sessions||[]).find(s=>s.id===body.attemptId&&s.type==="boss-rush");
  if(!attempt)return Response.json({error:"Boss Rush attempt not found."},{status:404});
  if(!isStaffSession(session)&&String(attempt.playerDiscordId)!==String(session.id))return Response.json({error:"That is not your attempt."},{status:403});
  if(attempt.status==="completed")return Response.json({ok:true,attempt});
  if(Date.now()<new Date(attempt.endsAt).getTime()&&!isStaffSession(session))return Response.json({error:"Your attempt is still in progress."},{status:409});
  let ending; try{ending=await updateAndReadBosses(env,attempt.rsn);}catch(e){return Response.json({error:e.message},{status:502});}
  const gains=bossGains(attempt.baselineBosses||{},ending.bosses||{}), completedBosses=Object.keys(gains);
  const finishedAt=Date.now(), endedAt=new Date(attempt.endsAt).getTime(), graceMs=3*60*1000;
  const late=Number.isFinite(endedAt)&&finishedAt>endedAt+graceMs;
  attempt.endingBosses=ending.bosses; attempt.endingWomSnapshotAt=ending.womSnapshotAt||""; attempt.bossGains=gains; attempt.completedBosses=completedBosses; attempt.completedAt=new Date(finishedAt).toISOString(); attempt.late=late; attempt.reviewStatus=late?"staff-review":"accepted"; attempt.status=late?"late_review":"completed";
  await saveGames(env,state);
  return Response.json({ok:true,late,attempt},{headers:{"Cache-Control":"no-store"}});
}
