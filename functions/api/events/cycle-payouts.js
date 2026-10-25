import { hybridKv } from '../../_hybridKv.js';
const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback;}catch{return fallback;}};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequest({request,env}) {
  if(!env.CYCLE_AUTOMATION_SECRET||request.headers.get('Authorization')!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return json({error:'Unauthorized'},401);
  const kv=hybridKv(env,'drops');
  if(request.method==='GET') {
    const archive=parse(await kv.get('events:archive'),[]);
    const jobs=[];
    for(const entry of (Array.isArray(archive)?archive:[]).filter(e=>['sotw','botw'].includes(e.type)).slice(0,30)) {
      const draft=parse(await kv.get(`events:cycle-payout:${entry.archiveRequestId}`),null);
      if(draft?.status==='approved')for(const p of draft.payouts||[])if(p.status==='pending')jobs.push({id:draft.id,discordId:p.discordId,embers:p.embers,rsn:p.rsn});
    }
    return json({jobs:jobs.slice(0,50)});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const body=await request.json().catch(()=>null);
  if(!body||body.action!=='credited'||typeof body.id!=='string'||!/^cycle-(sotw|botw):\d{4}-\d{2}-\d{2}-\d+$/.test(body.id)||!/^\d{17,20}$/.test(String(body.discordId||'')))return json({error:'Invalid receipt'},400);
  const key=`events:cycle-payout:${body.id}`;
  const draft=parse(await kv.get(key),null);
  if(draft?.status!=='approved')return json({error:'Payout not approved'},409);
  const target=draft.payouts.find(p=>p.discordId===String(body.discordId));
  if(!target)return json({error:'Unknown recipient'},404);
  if(target.status==='credited')return json({success:true,alreadyCredited:true});
  if(target.status!=='pending')return json({error:'Invalid recipient state'},409);
  target.status='credited';target.creditedAt=new Date().toISOString();
  await kv.put(key,JSON.stringify(draft));return json({success:true});
}
