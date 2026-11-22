import { hybridKv } from '../../../_hybridKv.js';
import { buildCyclePayoutDraft } from '../../../_cyclePayouts.js';
import { getSession, isStaffSession } from '../../_auth.js';
const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback;}catch{return fallback;}};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequest({request,env}) {
  if(!isStaffSession(await getSession(request,env)))return json({error:'Staff only'},403);
  const kv=hybridKv(env,'drops');
  if(request.method==='GET') {
    const archive=parse(await kv.get('events:archive'),[]);
    const drafts=[];
    for(const entry of (Array.isArray(archive)?archive:[]).filter(e=>['sotw','botw','botw-standard','botw-elite'].includes(e.type))) {
      const draft=parse(await kv.get(`events:cycle-payout:${entry.archiveRequestId}`),null);
      if(draft)drafts.push(draft);
    }
    return json({drafts});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const origin=request.headers.get('Origin');
  if(!origin||new URL(origin).origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  const body=await request.json().catch(()=>null);
  if(body?.action==='prepare') {
    if(body.date!==undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.date))return json({error:'Invalid date'},400);
    const archive=parse(await kv.get('events:archive'),[]);
    const selected=(Array.isArray(archive)?archive:[]).filter(e=>
      ['sotw','botw','botw-standard','botw-elite'].includes(e.type) &&
      typeof e.archiveRequestId==='string' &&
      /^cycle-(sotw|botw|botw-standard|botw-elite):\d{4}-\d{2}-\d{2}-\d+$/.test(e.archiveRequestId) &&
      (!body.date || String(e.archiveRequestId).includes(':'+body.date+'-'))
    );
    if(!selected.length)return json({error:'No matching archived cycle competitions. Check the archive first; this action will not invent results.'},404);
    const results=[];
    for(const entry of selected){
      const key=`events:cycle-payout:${entry.archiveRequestId}`;
      const existing=parse(await kv.get(key),null);
      if(existing){results.push({id:entry.archiveRequestId,status:'existing',draftStatus:existing.status});continue;}
      const draft=await buildCyclePayoutDraft(kv,entry);
      if(!draft){results.push({id:entry.archiveRequestId,status:'skipped'});continue;}
      // Backfilled drafts require explicit staff review, even when fully matched.
      draft.status='pending_review';
      draft.approvedAt=null;
      draft.approvalSource=null;
      draft.payouts=(draft.payouts||[]).map(p=>({...p,status:'pending_review'}));
      await kv.put(key,JSON.stringify(draft));
      results.push({id:entry.archiveRequestId,status:'prepared',unresolved:draft.unresolved?.length||0});
    }
    return json({results});
  }
  if(!body||!['approve','reject'].includes(body.action)||typeof body.id!=='string'||!/^cycle-(sotw|botw|botw-standard|botw-elite):\d{4}-\d{2}-\d{2}-\d+$/.test(body.id))return json({error:'Invalid request'},400);
  const key=`events:cycle-payout:${body.id}`;
  const draft=parse(await kv.get(key),null);
  if(!draft)return json({error:'Payout draft not found'},404);
  // A draft must still belong to a real, immutable archived event.
  const archive=parse(await kv.get('events:archive'),[]);
  const source=Array.isArray(archive)?archive.find(entry=>entry.archiveRequestId===body.id):null;
  if(!source||source.id!==draft.archiveId||source.eventId!==draft.eventId||source.type!==draft.type)return json({error:'Archived source no longer matches payout draft'},409);
  if(draft.payouts?.some(p=>!/^\d{17,20}$/.test(String(p.discordId||''))||!Number.isSafeInteger(p.embers)||p.embers<=0||p.embers>100000))return json({error:'Invalid payout recipient or amount'},409);
  if(new Set((draft.payouts||[]).map(p=>String(p.discordId))).size!==(draft.payouts||[]).length)return json({error:'Duplicate payout recipient'},409);
  if(body.action==='approve' && (draft.payouts?.length!==1 || draft.payouts[0]?.rank!==1 || draft.payouts[0]?.source!=='placement'))return json({error:'Only one first-place placement payout may be approved'},409);
  if(draft.status!=='pending_review')return json({error:'Payout has already been reviewed',status:draft.status},409);
  if(body.action==='approve'&&(draft.unresolved?.length||!draft.payouts?.length))return json({error:'Resolve unmatched members and reward thresholds before approving'},409);
  const next={...draft,status:body.action==='approve'?'approved':'rejected',reviewedAt:new Date().toISOString(),payouts:draft.payouts.map(p=>({...p,status:body.action==='approve'?'pending':'rejected'}))};
  await kv.put(key,JSON.stringify(next));
  return json({draft:next});
}
