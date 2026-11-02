import { hybridKv } from "../../_hybridKv.js";
import { TERRITORIES } from "../../ironkin-games/_conquestConfig.js";
import { summaries } from "../../ironkin-games/_conquestEngine.js";
import { getSession, isGamesAdminSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";
import { readTimeTrials, scoreTimeTrials } from "../../ironkin-games/time-trials.js";
import { calculateAutomaticChallenge, automaticSubmission } from "../../ironkin-games/_autoScoring.js";

async function calculateWeek(state,week,env){const challenges=[];
 for(const challenge of week.challenges||[]){
  if(challenge.trackerType!=="territory-conquest")continue;
  const raw=await hybridKv(env,"drops").get("ironkin-games:conquest:2026:week4");
  const conquest=raw?JSON.parse(raw):{teams:{},submissions:[]};
  // Calculate final competitive bonuses without modifying the live Conquest record.
  const snapshot={...conquest,published:true};
  const {scores}=summaries(snapshot,state);
  const scale=state.scoring?.main||[100,75,55,40];
  const rows=(state.teams||[]).map(team=>{const score=scores[team.id]||{};return {teamId:team.id,teamName:team.name,score:Number(score.total)||0,scoreLabel:`${Number(score.total)||0} Conquest points`,breakdown:{territories:(score.unlocked||[]).map(id=>TERRITORIES.find(t=>t.id===id)?.name||id),powersUsed:(score.usedPowers||[]).map(id=>{const territory=TERRITORIES.find(t=>t.id===id);return territory?`${territory.name} — ${territory.power}`:id;})}};});
  rows.sort((a,b)=>b.score-a.score||a.teamName.localeCompare(b.teamName));
  rows.forEach((r,i)=>{r.placement=i+1;r.points=Number(scale[i])||0;});
  challenges.push({challengeId:challenge.id,name:challenge.name,kind:challenge.kind||"main",tracker:"territory-conquest",rows});
 }
for(const challenge of week.challenges||[]){if(String(challenge.trackingMethod||"submissions")!=="automatic")continue;let result;try{result=await calculateAutomaticChallenge(state,week,challenge,env);}catch(error){const detail=error instanceof Error?error.message:String(error);throw new Error(`Failed to calculate "${challenge.name||challenge.id}" (${challenge.trackerType||"unknown tracker"}): ${detail}`);}if(result)challenges.push({challengeId:challenge.id,name:challenge.name,kind:challenge.kind||"main",...result});}for(const challenge of week.challenges||[]){if(!(/time[\s-]*trials/i.test(String(challenge.trackerType||''))||/ironkin time trials/i.test(String(challenge.name||''))))continue;
 const submissions=await readTimeTrials(env,String(week.id),String(challenge.id),false);
 const approved=submissions.filter(r=>r.status==='approved');if(!approved.length)throw new Error(`No approved Time Trials submissions found for ${challenge.name||challenge.id}. Check the live submissions and challenge ID before publishing.`);
 const scored=scoreTimeTrials(state,submissions);
 const standings=scored.standings;
 const mainScale=state.scoring?.main||[100,75,55,40];
 let placement=0,previousTotal=null;
 const rows=standings.map((team,index)=>{if(team.total!==previousTotal)placement+=1;previousTotal=team.total;return {teamId:team.teamId,score:team.total,scoreLabel:`${team.total}/75 Time Trials points`,placement,points:Number(mainScale[placement-1])||0,breakdown:{trials:team.trials,raidCompletion:team.completion,raidSpeed:team.speed,raidBonus:team.bonus,completedRaids:team.completedRaids,approvedSubmissions:submissions.filter(r=>r.status==='approved'&&String(r.teamId)===String(team.teamId)).length,activityResults:scored.activities.map(a=>({name:a.name,results:a.results})),raidResults:scored.raids.map(r=>({name:r.name,teams:r.teams}))}};} );
 challenges.push({challengeId:challenge.id,name:challenge.name,kind:challenge.kind||'main',rows});
 }return challenges;}
export async function onRequestPost({request,env}){const session=await getSession(request,env);if(!isGamesAdminSession(session))return Response.json({error:"Staff only."},{status:403});const body=await request.json().catch(()=>({})),weekId=String(body.weekId||""),action=String(body.action||"publish"),state=await loadGames(env);if(state.gamesCompleted)return Response.json({error:"The Ironkin Games are complete. Published results are locked."},{status:409});const week=(state.weeks||[]).find(w=>String(w.id)===weekId);if(!week)return Response.json({error:"Week not found."},{status:404});
 if(action==="preview"){try{return Response.json({ok:true,weekId,challenges:await calculateWeek(state,week,env)});}catch(e){return Response.json({error:e?.message||"Could not calculate automatic results."},{status:502});}}
 const published=new Set((state.publishedResultWeeks||[]).map(String));if(action==="hide")published.delete(weekId);else{let calculated=[];try{calculated=await calculateWeek(state,week,env);}catch(e){return Response.json({error:e?.message||"Could not calculate automatic results. Nothing was published."},{status:502});}const autoIds=new Set((week.challenges||[]).filter(c=>(String(c.trackingMethod||"")==="automatic"||c.trackerType==="territory-conquest"||/time[\s-]*trials/i.test(String(c.trackerType||""))||/ironkin time trials/i.test(String(c.name||"")))).map(c=>String(c.id)));state.submissions=(state.submissions||[]).filter(s=>!(String(s.weekId)===weekId&&autoIds.has(String(s.challengeId))&&String(s.source||"")==="automatic"));for(const result of calculated){const challenge=(week.challenges||[]).find(c=>String(c.id)===String(result.challengeId));for(const row of result.rows)state.submissions.push(automaticSubmission(week,challenge,row));}published.add(weekId);}
 state.publishedResultWeeks=[...published];state.resultsUnlocked=false;for(const team of state.teams||[])team.points=(state.submissions||[]).filter(s=>String(s.teamId)===String(team.id)&&String(s.status)==="approved").reduce((n,s)=>n+(Number(s.points)||0),0);await saveGames(env,state);return Response.json({ok:true,weekId,published:action!=="hide",publishedResultWeeks:state.publishedResultWeeks});}
