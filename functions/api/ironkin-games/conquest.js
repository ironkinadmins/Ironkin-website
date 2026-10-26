import { getSession, isGamesAdminSession } from '../_auth.js';
import { loadGames, memberTeam } from './_store.js';
import { hybridKv } from '../../_hybridKv.js';
import { TERRITORIES, CONQUEST_RULES } from './_conquestConfig.js';
const KEY='ironkin-games:conquest:2026:week4';
const initial=()=>({teams:{},submissions:[],audit:[],updatedAt:''});
const read=async env=>{try{return {...initial(),...JSON.parse(await hybridKv(env,'drops').get(KEY)||'{}')}}catch{return initial()}};
const write=async(env,s)=>{s.updatedAt=new Date().toISOString();await hybridKv(env,'drops').put(KEY,JSON.stringify(s))};
const teamState=(s,id)=>s.teams[id] ||= {unlocked:[],scouted:[],equipped:[],lastSwap:'',usedPowers:[],conquestSpent:0,scoutSpent:0,approved:{},powerBonuses:[],penalties:0};
const basePoints=(t,region)=>region.tasks.reduce((a,task)=>a+(t.approved[task.id]?task.points:0),0);
const captured=(t,region)=>t.unlocked.includes(region.id)&&basePoints(t,region)>=region.captureThreshold;
const summary=(s,games)=>{
 const output={};for(const team of games.teams||[]){const t=teamState(s,team.id);const captures=TERRITORIES.filter(r=>captured(t,r));const base=TERRITORIES.reduce((n,r)=>n+basePoints(t,r),0);const captureBonus=captures.reduce((n,r)=>n+r.captureBonus,0);const powerBonus=(t.powerBonuses||[]).reduce((n,b)=>n+Number(b.points||0),0);output[team.id]={teamName:team.name,unlocked:t.unlocked,scouted:t.scouted,equipped:t.equipped,lastSwap:t.lastSwap,usedPowers:t.usedPowers,actionsLeft:CONQUEST_RULES.startingActions+(t.usedPowers.includes('fremennik')?1:0)-t.unlocked.length,scoutsLeft:CONQUEST_RULES.scouts-t.scouted.length,captured:captures.map(r=>r.id),progress:Object.fromEntries(TERRITORIES.map(r=>[r.id,basePoints(t,r)])),basePoints:base,captureBonus,powerBonus,penalties:t.penalties||0,total:base+captureBonus+powerBonus-(t.penalties||0),approved:t.approved};}return output;
};
const publicRegions=(t,staff)=>TERRITORIES.map(r=>({...r,secret:staff||t.scouted.includes(r.id)?r.secret:null}));
export async function onRequestGet({request,env}){
 const session=await getSession(request,env),staff=isGamesAdminSession(session),games=await loadGames(env),team=memberTeam(games,session),s=await read(env),scores=summary(s,games);
 const url=new URL(request.url),requested=staff?url.searchParams.get('teamId'):null;
 const teamId=requested&&scores[requested]?requested:team?.id||null;
 const t=teamId?teamState(s,teamId):{scouted:[]};
 return Response.json({rules:CONQUEST_RULES,regions:publicRegions(t,staff),scores,teamId,staff,submissions:staff?s.submissions:(s.submissions||[]).filter(x=>x.teamId===teamId)}, {headers:{'Cache-Control':'no-store'}});
}
export async function onRequestPost({request,env}){
 const session=await getSession(request,env),staff=isGamesAdminSession(session),games=await loadGames(env),team=memberTeam(games,session);
 if(!session)return Response.json({error:'Discord sign-in required.'},{status:401});
 const body=await request.json().catch(()=>({}));const s=await read(env);const teamId=staff&&body.teamId?String(body.teamId):team?.id;
 if(!teamId||!(games.teams||[]).some(x=>x.id===teamId))return Response.json({error:'Team membership required.'},{status:403});
 const t=teamState(s,teamId),r=TERRITORIES.find(x=>x.id===body.regionId),now=Date.now();let result={};
 const fail=(error,status=400)=>Response.json({error},{status});
 if(body.action==='unlock'){
  if(!r)return fail('Invalid territory');if(t.unlocked.includes(r.id))return fail('Already unlocked');
  if(t.unlocked.length>=5+(t.usedPowers.includes('fremennik')?1:0))return fail('No Conquest Actions remaining');
  t.unlocked.push(r.id);
 }else if(body.action==='scout'){
  if(!r||!t.unlocked.includes(r.id))return fail('Unlock the territory first');if(t.scouted.includes(r.id))return fail('Already scouted');if(t.scouted.length>=2)return fail('No Scout Actions remaining');t.scouted.push(r.id);
 }else if(body.action==='equip'){
  const powers=Array.isArray(body.powers)?[...new Set(body.powers.map(String))]:[];
  if(powers.length>2)return fail('Maximum two powers');if(powers.some(id=>!TERRITORIES.some(r=>r.id===id&&captured(t,r))))return fail('Power not captured');
  if(t.lastSwap&&now-Date.parse(t.lastSwap)<86400000)return fail('Power swap on 24-hour cooldown');
  t.equipped=powers;t.lastSwap=new Date(now).toISOString();
 }else if(body.action==='submit'){
  if(!r||!t.unlocked.includes(r.id))return fail('Territory not unlocked');const task=r.tasks.find(x=>x.id===body.taskId);const secret=body.taskId===r.id+'-secret';
  if(!task&&!secret)return fail('Invalid task');if(secret&&!t.scouted.includes(r.id))return fail('Scout objective first');
  if(t.approved[body.taskId])return fail('Already approved');const proofUrl=String(body.proofUrl||'').trim().slice(0,1000);if(!/^https?:\/\//i.test(proofUrl))return fail('A valid HTTPS/HTTP proof URL is required');
  const previous=(s.submissions||[]).find(x=>x.teamId===teamId&&x.taskId===body.taskId&&x.status==='pending');if(previous)return fail('Submission already pending');
  const submission={id:crypto.randomUUID(),teamId,regionId:r.id,taskId:body.taskId,secret,proofUrl,notes:String(body.notes||'').slice(0,1000),score:Number(body.score)||0,submittedBy:String(session.id),submittedAt:new Date().toISOString(),status:'pending'};s.submissions.push(submission);result.submission=submission;
 }else if(body.action==='review'){
  if(!staff)return fail('Staff only',403);const submission=s.submissions.find(x=>x.id===body.submissionId);if(!submission||submission.status!=='pending')return fail('Pending submission not found');
  if(!['approved','rejected'].includes(body.decision))return fail('Invalid decision');submission.status=body.decision;submission.reviewedAt=new Date().toISOString();submission.reviewedBy=String(session.id);submission.staffNote=String(body.staffNote||'').slice(0,500);
  if(body.decision==='approved')teamState(s,submission.teamId).approved[submission.taskId]=true;
 }else if(body.action==='award'){
  if(!staff)return fail('Staff only',403);const points=Number(body.points);if(!Number.isFinite(points)||Math.abs(points)>1000)return fail('Invalid points');t.powerBonuses.push({id:crypto.randomUUID(),points,reason:String(body.reason||'Staff adjustment').slice(0,180),at:new Date().toISOString()});
 }else return fail('Unknown action');
 s.audit.push({action:body.action,teamId,by:String(session.id),at:new Date().toISOString()});await write(env,s);return Response.json({ok:true,...result});
}
