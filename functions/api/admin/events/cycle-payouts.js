import { recoverFullWomLeaderboard } from '../../../_fullWomPayout.js';
import { getEventWomCompetitionIds } from '../../../_womCompetition.js';
import { hybridKv } from '../../../_hybridKv.js';
import { buildCyclePayoutDraft } from '../../../_cyclePayouts.js';
import { getSession, isStaffSession } from '../../_auth.js';
const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback;}catch{return fallback;}};
const isElite=e=>e?.type==='botw-elite'||(e?.type==='botw'&&String(e.botwTier||'').toLowerCase()==='elite');
const isStandard=e=>e?.type==='botw-standard'||(e?.type==='botw'&&String(e.botwTier||'').toLowerCase()==='standard');
const isCycle=e=>e?.type==='sotw'||isElite(e)||isStandard(e)||e?.type==='botw';
const rewardSlot=(source,active)=>{
 const type=isElite(source)?'elite':isStandard(source)?'standard':source.type==='sotw'?'sotw':null;
 if(!type)return [];
 return (Array.isArray(active)?active:[]).filter(e=>{
  if(type==='sotw')return e.id==='sotw-current'||e.type==='sotw';
  return e.id===`botw-${type}`||e.botwTier===type;
 }).filter(e=>e.rewards&&Array.isArray(e.rewards.placement)&&Array.isArray(e.rewards.participation));
};
const NOV13_ELITE_ARCHIVE='3db76115-9da3-417d-9fc5-ccc98498095e';
const NOV13_ELITE_WOM=['155412','155411'];
const validCycleId=id=>/^cycle-(sotw|botw|botw-standard|botw-elite):\d{4}-\d{2}-\d{2}-\d+$/.test(String(id||''));

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequest({request,env}) {
  if(!isStaffSession(await getSession(request,env)))return json({error:'Staff only'},403);
  const kv=hybridKv(env,'drops');
  if(request.method==='GET') {
    const archive=parse(await kv.get('events:archive'),[]);
    const drafts=[];
    const diagnostics=[];
    for(const entry of (Array.isArray(archive)?archive:[]).filter(isCycle)) {
      const draft=parse(await kv.get(`events:cycle-payout:${entry.archiveRequestId}`),null);
      if(draft)drafts.push(draft);
    }
    // Include missing Elite cycle diagnostics without fabricating an archive or paying anyone.
    const eliteState=parse(await kv.get('events:sotw-botw-automation:v1:botw-elite:2026-11-13'),{});
    const eliteArchives=(Array.isArray(archive)?archive:[]).filter(isElite);
    if(!eliteArchives.length)diagnostics.push({type:'botw-elite',cycle:'2026-11-13',reason:'No archived Elite BOTW event. Cannot create a payable draft until the original two WOM components and archive are reconciled.',womCompetitionIds:eliteState.womCompetitionIds||[],womStatus:eliteState.womStatus||null,finalizationStatus:eliteState.finalizationStatus||null,websiteStatus:eliteState.websiteStatus||null});
    else for(const entry of eliteArchives)if(!drafts.some(d=>d.id===entry.archiveRequestId))diagnostics.push({type:'botw-elite',cycle:'2026-11-13',reason:'Elite archive exists but no payout draft was found',archiveRequestId:entry.archiveRequestId,womCompetitionIds:entry.womCompetitionIds||[]});
    return json({drafts,diagnostics});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const origin=request.headers.get('Origin');
  if(!origin||new URL(origin).origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  const body=await request.json().catch(()=>null);
  if(body?.action==='prepare') {
    if(body.date!==undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.date))return json({error:'Invalid date'},400);
    const archive=parse(await kv.get('events:archive'),[]);
    const selected=(Array.isArray(archive)?archive:[]).filter(e=>{
      if(!isCycle(e)||typeof e.archiveRequestId!=='string')return false;
      const cycle=validCycleId(e.archiveRequestId)&&(!body.date||e.archiveRequestId.includes(':'+body.date+'-'));
      const eliteHistorical=body.date==='2026-11-13' && isElite(e) && e.archiveRequestId===NOV13_ELITE_ARCHIVE &&
        NOV13_ELITE_WOM.every(id=>getEventWomCompetitionIds(e).map(String).includes(id)) &&
        getEventWomCompetitionIds(e).length===2;
      return cycle||eliteHistorical;
    });
    if(!selected.length)return json({error:'No matching archived cycle competitions. Check the archive first; this action will not invent results.'},404);
    if(selected.length>5)return json({error:'Too many historical cycles in one recovery request; use a specific date.'},409);
    const results=[];
    for(const entry of selected){
      const key=`events:cycle-payout:${entry.archiveRequestId}`;
      const existing=parse(await kv.get(key),null);
      if(existing){results.push({id:entry.archiveRequestId,status:'existing',draftStatus:existing.status});continue;}
      const active=parse(await kv.get('events:active'),[]);
      const matches=rewardSlot(entry,active);
      if(matches.length!==1){results.push({id:entry.archiveRequestId,status:'blocked',reason:`Current reward settings ambiguous (${matches.length})`});continue;}
      let recovered;
      try{recovered=await recoverFullWomLeaderboard(env,entry);}
      catch(error){results.push({id:entry.archiveRequestId,status:'blocked',reason:String(error.message||error)});continue;}
      let draft;
      try { draft=await buildCyclePayoutDraft(kv,{...entry,type:isElite(entry)?'botw-elite':isStandard(entry)?'botw-standard':entry.type,leaderboard:recovered.leaderboard},matches[0].rewards,env); } catch(error) {results.push({id:entry.archiveRequestId,status:'blocked',reason:String(error.message||error)});continue;}
      if(!draft){results.push({id:entry.archiveRequestId,status:'skipped'});continue;}
      draft.status='pending_review';draft.approvedAt=null;draft.approvalSource=null;
      draft.payouts=(draft.payouts||[]).map(p=>({...p,status:'pending_review'}));
      draft.womVerified=true;draft.womCompetitionIds=recovered.competitionIds;draft.womComponentCounts=recovered.componentCounts;
      draft.womParticipantCount=recovered.leaderboard.length;draft.currentRewardsEventId=matches[0].id;
      draft.recalculatedAt=new Date().toISOString();
      if(draft.reportRows?.length!==draft.womParticipantCount){results.push({id:entry.archiveRequestId,status:'blocked',reason:'Full report row count mismatch'});continue;}
      try {
        await kv.put(key,JSON.stringify(draft));
        const saved=parse(await kv.get(key),null);
        if(saved?.reportRows?.length!==draft.womParticipantCount || saved?.recalculatedAt!==draft.recalculatedAt)
          throw Error('Saved participant report does not match recovered leaderboard');
        results.push({id:entry.archiveRequestId,status:'prepared',participants:draft.womParticipantCount,recipients:draft.payouts.length,unresolved:draft.unresolved?.length||0});
      } catch(error) {results.push({id:entry.archiveRequestId,status:'blocked',reason:'Persistence failed: '+String(error.message||error)});}
    }
    return json({results});
  }
  if(!body||!['approve','reject','recalculate'].includes(body.action)||typeof body.id!=='string'||!(validCycleId(body.id)||body.id===NOV13_ELITE_ARCHIVE))return json({error:'Invalid request'},400);
  const key=`events:cycle-payout:${body.id}`;
  const draft=parse(await kv.get(key),null);
  if(!draft)return json({error:'Payout draft not found'},404);
  // A draft must still belong to a real, immutable archived event.
  const archive=parse(await kv.get('events:archive'),[]);
  const source=Array.isArray(archive)?archive.find(entry=>entry.archiveRequestId===body.id):null;
  if(!source)return json({error:'Original archive record missing. No changes made.'},409);
  if(body.id===NOV13_ELITE_ARCHIVE && (!isElite(source) ||
      getEventWomCompetitionIds(source).length!==2 ||
      !NOV13_ELITE_WOM.every(id=>getEventWomCompetitionIds(source).map(String).includes(id))))
    return json({error:'Historical Elite archive WOM components do not match verified November 13 references'},409);
  if(body.id===NOV13_ELITE_ARCHIVE && body.action==='approve')
    return json({error:'Historical Elite draft is review-only: bot payout ingestion for UUID-based archive IDs must be verified before approval.'},409);
  const canonicalType=isElite(source)?'botw-elite':isStandard(source)?'botw-standard':source.type;
  const draftType=draft.type;
  const sameType=canonicalType===draftType || (draftType==='botw' && ['botw-standard','botw-elite'].includes(canonicalType));
  const sameSource=source.id===draft.archiveId && source.eventId===draft.eventId && sameType;
  // Legacy cycle drafts can contain old archive IDs and a generic `botw` type.
  // Permit reconciliation ONLY on recalculation, never approval or rejection.
  // The immutable cycle request ID must still reference the archived WOM competition.
  if(!sameSource){
    if(body.action!=='recalculate')return json({error:'Archived source no longer matches payout draft; recalculate and review first.'},409);
    const cycleMatch=String(body.id).match(/^cycle-(sotw|botw|botw-standard|botw-elite):(\d{4}-\d{2}-\d{2})-(\d+)$/);
    const sourceIds=getEventWomCompetitionIds(source).map(String);
    if(!cycleMatch || !sameType || !sourceIds.includes(cycleMatch[3]) || !source.archiveRequestId || source.archiveRequestId!==body.id)
      return json({error:'Cannot safely reconcile legacy draft with original WOM competition. No changes made.',sourceType:canonicalType,draftType,sourceIds},409);
  }
  // Explicitly select the CURRENT Rewards (02) settings; never fall back to an archived snapshot.
  if(body.action==='recalculate'){
    const active=parse(await kv.get('events:active'),[]);
    const type=isElite(source)?'botw-elite':isStandard(source)?'botw-standard':source.type;
    const tier=type==='botw-elite'?'elite':type==='botw-standard'?'standard':String(source.botwTier||'').toLowerCase();
    const matches=rewardSlot(source,active);
    if(matches.length!==1)return json({error:`Cannot identify exactly one current Rewards (02) configuration for ${type}. Found ${matches.length}. No changes made.`},409);
    if(draft.status!=='pending_review' && draft.status!=='rejected')return json({error:'Only unpaid, unapproved drafts can be recalculated'},409);
    if((draft.payouts||[]).some(p=>['credited','paid','processing'].includes(p.status))||draft.approvedAt)return json({error:'Draft may already have been dispatched; no changes made'},409);
    let recovered;
    try { recovered=await recoverFullWomLeaderboard(env,source); }
    catch(error){return json({error:'Full WOM standings could not be verified: '+String(error.message||error)+'. No draft was changed.'},409);}
    let fresh;
    try { fresh=await buildCyclePayoutDraft(kv,{...source,type,leaderboard:recovered.leaderboard},matches[0].rewards,env); } catch(error) {return json({error:'Cannot safely match members: '+String(error.message||error)+'. No draft was changed.'},409);}
    if(!fresh)return json({error:'Unable to calculate from archived standings'},409);
    fresh.status='pending_review';fresh.approvedAt=null;fresh.approvalSource=null;
    fresh.payouts=fresh.payouts.map(p=>({...p,status:'pending_review'}));
    fresh.recalculatedAt=new Date().toISOString();fresh.currentRewardsEventId=matches[0].id;
    fresh.womVerified=true;fresh.womCompetitionIds=recovered.competitionIds;fresh.womComponentCounts=recovered.componentCounts;fresh.womParticipantCount=recovered.leaderboard.length;
    if(fresh.reportRows?.length!==fresh.womParticipantCount)return json({error:'Recovered leaderboard/report mismatch. No changes made.'},409);
    await kv.put(key,JSON.stringify(fresh));
    const persisted=parse(await kv.get(key),null);
    if(!persisted || persisted.recalculatedAt!==fresh.recalculatedAt || persisted.womVerified!==true || persisted.reportRows?.length!==fresh.womParticipantCount || JSON.stringify(persisted.payouts)!==JSON.stringify(fresh.payouts) || JSON.stringify(persisted.sourceRewards)!==JSON.stringify(fresh.sourceRewards))return json({error:'Payout draft did not match the recalculated result after saving. No approval is permitted.'},503);
    return json({draft:persisted,updated:true,rewardSource:'current_event_settings',sourceEventId:matches[0].id,recipients:fresh.payouts.length,participants:fresh.womParticipantCount,componentCounts:fresh.womComponentCounts,unresolved:fresh.unresolved.length});
  }
  if(draft.payouts?.some(p=>!/^\d{17,20}$/.test(String(p.discordId||''))||!Number.isSafeInteger(p.embers)||p.embers<=0||p.embers>100000))return json({error:'Invalid payout recipient or amount'},409);
  if(new Set((draft.payouts||[]).map(p=>String(p.discordId))).size!==(draft.payouts||[]).length)return json({error:'Duplicate payout recipient'},409);
  if(body.action==='approve' && (!draft.womVerified || !Number.isInteger(draft.womParticipantCount) || draft.womParticipantCount<2 || draft.reportRows?.length!==draft.womParticipantCount))return json({error:'Full WOM standings have not been verified for this draft. Recalculate first.'},409);
  if(body.action==='approve' && !draft.payouts?.some(p=>p.rank===1&&p.source==='placement'))return json({error:'First-place placement payout is missing'},409);
  if(draft.status!=='pending_review')return json({error:'Payout has already been reviewed',status:draft.status},409);
  if(body.action==='approve'&&(draft.unresolved?.length||!draft.payouts?.length))return json({error:'Resolve unmatched members and reward thresholds before approving'},409);
  const next={...draft,status:body.action==='approve'?'approved':'rejected',reviewedAt:new Date().toISOString(),payouts:draft.payouts.map(p=>({...p,status:body.action==='approve'?'pending':'rejected'}))};
  await kv.put(key,JSON.stringify(next));
  return json({draft:next});
}
