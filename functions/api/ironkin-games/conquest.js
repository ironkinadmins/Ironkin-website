import { getSession, isGamesAdminSession } from '../_auth.js';
import { loadGames, memberTeam } from './_store.js';
import { hybridKv } from '../../_hybridKv.js';
import { TERRITORIES, CONQUEST_RULES } from './_conquestConfig.js';
import { region,task,stateFor,progress,captured,total,eligible,summaries } from './_conquestEngine.js';
const KEY='ironkin-games:conquest:2026:week4';
const TEST_KEY=KEY+':sandbox';
const sandboxRequest=request=>new URL(request.url).searchParams.get('sandbox')==='1';
const initial=()=>({teams:{},submissions:[],audit:[],published:false,updatedAt:''});
const read=async(env,key=KEY)=>{try{return {...initial(),...JSON.parse(await hybridKv(env,'drops').get(key)||'{}')}}catch{return initial()}};
const write=async(env,s,key=KEY)=>{s.updatedAt=new Date().toISOString();await hybridKv(env,'drops').put(key,JSON.stringify(s))};
const fail=(error,status=400)=>Response.json({error},{status});
const addBonus=(t,points,reason,source)=>{if(!t.powerBonuses)t.powerBonuses=[];t.powerBonuses.push({id:crypto.randomUUID(),points,reason,source,at:new Date().toISOString()})};
const memberIds=team=>new Set([team?.captainDiscordId,...(team?.members||[]).map(m=>m.discordId||m.id)].filter(Boolean).map(String));
const isCompetitive=id=>Boolean(task(id)?.competitive);
export async function onRequestGet({request,env}){
 const session=await getSession(request,env),staff=isGamesAdminSession(session),games=await loadGames(env),team=memberTeam(games,session),sandbox=staff&&sandboxRequest(request),s=await read(env,sandbox?TEST_KEY:KEY);
 const {scores,rankings}=summaries(s,games),url=new URL(request.url),requested=staff?url.searchParams.get('teamId'):null;
 const teamId=requested&&scores[requested]?requested:team?.id||null;
 const t=teamId?stateFor(s,teamId):{scouted:[]};
 const regions=TERRITORIES.map(r=>({...r,secret:staff||t.scouted.includes(r.id)?r.secret:null}));
 // Rankings remain hidden from players until the event is explicitly published.
 return Response.json({rules:CONQUEST_RULES,regions,scores:staff?scores:Object.fromEntries(Object.entries(scores).map(([id,v])=>[id,{...v,metrics:id===teamId?v.metrics:{},participants:id===teamId?v.participants:{},declared:id===teamId?v.declared:[]} ])),rankings:staff||s.published?rankings:null,published:!!s.published,teamId,staff,sandbox,submissions:staff?s.submissions:(s.submissions||[]).filter(x=>x.teamId===teamId)}, {headers:{'Cache-Control':'no-store'}});
}
export async function onRequestPost({request,env}){
 const session=await getSession(request,env),staff=isGamesAdminSession(session),games=await loadGames(env),team=memberTeam(games,session);
 if(!session)return fail('Discord sign-in required.',401);
 const body=await request.json().catch(()=>({})),sandbox=sandboxRequest(request);if(sandbox&&!staff)return fail('Admin Test Mode is staff only.',403);const storageKey=sandbox?TEST_KEY:KEY;const s=await read(env,storageKey),teamId=staff&&body.teamId?String(body.teamId):team?.id;
 const teamRecord=(games.teams||[]).find(x=>x.id===teamId);
 if(!teamRecord)return fail('Team membership required.',403);
 if(body.action==='resetSandbox'){if(!sandbox||!staff)return fail('Sandbox admin only',403);await write(env,initial(),TEST_KEY);return Response.json({ok:true})}
 if(s.published&&!staff)return fail('Week 4 results have been finalized. Submissions and actions are closed.',403);
 const t=stateFor(s,teamId),r=region(body.regionId),now=Date.now();let result={};
 const available=()=>total(t)>=100;
 if(body.action==='unlock'){
  if(!r)return fail('Invalid territory');if(t.unlocked.includes(r.id))return fail('Already unlocked');
  if(t.unlocked.length>=5+(t.extraActions||0))return fail('No Conquest Actions remaining');t.unlocked.push(r.id);
 }else if(body.action==='scout'){
  if(!r||!t.unlocked.includes(r.id))return fail('Unlock the territory first');if(t.scouted.includes(r.id))return fail('Already scouted');if(t.scouted.length>=2)return fail('No Scout Actions remaining');t.scouted.push(r.id);
 }else if(body.action==='equip'){
  const powers=Array.isArray(body.powers)?[...new Set(body.powers.map(String))]:[];
  if(powers.length>2)return fail('Maximum two powers');if(powers.some(id=>!TERRITORIES.some(r=>r.id===id&&captured(t,r))))return fail('Power not captured');
  if(powers.some(id=>(t.usedPowers||[]).includes(id)&&id!=='kandarin'&&id!=='varlamore'))return fail('Consumed power cannot be equipped');
  if(JSON.stringify([...powers].sort())===JSON.stringify([...t.equipped].sort()))return fail('No loadout change');
  if(t.lastSwap&&now-Date.parse(t.lastSwap)<86400000)return fail('Power swap on 24-hour cooldown');
  t.equipped=powers;t.lastSwap=new Date(now).toISOString();
 }else if(body.action==='activate'){
  const power=String(body.power||'');if(!eligible(t,power))return fail('Equip and capture this power first');
  if((t.usedPowers||[]).includes(power))return fail('Power already used');
  if(['asgarnia','karamja','wilderness','zeah','morytania'].includes(power)){
   const target=task(body.taskId),targetRegion=TERRITORIES.find(r=>r.tasks.some(x=>x.id===body.taskId));
   if(!target||!t.unlocked.includes(targetRegion.id)||t.approved[target.id])return fail('Choose an unfinished task in an unlocked territory');
   if((t.declared||[]).some(x=>x.taskId===target.id&&x.status==='active'))return fail('Another power is already assigned to this task');
   if(power==='asgarnia'&&!target.competitive)return fail('Requires competitive task');
   if(power==='karamja'&&!['Medium','Elite'].includes(target.tier))return fail('Requires Medium or Elite task');
   if(['wilderness','zeah'].includes(power)&&target.tier!=='Elite')return fail('Requires Elite task');
   if(power==='morytania'&&!['Hard','Elite'].includes(target.tier))return fail('Requires Hard or Elite task');
   if(power==='morytania'&&!staff)return fail('Organizer approval required for a replacement task',403);
   const replacement=power==='morytania'?String(body.replacement||'').trim().slice(0,400):'';
   if(power==='morytania'&&!replacement)return fail('Enter the approved replacement objective');
   if(power==='morytania'&&targetRegion.id!==body.regionId&&body.regionId)return fail('Replacement must remain in the same territory');
   t.declared ||= [];t.declared.push({power,taskId:target.id,replacement,status:'active',at:new Date().toISOString()});
  }else if(power==='fremennik'){
   if((t.extraActions||0)>=1)return fail('Sixth Conquest Action already purchased');if(!available())return fail('At least 100 points required to buy the sixth action');
   t.extraActions=(t.extraActions||0)+1;t.penalties=(t.penalties||0)+100;
  }else if(power==='desert'){
   const source=String(body.copyPower||'');if(source==='desert'||!region(source)||!captured(t,region(source)))return fail('Choose another captured territory');
   if((t.usedPowers||[]).includes(source))return fail('Cannot copy a spent power');
   if(source==='fremennik'){
    if((t.extraActions||0)>=1)return fail('Sixth action already purchased');
    if(!available())return fail('At least 100 points required');t.extraActions=(t.extraActions||0)+1;t.penalties=(t.penalties||0)+100;
   }else if(['asgarnia','karamja','wilderness','zeah','morytania'].includes(source)){
    const target=task(body.taskId),targetRegion=TERRITORIES.find(r=>r.tasks.some(x=>x.id===body.taskId));
    if(!target||!targetRegion||!t.unlocked.includes(targetRegion.id)||t.approved[target.id])return fail('Choose unfinished task in unlocked territory');
    if((t.declared||[]).some(x=>x.taskId===target.id&&x.status==='active'))return fail('Task already has a power declaration');
    if(source==='asgarnia'&&!target.competitive)return fail('Competitive task required');
    if(source==='karamja'&&!['Medium','Elite'].includes(target.tier))return fail('Medium or Elite required');
    if(['wilderness','zeah'].includes(source)&&target.tier!=='Elite')return fail('Elite task required');
    if(source==='morytania'){
     if(!staff)return fail('Staff approval required for replacement',403);
     if(!['Hard','Elite'].includes(target.tier)||!String(body.replacement||'').trim())return fail('Approved Hard/Elite replacement required');
    }
    t.declared ||= [];t.declared.push({power:source,via:'desert',taskId:target.id,replacement:source==='morytania'?String(body.replacement).trim().slice(0,400):'',status:'active',at:new Date().toISOString()});
   }else if(source==='kandarin'||source==='varlamore'){
    t.copiedPassive ||= [];t.copiedPassive.push(source);
   }else return fail('Unsupported copied power');
  }else return fail('This power applies automatically to eligible approved tasks, or needs an organizer-reviewed activation.');
  t.usedPowers ||= [];t.usedPowers.push(power);
 }else if(body.action==='submit'){
  if(!r||!t.unlocked.includes(r.id))return fail('Territory not unlocked');const objective=r.tasks.find(x=>x.id===body.taskId),secret=body.taskId===r.id+'-secret';
  if(!objective&&!secret)return fail('Invalid task');if(secret&&!t.scouted.includes(r.id))return fail('Scout objective first');
  if(t.approved[body.taskId]&&!objective?.competitive)return fail('Already approved');const proofUrl=String(body.proofUrl||'').trim().slice(0,1000);if(!/^https?:\/\//i.test(proofUrl))return fail('A valid proof URL is required');
  if((s.submissions||[]).some(x=>x.teamId===teamId&&x.taskId===body.taskId&&x.status==='pending'))return fail('Submission already pending');
  const metric=body.metric===''||body.metric==null?null:Number(body.metric);
  if(objective?.competitive&&(!Number.isFinite(metric)||metric<0))return fail('Competitive tasks require a nonnegative numeric result');
  const participantIds=Array.isArray(body.participantIds)?[...new Set(body.participantIds.map(String))]:[String(session.id)];
  if(participantIds.length===0||participantIds.some(id=>!memberIds(teamRecord).has(id)))return fail('Participants must belong to this team');
  const submission={id:crypto.randomUUID(),teamId,regionId:r.id,taskId:body.taskId,secret,proofUrl,notes:String(body.notes||'').slice(0,1000),metric:objective?.competitive?metric:null,participantIds,submittedBy:String(session.id),submittedAt:new Date().toISOString(),status:'pending'};
  s.submissions.push(submission);result.submission=submission;
 }else if(body.action==='review'){
  if(!staff)return fail('Staff only',403);const submission=s.submissions.find(x=>x.id===body.submissionId);
  if(!submission||submission.status!=='pending')return fail('Pending submission not found');
  if(!['approved','rejected'].includes(body.decision))return fail('Invalid decision');submission.status=body.decision;submission.reviewedAt=new Date().toISOString();submission.reviewedBy=String(session.id);submission.staffNote=String(body.staffNote||'').slice(0,500);
  if(body.decision==='approved'){
   const owner=stateFor(s,submission.teamId);owner.approved[submission.taskId]=true;
   owner.participants ||= {};owner.participants[submission.taskId]=submission.participantIds||[];
   if(submission.metric!==null){owner.metrics ||= {};const old=owner.metrics[submission.taskId];const ascending=['morytania-14','zeah-14'].includes(submission.taskId);if(old==null||(ascending?submission.metric<old:submission.metric>old))owner.metrics[submission.taskId]=submission.metric}
   const declaration=(owner.declared||[]).find(d=>d.taskId===submission.taskId&&d.status==='active');
   if(declaration){declaration.status='completed';/* task bonuses recomputed from approved tasks */}

  }
 }else if(body.action==='publish'){
  if(!staff)return fail('Staff only',403);s.published=!!body.published;
 }else if(body.action==='correct'){
  if(!staff)return fail('Staff only',403);const id=String(body.taskId||''),owner=stateFor(s,teamId);
  if(!task(id)&&!TERRITORIES.some(r=>id===r.id+'-secret'))return fail('Invalid task');
  if(body.approved===false){for(const sub of s.submissions){if(sub.teamId===teamId&&sub.taskId===id&&sub.status==='approved'){sub.status='revoked';sub.reviewedAt=new Date().toISOString();sub.reviewedBy=String(session.id)}}delete owner.approved[id];if(owner.metrics)delete owner.metrics[id];if(owner.participants)delete owner.participants[id];owner.powerBonuses=(owner.powerBonuses||[]).filter(b=>b.taskId!==id);for(const d of owner.declared||[]){if(d.taskId===id&&d.status==='completed')d.status='active'}}
  else return fail('Only revoke supported; approve through evidence review');
 }else if(body.action==='award'){
  if(!staff)return fail('Staff only',403);const points=Number(body.points);if(!Number.isFinite(points)||Math.abs(points)>1000||!points)return fail('Invalid points');
  const reason=String(body.reason||'').trim();if(!reason)return fail('Adjustment reason required');addBonus(t,points,reason,'staff');
 }else if(body.action==='resolveWagers'){
  if(!staff)return fail('Staff only',403);for(const owner of Object.values(s.teams)){for(const d of owner.declared||[]){if(d.power==='wilderness'&&d.status==='active'){d.status='failed';owner.penalties=(owner.penalties||0)+75}}}
 }else return fail('Unknown action');
 s.audit.push({action:body.action,teamId,by:String(session.id),at:new Date().toISOString(),details:String(body.taskId||body.power||'').slice(0,80)});
 if(s.audit.length>3000)s.audit=s.audit.slice(-3000);
 await write(env,s,storageKey);return Response.json({ok:true,...result});
}
