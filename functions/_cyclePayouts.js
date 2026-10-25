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
const placementRank = value => {
  const m = String(value || '').match(/\b([1-9]\d*)(?:st|nd|rd|th)?\s*(?:place)?\b/i);
  return m ? Number(m[1]) : null;
};
export async function buildCyclePayoutDraft(kv, entry) {
  if (!['sotw','botw'].includes(entry?.type) || !entry?.archiveRequestId) return null;
  const rewards = entry.rewards || {};
  const placement = (rewards.placement || []).map(item => ({rank:placementRank(item.label),embers:amount(item.reward),label:item.label})).filter(item => item.rank && item.embers > 0);
  const participation = (rewards.participation || []).map(item => ({minimum:threshold(item.requirement),embers:amount(item.reward),requirement:item.requirement})).filter(item => item.embers > 0);
  const index = parse(await kv.get('member-profiles:index'), []);
  const profiles = [];
  for (const candidate of Array.isArray(index) ? index : []) {
    if (!/^\d{17,20}$/.test(String(candidate.discordId || ''))) continue;
    const profile = parse(await kv.get(`member-profile:${candidate.discordId}`), {});
    profiles.push({discordId:String(candidate.discordId),names:[profile.rsn,...(Array.isArray(profile.previousRsns)?profile.previousRsns:[])].map(normalize).filter(Boolean)});
  }
  const rows = (Array.isArray(entry.leaderboard) ? entry.leaderboard : []).filter(row => Number(row.gained) > 0).sort((a,b)=>Number(b.gained)-Number(a.gained));
  const unresolved = [];
  const payouts = [];
  let rank = 0;
  let lastGained = null;
  for (let i=0;i<rows.length;i++) {
    const row=rows[i];const gained=Number(row.gained);
    if (gained !== lastGained) rank=i+1;
    lastGained=gained;
    const matching=profiles.filter(profile=>profile.names.includes(normalize(row.name)));
    const place=placement.find(item=>item.rank===rank);
    const qualifying=participation.filter(item=>item.minimum !== null && gained>=item.minimum).sort((a,b)=>b.embers-a.embers)[0];
    const highest=Math.max(place?.embers||0,qualifying?.embers||0);
    if (matching.length !== 1) {unresolved.push({rsn:row.name,reason:matching.length?'Ambiguous linked Discord accounts':'No linked Discord account'});continue;}
    if (!highest) continue;
    payouts.push({discordId:matching[0].discordId,rsn:String(row.name),rank,gained,embers:highest,source:(place?.embers||0)>= (qualifying?.embers||0)?'placement':'participation'});
  }
  const duplicateIds = payouts.map(row=>row.discordId).filter((id,i,all)=>all.indexOf(id)!==i);
  if (duplicateIds.length) unresolved.push({reason:'Multiple WOM rows map to one Discord account',discordIds:[...new Set(duplicateIds)]});
  if (participation.some(item=>item.minimum===null)) unresolved.push({reason:'Participation thresholds are not numeric; manual review required',requirements:participation.filter(item=>item.minimum===null).map(item=>item.requirement)});
  return {id:entry.archiveRequestId,archiveId:entry.id,eventId:entry.eventId,type:entry.type,createdAt:new Date().toISOString(),status:'pending_review',payouts,unresolved,sourceRewards:rewards,approvedAt:null};
}
