import { getSession, isGamesAdminSession } from '../_auth.js';
import { loadGames, memberTeam } from './_store.js';
import { hybridKv } from '../../_hybridKv.js';
import { TERRITORIES, CONQUEST_RULES } from './_conquestConfig.js';
import { region,task,stateFor,progress,captured,total,eligible,summaries } from './_conquestEngine.js';
const KEY='ironkin-games:conquest:2026:week4';
const TEST_KEY=KEY+':sandbox';
const accessWindow=games=>{const week=(games.weeks||[]).find(w=>(w.challenges||[]).some(c=>c.trackerType==='territory-conquest'));const challenge=week?.challenges?.find(c=>c.trackerType==='territory-conquest');const start=Date.parse(challenge?.opensAt||week?.startDate||'');const end=Date.parse(challenge?.closesAt||week?.endDate||'');return {assigned:!!challenge,open:Number.isFinite(start)&&Date.now()>=start,closed:Number.isFinite(end)&&Date.now()>end,opensAt:Number.isFinite(start)?new Date(start).toISOString():null};};

const sandboxRequest=request=>new URL(request.url).searchParams.get('sandbox')==='1';
const initial=()=>({teams:{},submissions:[],replacementRequests:[],audit:[],published:false,updatedAt:''});
const read=async(env,key=KEY)=>{try{return {...initial(),...JSON.parse(await hybridKv(env,'drops').get(key)||'{}')}}catch{return initial()}};
const write=async(env,s,key=KEY)=>{s.updatedAt=new Date().toISOString();await hybridKv(env,'drops').put(key,JSON.stringify(s))};
const fail=(error,status=400)=>Response.json({error},{status});
const addBonus=(t,points,reason,source)=>{if(!t.powerBonuses)t.powerBonuses=[];t.powerBonuses.push({id:crypto.randomUUID(),points,reason,source,at:new Date().toISOString()})};
const memberIds=team=>new Set([team?.captainDiscordId,...(team?.members||[]).map(m=>m.discordId||m.id)].filter(Boolean).map(String));
const isCompetitive=id=>Boolean(task(id)?.competitive);
// Accept pasted Discord mentions and raw Discord IDs; always credit the submitting player.
const normalizeParticipants=(values,submitter)=>[...new Set([String(submitter),...(Array.isArray(values)?values:[]).map(v=>String(v||'').trim().replace(/^<@!?(\d+)>$/,'$1'))].filter(Boolean))];

