import { hybridKv } from '../../../_hybridKv.js';
import { getSession, isStaffSession } from '../../_auth.js';
import { hasSupabase, supabaseRest } from '../../_supabase.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const parse=(s)=>{try{return JSON.parse(s)}catch{return null}};
const validId=/^(?:cycle-(?:sotw|botw|botw-standard|botw-elite):\d{4}-\d{2}-\d{2}-\d+|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
async function fetchRows(env,path){
  const response=await supabaseRest(env,path);
  if(!response.ok)throw Error(`Supabase query failed (${response.status})`);
  const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid Supabase response');return rows;
}
export async function onRequestGet({request,env}){
  if(!isStaffSession(await getSession(request,env)))return json({error:'Staff only'},403);
  const id=new URL(request.url).searchParams.get('id');
  if(!id||!validId.test(id))return json({error:'Invalid event ID'},400);
  const kv=hybridKv(env,'drops');
  const archive=parse(await kv.get('events:archive'));
  const source=(Array.isArray(archive)?archive:[]).find(e=>e.archiveRequestId===id);
  if(!source)return json({error:'No matching archived event. Cannot verify an unknown payout ID.'},404);
  const draft=parse(await kv.get(`events:cycle-payout:${id}`));
  if(!draft)return json({error:'Draft not found'},404);
  if(!hasSupabase(env))return json({error:'Cannot verify payment: Supabase unavailable'},503);
  // This privileged, staff-only verification must use the service-role key.
  // Other site features retain their existing credential selection.
  const serviceRoleKey=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!serviceRoleKey)return json({error:'Payment verification requires a server-side SUPABASE_SERVICE_ROLE_KEY secret.'},503);
  const verifyEnv={...env,SUPABASE_SECRET_KEY:serviceRoleKey};
  try{
    // Check BOTH the durable payout ledger and the actual Ember transaction.
    const ledger=await fetchRows(verifyEnv,`cycle_payouts?archive_request_id=eq.${encodeURIComponent(id)}&select=id,user_id,amount,created_at&limit=1000`);
    if(ledger.length===1000)throw Error('Ledger result limit reached; report incomplete');
    const users=[...new Set(ledger.map(x=>String(x.user_id)).filter(x=>/^\d{1,20}$/.test(x)))];
    const transactions=users.length?await fetchRows(verifyEnv,`transactions?kind=eq.cycle_reward&user_id=in.(${users.join(',')})&select=id,user_id,delta,created_at,metadata&limit=1000`):[];
    if(transactions.length===1000)throw Error('Transaction result limit reached; report incomplete');
    const payoutMap=new Map((draft.payouts||[]).map(x=>[String(x.discordId),x]));
    const rows=(draft.reportRows||draft.payouts||[]).map(x=>{
      const userId=String(x.discordId||'');const payout=payoutMap.get(userId);
      const expected=Number(payout?.embers||x.embers||0);
      const credits=ledger.filter(l=>String(l.user_id)===userId);
      const matches=transactions.filter(t=>String(t.user_id)===userId && String(t.metadata?.archiveRequestId||'')===id);
      const confirmed=credits.length===1 && matches.length===1 && Number(credits[0].amount)===expected && Number(matches[0].delta)===expected;
      let status='not_eligible';
      if(expected>0 && !userId)status='unmatched';
      else if(expected>0 && confirmed)status='paid';
      else if(expected>0 && (credits.length||matches.length))status='requires_reconciliation';
      else if(expected>0 && payout?.status==='failed')status='failed';
      else if(expected>0)status='unpaid';
      return {rsn:x.rsn||'',discordId:userId,rank:x.rank,gained:x.gained,source:x.source,expectedEmbers:expected,status,paidEmbers:confirmed?expected:0,paidAt:confirmed?matches[0].created_at:null,transactionId:confirmed?matches[0].id:null,reason:x.reason||''};
    });
    // Include orphan ledger entries rather than silently omit them.
    for(const l of ledger){if(rows.some(r=>r.discordId===String(l.user_id)))continue;
      rows.push({rsn:'Unknown / no longer in draft',discordId:String(l.user_id),expectedEmbers:null,paidEmbers:0,status:'requires_reconciliation',reason:'Ledger entry is absent from the current payout draft',transactionId:null,paidAt:null});
    }
    return json({id,verifiedAt:new Date().toISOString(),rows,summary:{paid:rows.filter(r=>r.status==='paid').length,unpaid:rows.filter(r=>r.status==='unpaid').length,requiresReconciliation:rows.filter(r=>r.status==='requires_reconciliation').length,embersPaid:rows.reduce((s,r)=>s+r.paidEmbers,0)}});
  }catch(e){
    const denied=Number(e.status)===403||/permission denied/i.test(String(e.message||''));
    return json({error:denied?'Payment verification blocked: Supabase denied SELECT access to the payout ledger (403 / permission denied). This is a database privilege or key-role issue, not missing Cloudflare variables. No payment statuses can be confirmed. Check that the website and Forgewarden reference the SAME Supabase project and that the server-side credential has SELECT access; do not change RLS or expose credentials.':('Payment verification unavailable: '+String(e.message||e)),verification:'unavailable',diagnostic:{status:Number(e.status)||null,code:String(e.code||''),table:denied?'cycle_payouts':null}},503);
  }
}
