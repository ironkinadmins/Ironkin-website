import { supabaseRest, isUniqueViolation } from "../_supabase.js";
import { womFetch } from "../../_wom.js";

export const CONTRACT_TIERS={safe:{label:"Safe",points:3,slots:2},risky:{label:"Risky",points:7,slots:4},"all-in":{label:"All-In",points:15,slots:2}};
export const CONTRACT_REFRESH_MS=10*60*1000;
export const CONTRACT_MANUAL_REFRESH_MS=60*1000;
const num=v=>Math.max(0,Number(v)||0);
export function cleanContracts(list){return (Array.isArray(list)?list:[]).map((c,i)=>({id:String(c.id||`contract-${i+1}`),name:String(c.name||`Contract ${i+1}`),tier:CONTRACT_TIERS[c.tier]?c.tier:"safe",metric:String(c.metric||"").trim(),metricLabel:String(c.metricLabel||c.metric||"").trim(),target:Math.max(1,Number(c.target)||1)})).filter(c=>c.metric);}
function snapshotFrom(data){return data?.latestSnapshot||data?.player?.latestSnapshot||data?.snapshot||null;}
const METRIC_ALIASES={
  corrupted_gauntlet:"the_corrupted_gauntlet",
  gauntlet:"the_gauntlet"
};
function metricKeys(metric){
  const key=String(metric||"").trim();
  const keys=[key,METRIC_ALIASES[key]];
  // Be tolerant of WOM boss keys that use a leading `the_` while an admin
  // entered the shorter human-friendly key in the contract pool.
  if(key&&!key.startsWith("the_"))keys.push(`the_${key}`);
  if(key.startsWith("the_"))keys.push(key.slice(4));
  return [...new Set(keys.filter(Boolean))];
}
export function metricValue(snapshot,metric){
  const d=snapshot?.data||snapshot||{};
  for(const bucket of [d.skills,d.bosses,d.activities]){
    for(const key of metricKeys(metric)){
      const row=bucket?.[key];
      if(typeof row==="number")return num(row);
      if(row&&typeof row==="object"){for(const field of ["experience","kills","score","value"]){if(row[field]!==undefined)return num(row[field]);}}
    }
  }
  return 0;
}
async function recoverBaselineFromClaimSnapshot(env,claim){
  const claimedMs=new Date(claim.claimed_at||0).getTime();
  if(!Number.isFinite(claimedMs))return null;
  // Claiming a contract forces a WOM update. Recover that historical snapshot
  // instead of treating a previously mis-mapped metric as a genuine zero.
  const start=new Date(claimedMs-10*60*1000).toISOString();
  const end=new Date(claimedMs+10*60*1000).toISOString();
  const r=await womFetch(env,`/players/${encodeURIComponent(claim.rsn)}/snapshots?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&limit=100`,{},"Ironkin Games Contracts");
  if(!r.ok)return null;
  const payload=await r.json().catch(()=>[]);
  const rows=Array.isArray(payload)?payload:(Array.isArray(payload?.data)?payload.data:[]);
  const candidates=rows.map(snapshot=>({snapshot,time:new Date(snapshot?.createdAt||snapshot?.updatedAt||0).getTime(),value:metricValue(snapshot,claim.metric)}))
    .filter(x=>Number.isFinite(x.time)&&x.value>0)
    .sort((a,b)=>Math.abs(a.time-claimedMs)-Math.abs(b.time-claimedMs));
  return candidates[0]||null;
}
const WOM_RETRYABLE_STATUSES=new Set([500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function updatePlayerWithRetry(env,name){
  const delays=[0,1000,2000];
  let lastStatus=0,lastMessage="";
  for(let attempt=0;attempt<delays.length;attempt++){
    if(delays[attempt])await sleep(delays[attempt]);
    const r=await womFetch(env,`/players/${encodeURIComponent(name)}`,{method:"POST"},"Ironkin Games Contracts");
    const text=await r.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch{}
    if(r.ok)return data;
    lastStatus=r.status;
    lastMessage=String(data?.message||data?.error||"").trim();
    // 429 is an explicit rate-limit response: do not hammer WOM with immediate retries.
    if(!WOM_RETRYABLE_STATUSES.has(r.status))break;
  }
  throw new Error(lastMessage||`WOM returned ${lastStatus||"an error"}`);
}

export async function updateAndReadMetric(env,rsn,metric,{requireFresh=false}={}){const name=String(rsn||"").trim();if(!name)throw new Error("Your roster profile does not have an RSN assigned.");const requestedAt=Date.now();let data={};try{data=await updatePlayerWithRetry(env,name);}catch(e){throw new Error(`Could not update Wise Old Man: ${e.message}`);}let snap=snapshotFrom(data);const fresh=s=>{const t=new Date(s?.createdAt||s?.updatedAt||0).getTime();return Number.isFinite(t)&&t>=requestedAt-5000;};if(!snap||(requireFresh&&!fresh(snap))){for(let i=0;i<6;i++){if(i)await sleep(550);const r=await womFetch(env,`/players/${encodeURIComponent(name)}`,{},"Ironkin Games Contracts");if(!r.ok)continue;const d=await r.json().catch(()=>({}));const candidate=snapshotFrom(d);if(candidate&&(!requireFresh||fresh(candidate))){snap=candidate;break;}}}if(!snap)throw new Error("Wise Old Man did not return a player snapshot.");if(requireFresh&&!fresh(snap))throw new Error("WOM has not confirmed a fresh baseline yet. Please try again in a moment.");return{value:metricValue(snap,metric),snapshotAt:snap.createdAt||snap.updatedAt||new Date().toISOString()};}
export async function listClaims(env,weekId,challengeId,teamId,testMode=false){const r=await supabaseRest(env,`ironkin_games_contract_claims?week_id=eq.${encodeURIComponent(weekId)}&challenge_id=eq.${encodeURIComponent(challengeId)}&team_id=eq.${encodeURIComponent(teamId)}&is_test=eq.${testMode?"true":"false"}&select=*&order=claimed_at.asc`);return await r.json();}
export async function insertClaim(env,row){try{const r=await supabaseRest(env,"ironkin_games_contract_claims",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify([row])});return (await r.json())?.[0]||null;}catch(e){if(isUniqueViolation(e))throw Object.assign(new Error("That contract was just claimed, or you already have a contract."),{status:409});throw e;}}
export async function refreshClaim(env,claim,force=false,bypassCooldown=false){
  const last=new Date(claim.last_refreshed_at||claim.claimed_at||0).getTime();
  const minAge=force?CONTRACT_MANUAL_REFRESH_MS:CONTRACT_REFRESH_MS;
  if(!bypassCooldown&&Number.isFinite(last)&&Date.now()-last<minAge)return claim;
  const snap=await updateAndReadMetric(env,claim.rsn,claim.metric);
  let baseline=num(claim.baseline);
  let repairedBaseline=null;
  // A zero baseline can be legitimate. Only repair it when the current metric is
  // positive AND WOM has a positive snapshot from the actual claim window.
  // This specifically repairs claims created while a metric alias was wrong
  // (e.g. corrupted_gauntlet vs the_corrupted_gauntlet) without guessing.
  if(baseline===0&&snap.value>0){
    try{
      const recovered=await recoverBaselineFromClaimSnapshot(env,claim);
      if(recovered){baseline=recovered.value;repairedBaseline=recovered;}
    }catch{}
  }
  const progress=Math.max(0,snap.value-baseline),completed=Boolean(claim.completed)||progress>=num(claim.target),now=new Date().toISOString();
  const patch={current_value:snap.value,progress,completed,last_refreshed_at:now,updated_at:now,...(repairedBaseline?{baseline,baseline_snapshot_at:new Date(repairedBaseline.time).toISOString()}:{}),...(completed&&!claim.completed?{completed_at:now}:{})};
  const r=await supabaseRest(env,`ironkin_games_contract_claims?id=eq.${encodeURIComponent(claim.id)}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(patch)});
  const saved=(await r.json())?.[0]||{...claim,...patch};
  return{...saved,_wom:{snapshotAt:snap.snapshotAt,currentValue:snap.value,baseline,progress,baselineRepaired:Boolean(repairedBaseline)}};
}
