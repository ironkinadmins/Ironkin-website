import { supabaseRest, hasSupabase } from './api/_supabase.js';
// Build a review-only payout draft from the exact archived WOM snapshot.
// No Embers are credited by this module.
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const normalize = value => String(value || '').trim().toLowerCase().replace(/[ _-]+/g, ' ');
const amount = value => { const match = String(value || '').match(/(\d[\d,]*)\s*embers?/i); return match ? Number(match[1].replaceAll(',', '')) : 0; };
const threshold = value => {
  const match = String(value || '').match(/(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\s*(?:xp|kills?|kc)\b/i);
  if (!match) return null;
  const multiplier = {k:1e3,m:1e6,b:1e9}[String(match[2] || '').toLowerCase()] || 1;
  return Number(match[1].replaceAll(',', '')) * multiplier;
};
const HISTORICAL_ELITE_ID='3db76115-9da3-417d-9fc5-ccc98498095e';
const placementRank = value => {
  const m = String(value || '').match(/\b([1-9]\d*)(?:st|nd|rd|th)?\s*(?:place)?\b/i);
  return m ? Number(m[1]) : null;
};
export async function buildCyclePayoutDraft(kv, entry, rewardOverride = null, env = null, manualAliases = {}) {
  if (!['sotw','botw','botw-standard','botw-elite'].includes(entry?.type) || !entry?.archiveRequestId) return null;
  const rewards = rewardOverride || entry.rewards || {};
  // Never auto-award a tied first place or a non-finite/negative WOM gain.
  const rawRows = Array.isArray(entry.leaderboard) ? entry.leaderboard : [];
  const invalidRows = rawRows.filter(row => !Number.isFinite(Number(row.gained)) || Number(row.gained) < 0);
  const duplicateNames = rawRows.map(row => normalize(row.name)).filter((name, i, all) => name && all.indexOf(name) !== i);
  const placement = (rewards.placement || []).map(item => ({rank:placementRank(item.label),embers:amount(item.reward),label:item.label})).filter(item => item.rank && item.embers > 0);
  const participation = (rewards.participation || []).map(item => ({minimum:threshold(item.requirement),embers:amount(item.reward),requirement:item.requirement}));
  const invalidParticipation = participation.filter(item=>item.minimum===null || !Number.isFinite(item.minimum) || item.minimum<0 || !Number.isSafeInteger(item.embers) || item.embers<=0);
  const eligibleParticipation = participation.filter(item=>!invalidParticipation.includes(item)).sort((a,b)=>b.minimum-a.minimum);
  const rankRewards = new Map(placement.map(item=>[item.rank,item]));
  // Bulk-read indexed member profiles through PostgREST instead of one
  // Supabase+KV round trip per Discord member (which exceeds Workers limits).
  const index = parse(await kv.get('member-profiles:index'), []);
  const ids = [...new Set((Array.isArray(index) ? index : [])
    .map(candidate => String(candidate.discordId || ''))
    .filter(id => /^\d{17,20}$/.test(id)))];
  if (env && !hasSupabase(env)) throw Error('Bulk profile matching requires server-side Supabase access');
  const profiles = [];
  const found = new Set();
  if (!env) {
    for (const discordId of ids) {
      const profile = parse(await kv.get(`member-profile:${discordId}`), {});
      found.add(discordId);
      profiles.push({discordId,names:[profile.rsn,...(Array.isArray(profile.previousRsns)?profile.previousRsns:[])]
        .map(normalize).filter(Boolean)});
    }
  }
  for (let offset = 0; env && offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const keys = batch.map(id => `member-profile:${id}`);
    const filter = `(${keys.map(key => `"${key}"`).join(',')})`;
    const response = await supabaseRest(env,
      `website_store?namespace=eq.drops&key=in.${encodeURIComponent(filter)}&select=key,value&limit=100`);
    const records = await response.json();
    if (!Array.isArray(records) || records.length > batch.length)
      throw Error('Bulk profile query returned unexpected results');
    for (const record of records) {
      const discordId = String(record.key || '').replace(/^member-profile:/, '');
      if (!batch.includes(discordId) || found.has(discordId)) continue;
      found.add(discordId);
      const profile = parse(record.value, {});
      profiles.push({discordId,names:[profile.rsn,...(Array.isArray(profile.previousRsns)?profile.previousRsns:[])]
        .map(normalize).filter(Boolean)});
    }
  }
  // An indexed profile missing from the bulk directory is not proof that
  // its owner is unlinked. Build a reviewable draft, but fail closed on approval.
  const missingProfileIds = ids.filter(id => !found.has(id));
  const profileDirectoryDiagnostic = {
    indexed: ids.length, retrieved: found.size, missing: missingProfileIds.length,
    missingDiscordIds: missingProfileIds
  };
  const rows = rawRows.filter(row => Number.isFinite(Number(row.gained)) && Number(row.gained) >= 0).sort((a,b)=>Number(b.gained)-Number(a.gained));
  const unresolved = [];
  if (missingProfileIds.length) unresolved.push({
    reason: 'Indexed Discord profiles are missing from the Supabase directory; recipient matching may be incomplete. Review missing IDs before approval.',
    count: missingProfileIds.length, discordIds: missingProfileIds
  });
  if (invalidRows.length) unresolved.push({reason:'Invalid WOM gains require manual review',count:invalidRows.length});
  if (duplicateNames.length) unresolved.push({reason:'Duplicate RSN in WOM standings',rsns:[...new Set(duplicateNames)]});
  const sharedSecond=entry.archiveRequestId===HISTORICAL_ELITE_ID && (entry.type==='botw-elite'||entry.botwTier==='elite');
  const firstScore=Number(rows[0]?.gained);
  const secondScore=Number(rows[1]?.gained);
  if (rows.length>1 && firstScore===secondScore && firstScore>0)
    unresolved.push({reason:'First-place tie requires Council review; no automatic winner assigned'});
  if (!sharedSecond && rows.length>2 && rows.slice(1,4).some((row,i)=>i>0 && Number(row.gained)===Number(rows[i].gained)))
    unresolved.push({reason:'Tie affects placement ranking; manual resolution required'});
  // Nov 13 Elite policy: tied second-place scores share the second-place reward;
  // the third-place award is skipped. Never award placement based on row order.
  const secondPlaceTie=sharedSecond && firstScore>secondScore && secondScore>0 &&
    rows.filter(row=>Number(row.gained)===secondScore).length===2;
  if(sharedSecond && secondScore>0 && rows.filter(row=>Number(row.gained)===secondScore).length>2)
    unresolved.push({reason:'More than two players tied for second; Council review required'});
  if(invalidParticipation.length)unresolved.push({reason:'Participation requirements or Ember amounts are invalid',requirements:invalidParticipation.map(x=>x.requirement)});
  if(!rankRewards.has(1))unresolved.push({reason:'First-place reward is missing'});
  const payouts = [];
  const reportRows = [];
  const nameToProfiles = new Map();
  for (const profile of profiles) for (const name of profile.names) {
    if (!nameToProfiles.has(name)) nameToProfiles.set(name, []);
    nameToProfiles.get(name).push(profile);
  }
  if (!rows.some(row=>Number(row.gained)>0)) unresolved.push({reason:'No positive WOM gain in final standings'});
  for (let i=0;i<rows.length;i++) {
    const row=rows[i],rank=i+1;
    // Placement overrides participation; do not stack.
    const effectiveRank=secondPlaceTie && Number(row.gained)===secondScore ? 2 :
      secondPlaceTie && Number(row.gained)<secondScore ? rank : rank;
    const placed=Number(row.gained)>0 && !(sharedSecond && rank===3 && secondPlaceTie && Number(row.gained)<secondScore)
      ?rankRewards.get(effectiveRank):null;
    const tier=placed?null:eligibleParticipation.find(t=>Number(row.gained)>=t.minimum);
    const embers=placed?.embers??tier?.embers??0;
    if(!embers){reportRows.push({rsn:String(row.name),rank,gained:Number(row.gained),embers:0,source:"ineligible",status:"not_eligible"});continue;}
    const aliasId=manualAliases[normalize(row.name)];
    const matching=aliasId ? profiles.filter(profile=>profile.discordId===String(aliasId)) : (nameToProfiles.get(normalize(row.name)) || []);
    if(aliasId && matching.length!==1) unresolved.push({rsn:row.name,reason:'Staff-confirmed historical alias points to a profile not available in the directory'});
    if(matching.length!==1){const reason=matching.length?'Ambiguous linked Discord accounts':'No linked Discord account';unresolved.push({rsn:row.name,reason});reportRows.push({rsn:String(row.name),rank,gained:Number(row.gained),embers,source:placed?'placement':'participation',status:'unmatched',reason});continue;}
    payouts.push({discordId:matching[0].discordId,rsn:String(row.name),rank,gained:Number(row.gained),embers,source:placed?'placement':'participation'});
    reportRows.push({discordId:matching[0].discordId,rsn:String(row.name),rank,gained:Number(row.gained),embers,source:placed?'placement':'participation',status:'pending_review'});
  }
  if (payouts.some(row => !Number.isSafeInteger(row.embers) || row.embers <= 0 || row.embers > 100000)) unresolved.push({reason:'Invalid or excessive Ember amount'});
  if(new Set(payouts.map(p=>p.discordId)).size!==payouts.length)unresolved.push({reason:'Multiple payouts resolve to the same Discord account'});
  // Fail closed: never publish an automatically approved draft for ambiguous results.
  return {id:entry.archiveRequestId,archiveId:entry.id,eventId:entry.eventId,type:entry.type,createdAt:new Date().toISOString(),status:unresolved.length || !payouts.length ? 'pending_review' : 'approved',payouts:payouts.map(p=>({...p,status:unresolved.length || !payouts.length ? 'pending_review' : 'pending'})),unresolved,reportRows,profileDirectoryDiagnostic,historicalAliasOverrides:manualAliases,sharedSecondPlace:secondPlaceTie,sourceRewards:rewards,rewardSource:rewardOverride?"current_event_settings":"archived_snapshot",approvedAt:unresolved.length || !payouts.length ? null : new Date().toISOString(),approvalSource:unresolved.length || !payouts.length ? null : 'verified-automatic'};
}
