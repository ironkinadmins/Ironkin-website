// Authenticated Forgewarden payout transport. Never credits Embers itself.
import { hybridKv } from '../../_hybridKv.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const parse=s=>{try{return s?JSON.parse(s):null;}catch{return null;}};
const validId=/^(?:cycle-(?:sotw|botw|botw-standard|botw-elite):\d{4}-\d{2}-\d{2}-\d+|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
export async function onRequest({request,env}) {
  if(!env.CYCLE_AUTOMATION_SECRET || request.headers.get('Authorization')!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return json({error:'Unauthorized'},401);
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
  const kv=hybridKv(env,'drops');
  const archive=parse(await kv.get('events:archive'))||[];
  if(!Array.isArray(archive))return json({error:'Archive unavailable'},503);
  if(request.method==='GET'){
    const jobs=[];
    for(const entry of archive){
      const id=String(entry?.archiveRequestId||'');if(!validId.test(id))continue;
      const draft=parse(await kv.get(`events:cycle-payout:${id}`));
      if(!draft||draft.status!=='approved'||!draft.approvedAt||draft.id!==id||!draft.womVerified||draft.reportRows?.length!==draft.womParticipantCount||draft.unresolved?.length)continue;
      const payouts=Array.isArray(draft.payouts)?draft.payouts:[];
      if(!payouts.length||payouts.some(x=>!/^[0-9]{17,20}$/.test(String(x.discordId||''))||!Number.isSafeInteger(x.embers)||x.embers<=0))continue;
      const eligible=(draft.reportRows||[]).filter(x=>Number(x.embers)>0);
      if(eligible.length!==payouts.length||new Set(payouts.map(x=>String(x.discordId))).size!==payouts.length)continue;
      if(eligible.some(x=>!payouts.some(p=>String(p.discordId)===String(x.discordId)&&Number(p.embers)===Number(x.embers))))continue;
      for(const payout of payouts){
        if(payout.status==='pending')jobs.push({id,discordId:String(payout.discordId),embers:payout.embers});
      }
    }
    return json({jobs});
  }
  const body=await request.json().catch(()=>null);
  if(body?.action!=='credited'||!validId.test(body.id)||!/^[0-9]{17,20}$/.test(String(body.discordId||'')))return json({error:'Invalid receipt'},400);
  if(!archive.some(e=>e.archiveRequestId===body.id))return json({error:'Unknown archive'},404);
  const key=`events:cycle-payout:${body.id}`;
  const draft=parse(await kv.get(key));
  if(!draft||draft.status!=='approved'||!draft.approvedAt)return json({error:'Draft is not approved'},409);
  const payout=draft.payouts?.find(p=>String(p.discordId)===String(body.discordId));
  if(!payout)return json({error:'Recipient not in approved draft'},404);
  if(payout.status==='credited')return json({ok:true,alreadyCredited:true});
  if(payout.status!=='pending')return json({error:'Unexpected payout state'},409);
  // The bot commits the ledger and balance atomically BEFORE sending this receipt.
  payout.status='credited';payout.creditedAt=new Date().toISOString();
  await kv.put(key,JSON.stringify(draft));
  return json({ok:true});
}
