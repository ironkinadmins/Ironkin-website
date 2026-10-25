import { hybridKv } from '../../../_hybridKv.js';
import { getSession, isStaffSession } from '../../_auth.js';
const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback;}catch{return fallback;}};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequest({request,env}) {
  if(!isStaffSession(await getSession(request,env)))return json({error:'Staff only'},403);
  const kv=hybridKv(env,'drops');
  if(request.method==='GET') {
    const archive=parse(await kv.get('events:archive'),[]);
    const drafts=[];
    for(const entry of (Array.isArray(archive)?archive:[]).filter(e=>['sotw','botw'].includes(e.type)).slice(0,30)) {
      const draft=parse(await kv.get(`events:cycle-payout:${entry.archiveRequestId}`),null);
      if(draft)drafts.push(draft);
    }
    return json({drafts});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const origin=request.headers.get('Origin');
  if(!origin||new URL(origin).origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  const body=await request.json().catch(()=>null);
  if(!body||!['approve','reject'].includes(body.action)||typeof body.id!=='string'||!/^cycle-(sotw|botw):\d{4}-\d{2}-\d{2}-\d+$/.test(body.id))return json({error:'Invalid request'},400);
  const key=`events:cycle-payout:${body.id}`;
  const draft=parse(await kv.get(key),null);
  if(!draft)return json({error:'Payout draft not found'},404);
  if(draft.status!=='pending_review')return json({error:'Payout has already been reviewed',status:draft.status},409);
  if(body.action==='approve'&&(draft.unresolved?.length||!draft.payouts?.length))return json({error:'Resolve unmatched members and reward thresholds before approving'},409);
  const next={...draft,status:body.action==='approve'?'approved':'rejected',reviewedAt:new Date().toISOString(),payouts:draft.payouts.map(p=>({...p,status:body.action==='approve'?'pending':'rejected'}))};
  await kv.put(key,JSON.stringify(next));
  return json({draft:next});
}
