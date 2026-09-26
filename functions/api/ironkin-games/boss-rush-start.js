import { getSession } from "../_auth.js";
import { loadGames, saveGames, memberTeam, challengeFor } from "./_store.js";
import { memberForSession, updateAndReadBosses } from "./_bossRush.js";

export async function onRequestPost({request,env}) {
  const session=await getSession(request,env); if(!session)return Response.json({error:"Sign in with Discord first."},{status:401});
  const body=await request.json().catch(()=>({})), state=await loadGames(env), team=memberTeam(state,session);
  if(!team)return Response.json({error:"You are not assigned to an Ironkin Games team."},{status:403});
  const {week,challenge}=challengeFor(state,body.weekId,body.challengeId);
  if(!week||!challenge||challenge.trackingMode!=="boss-rush")return Response.json({error:"Boss Rush challenge not found."},{status:404});
  const now=Date.now();
  if(challenge.opensAt&&now<new Date(challenge.opensAt).getTime())return Response.json({error:"Boss Rush has not opened yet."},{status:409});
  if(challenge.closesAt&&now>new Date(challenge.closesAt).getTime())return Response.json({error:"Boss Rush is closed."},{status:409});
  const player=memberForSession(team,session); if(!player)return Response.json({error:"Your Discord account is not linked to a rostered RSN."},{status:409});
  const attempts=Math.max(1,Number(challenge.attemptsPerPlayer||1));
  const mine=(state.sessions||[]).filter(s=>s.type==="boss-rush"&&s.weekId===week.id&&s.challengeId===challenge.id&&String(s.playerDiscordId)===String(session.id));
  if(mine.length>=attempts)return Response.json({error:`You have already used your ${attempts} Boss Rush attempt${attempts===1?"":"s"}.`},{status:409});
  if(mine.some(s=>s.status==="running"))return Response.json({error:"You already have a Boss Rush attempt in progress."},{status:409});
  let baseline; try{baseline=await updateAndReadBosses(env,player.rsn||player.name);}catch(e){return Response.json({error:e.message},{status:502});}
  const duration=Math.max(1,Number(challenge.durationMinutes||30)), startedAt=new Date().toISOString(), endsAt=new Date(Date.now()+duration*60000).toISOString();
  const created={id:crypto.randomUUID(),type:"boss-rush",weekId:week.id,challengeId:challenge.id,teamId:team.id,playerDiscordId:String(session.id),playerName:player.name||player.rsn||"Player",rsn:baseline.rsn,attemptNumber:mine.length+1,durationMinutes:duration,startedAt,endsAt,status:"running",baselineBosses:baseline.bosses,baselineWomSnapshotAt:baseline.womSnapshotAt||"",bossGains:{},completedBosses:[]};
  state.sessions=[...(state.sessions||[]),created]; await saveGames(env,state);
  return Response.json({ok:true,attempt:created},{headers:{"Cache-Control":"no-store"}});
}