export async function onRequestGet({request,env}){
 const session=await getSession(request,env),staff=isGamesAdminSession(session),games=await loadGames(env),team=memberTeam(games,session),sandbox=staff&&sandboxRequest(request),s=await read(env,sandbox?TEST_KEY:KEY);
 const access=accessWindow(games);if(!staff&&(!team||!access.assigned||!access.open))return fail('Territory Conquest is not available to your team until Week 4 opens.',403);const {scores,rankings}=summaries(s,games),url=new URL(request.url),requested=staff?url.searchParams.get('teamId'):null;
 const teamId=requested&&scores[requested]?requested:team?.id||null;
 const t=teamId?stateFor(s,teamId):{scouted:[]};
 const regions=TERRITORIES.map(r=>({...r,secret:staff||t.scouted.includes(r.id)?r.secret:null}));
 // Rankings remain hidden from players until the event is explicitly published.
 const playerNames={};if(staff){for(const t of games.teams||[]){for(const m of t.members||[]){if(m&&typeof m==='object'){const id=String(m.discordId||m.discord_id||m.id||'');if(id)playerNames[id]=String(m.rsn||m.displayName||m.name||m.username||id)}}}for(const p of games.players||[]){const id=String(p.discordId||p.discord_id||p.id||'');if(id)playerNames[id]=String(p.rsn||p.displayName||p.name||p.username||id)}}
 return Response.json({playerNames:staff?playerNames:{},rules:CONQUEST_RULES,regions,scores:staff?scores:(teamId&&scores[teamId]?{[teamId]:scores[teamId]}:{}),rankings:staff||s.published?rankings:null,published:!!s.published,teamId,staff,sandbox,replacementRequests:staff?(s.replacementRequests||[]):(s.replacementRequests||[]).filter(x=>x.teamId===teamId),submissions:staff?s.submissions:(s.submissions||[]).filter(x=>x.teamId===teamId)}, {headers:{'Cache-Control':'no-store'}});
}
export async function onRequestPost({request,env}){
 const session=await getSession(request,env),staff=isGamesAdminSession(session),games=await loadGames(env),team=memberTeam(games,session);
 if(!session)return fail('Discord sign-in required.',401);const access=accessWindow(games);if(!staff&&(!team||!access.assigned||!access.open||access.closed))return fail('Territory Conquest is not currently open for your team.',403);
 const body=await request.json().catch(()=>({})),sandbox=sandboxRequest(request);if(sandbox&&!staff)return fail('Admin Test Mode is staff only.',403);const storageKey=sandbox?TEST_KEY:KEY;const s=await read(env,storageKey);
 // Staff review actions target the submission's team, not the reviewer's roster membership.
 const replacementReview=body.action==='reviewReplacement'&&staff?(s.replacementRequests||[]).find(x=>x.id===body.requestId):null;
 const reviewSubmission=body.action==='review'&&staff?(s.submissions||[]).find(x=>x.id===body.submissionId):null;
 const teamId=replacementReview?.teamId||reviewSubmission?.teamId||(staff&&body.teamId?String(body.teamId):team?.id);
 const teamRecord=(games.teams||[]).find(x=>x.id===teamId);
 const teamlessStaffAction=staff&&['review','reviewReplacement','resetSandbox','publish','resolveWagers'].includes(body.action);
 if(!teamRecord&&!teamlessStaffAction)return fail('Team membership required.',403);
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
  // Legacy state may still contain spent powers in equipped. Treat those slots as empty.
  const active=(t.equipped||[]).filter(id=>!(t.usedPowers||[]).includes(id));
  if(JSON.stringify([...powers].sort())===JSON.stringify([...active].sort()))return fail('No loadout change');
  // Filling vacancies without removing an active power is not a voluntary swap.
  const voluntarySwap=active.some(id=>!powers.includes(id));
  if(voluntarySwap&&t.lastSwap&&now-Date.parse(t.lastSwap)<86400000)return fail('Power swap on 24-hour cooldown');
  t.equipped=powers;
  if(voluntarySwap)t.lastSwap=new Date(now).toISOString();
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
   
   t.declared ||= [];t.declared.push({power,taskId:target.id,replacement,status:'active',at:new Date().toISOString()});
  }else if(power==='fremennik'){
   if((t.extraActions||0)>=1)return fail('Sixth Conquest Action already purchased');if(!available())return fail('At least 100 points required to buy the sixth action');
   t.extraActions=(t.extraActions||0)+1;t.penalties=(t.penalties||0)+100;
  }else if(power==='desert'){
   const source=String(body.copyPower||'');if(source==='desert'||!region(source)||!captured(t,region(source)))return fail('Choose another captured territory');
   if((t.usedPowers||[]).includes(source)&&source!=='fremennik')return fail('Cannot copy a spent power');
   if(source==='fremennik'){
    if((t.extraActions||0)!==1||(t.usedPowers||[]).includes('fremennik')===false)return fail('Use Viking Conquest for the sixth action before copying it for the seventh');
    if(!available())return fail('At least 100 points required for the seventh action');t.extraActions=2;t.penalties=(t.penalties||0)+100;
   }else if(['asgarnia','karamja','wilderness','zeah','morytania'].includes(source)){
    const target=task(body.taskId),targetRegion=TERRITORIES.find(r=>r.tasks.some(x=>x.id===body.taskId));
    if(!target||!targetRegion||t.approved[target.id])return fail('Choose unfinished task in unlocked territory');
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
  // A consumed single-use power immediately releases its equipment slot.
  t.equipped=(t.equipped||[]).filter(id=>id!==power);
 }else if(body.action==='requestReplacement'){
  const via=String(body.via||'morytania'),target=task(body.taskId),targetRegion=TERRITORIES.find(r=>r.tasks.some(x=>x.id===body.taskId));
  if(!['morytania','desert'].includes(via)||!eligible(t,via))return fail('Equip an unused replacement power first');
  if(via==='desert'&&!captured(t,region('morytania')))return fail('Capture Morytania before copying its power');
  if(!target||!targetRegion||t.approved[target.id]||!['Hard','Elite'].includes(target.tier))return fail('Select an unfinished Hard or Elite task in any territory');
  if((s.replacementRequests||[]).some(q=>q.teamId===teamId&&q.status==='pending'))return fail('A replacement request is already pending');
  const replacement=String(body.replacement||'').trim().slice(0,400);
  if(!replacement)return fail('Describe the proposed same-tier alternative');
  s.replacementRequests ||= [];
  s.replacementRequests.push({id:crypto.randomUUID(),teamId,via,taskId:target.id,replacement,tier:target.tier,status:'pending',at:new Date().toISOString(),by:String(session.id)});
 }else if(body.action==='reviewReplacement'){
  if(!staff)return fail('Staff only',403);
  const req=(s.replacementRequests||[]).find(x=>x.id===body.requestId);
  if(!req||req.status!=='pending')return fail('Pending request not found');
  if(!['approved','rejected'].includes(body.decision))return fail('Invalid decision');
  const owner=stateFor(s,req.teamId);
  if(body.decision==='approved'){
   const original=task(req.taskId),originalRegion=TERRITORIES.find(r=>r.tasks.some(x=>x.id===req.taskId));
   if(!original||!originalRegion||owner.approved[req.taskId])return fail('Task is no longer eligible');
   if(!eligible(owner,req.via)||(owner.usedPowers||[]).includes(req.via))return fail('Power no longer available');
   owner.usedPowers ||= [];owner.usedPowers.push(req.via);owner.equipped=(owner.equipped||[]).filter(x=>x!==req.via);
  }
  req.status=body.decision;req.reviewedAt=new Date().toISOString();req.reviewedBy=String(session.id);
 }else if(body.action==='submit'){
  if(!r||(!t.unlocked.includes(r.id)&&!(s.replacementRequests||[]).some(q=>q.teamId===teamId&&q.taskId===body.taskId&&q.status==='approved')))return fail('Territory not unlocked');const objective=r.tasks.find(x=>x.id===body.taskId),secret=body.taskId===r.id+'-secret';
  if(!objective&&!secret)return fail('Invalid task');if(secret&&!t.scouted.includes(r.id))return fail('Scout objective first');
  if(body.replacementId&&!(s.replacementRequests||[]).some(q=>q.teamId===teamId&&q.taskId===body.taskId&&q.status==='approved'))return fail('Replacement is not approved');
  const proofUrls=(Array.isArray(body.proofUrls)?body.proofUrls:[body.proofUrl]).map(x=>String(x||'').trim()).filter(Boolean);
  if(!proofUrls.length||proofUrls.some(url=>url.length>1000||!/^https?:\/\//i.test(url)))return fail('Valid http(s) proof URLs are required');
  // Resolve player names only against this team's roster; reject ambiguous matches.
  const roster=[...(teamRecord.members||[]),...(teamRecord.captainDiscordId?[{discordId:teamRecord.captainDiscordId,name:teamRecord.captainName||''}]:[])];
  const resolveParticipant=value=>{
   const raw=String(value||'').trim(),id=raw.replace(/^<@!?(\d+)>$/,'$1');
   if(memberIds(teamRecord).has(id))return id;
   const key=raw.toLowerCase();
   const matches=[...new Set(roster.filter(m=>[m.rsn,m.displayName,m.name,m.username,m.discordName].some(n=>String(n||'').trim().toLowerCase()===key)).map(m=>String(m.discordId||m.discord_id||m.id||'')).filter(Boolean))];
   if(matches.length>1)throw new Error('Multiple teammates match "'+raw+'". Use a Discord ID.');
   if(matches.length===1)return matches[0];
   throw new Error('Teammate "'+raw+'" was not found. Use an exact roster name, mention, or Discord ID.');
  };
  let participantIds;
  try{participantIds=[...new Set(normalizeParticipants(body.participantIds,session.id).map(resolveParticipant))]}
  catch(error){return fail(error.message+' No proof was saved.');}
  const invalidParticipants=participantIds.filter(id=>!memberIds(teamRecord).has(id));
  if(invalidParticipants.length)return fail('One or more tagged participants are not registered on your team. Use roster names, Discord mentions, or numeric Discord IDs. No proof was saved.');
  const existingPending=(s.submissions||[]).find(x=>x.teamId===teamId&&x.taskId===body.taskId&&x.status==='pending');
  const existingApproved=(s.submissions||[]).find(x=>x.teamId===teamId&&x.taskId===body.taskId&&x.status==='approved');
  if(t.approved[body.taskId]&&!objective?.competitive&&!existingApproved)return fail('Already approved');
  if(existingPending||(existingApproved&&!objective?.competitive)){
   const target=existingPending||existingApproved;
   target.proofUrls ||= target.proofUrl?[target.proofUrl]:[];
   target.proofUrls.push(...proofUrls);
   target.participantIds=[...new Set([...(target.participantIds||[]),...participantIds])];
   target.evidenceUpdates ||= [];target.evidenceUpdates.push({by:String(session.id),at:new Date().toISOString(),proofUrls,notes:String(body.notes||'').slice(0,1000)});
   result.submission=target;result.evidenceAdded=proofUrls.length;
  }else{
  const metric=body.metric===''||body.metric==null?null:Number(body.metric);
  if(objective?.competitive&&(!Number.isFinite(metric)||metric<0))return fail('Competitive tasks require a nonnegative numeric result');
  const submission={id:crypto.randomUUID(),teamId,regionId:r.id,taskId:body.taskId,secret,proofUrl:proofUrls[0],proofUrls,notes:String(body.notes||'').slice(0,1000),metric:objective?.competitive?metric:null,participantIds,submittedBy:String(session.id),submittedAt:new Date().toISOString(),status:'pending'};
  s.submissions.push(submission);result.submission=submission;
  }
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
