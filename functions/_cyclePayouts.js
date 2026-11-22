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
  if (!['sotw','botw','botw-standard','botw-elite'].includes(entry?.type) || !entry?.archiveRequestId) return null;
  const rewards = entry.rewards || {};
  // Never auto-award a tied first place or a non-finite/negative WOM gain.
  const rawRows = Array.isArray(entry.leaderboard) ? entry.leaderboard : [];
  const invalidRows = rawRows.filter(row => !Number.isFinite(Number(row.gained)) || Number(row.gained) < 0);
  const duplicateNames = rawRows.map(row => normalize(row.name)).filter((name, i, all) => name && all.indexOf(name) !== i);
  const placement = (rewards.placement || []).map(item => ({rank:placementRank(item.label),embers:amount(item.reward),label:item.label})).filter(item => item.rank && item.embers > 0);
  // Only the configured first-place placement is payable. No participation awards.
  const first = placement.filter(item => item.rank === 1);
  const index = parse(await kv.get('member-profiles:index'), []);
  const profiles = [];
  for (const candidate of Array.isArray(index) ? index : []) {
    if (!/^\d{17,20}$/.test(String(candidate.discordId || ''))) continue;
    const profile = parse(await kv.get(`member-profile:${candidate.discordId}`), {});
    profiles.push({discordId:String(candidate.discordId),names:[profile.rsn,...(Array.isArray(profile.previousRsns)?profile.previousRsns:[])].map(normalize).filter(Boolean)});
  }
  const rows = rawRows.filter(row => Number.isFinite(Number(row.gained)) && Number(row.gained) > 0).sort((a,b)=>Number(b.gained)-Number(a.gained));
  const unresolved = [];
  if (invalidRows.length) unresolved.push({reason:'Invalid WOM gains require manual review',count:invalidRows.length});
  if (duplicateNames.length) unresolved.push({reason:'Duplicate RSN in WOM standings',rsns:[...new Set(duplicateNames)]});
  if (rows.length > 1 && Number(rows[0].gained) === Number(rows[1].gained)) unresolved.push({reason:'First-place tie requires manual resolution'});
  const payouts = [];
  if (first.length !== 1) unresolved.push({reason:'Exactly one first-place Ember reward must be configured in BOTW/SOTW Rewards (2)'});
  if (!rows.length) unresolved.push({reason:'No positive WOM gain in final standings'});
  if (rows.length && first.length === 1) {
    const winner = rows[0];
    const matching = profiles.filter(profile => profile.names.includes(normalize(winner.name)));
    if (matching.length !== 1) unresolved.push({rsn:winner.name,reason:matching.length?'Ambiguous linked Discord accounts':'No linked Discord account'});
    else payouts.push({discordId:matching[0].discordId,rsn:String(winner.name),rank:1,gained:Number(winner.gained),embers:first[0].embers,source:'placement'});
  }
  if (payouts.some(row => !Number.isSafeInteger(row.embers) || row.embers <= 0 || row.embers > 100000)) unresolved.push({reason:'Invalid or excessive Ember amount'});
  // Fail closed: never publish an automatically approved draft for ambiguous results.
  return {id:entry.archiveRequestId,archiveId:entry.id,eventId:entry.eventId,type:entry.type,createdAt:new Date().toISOString(),status:unresolved.length || !payouts.length ? 'pending_review' : 'approved',payouts:payouts.map(p=>({...p,status:unresolved.length || !payouts.length ? 'pending_review' : 'pending'})),unresolved,sourceRewards:rewards,approvedAt:unresolved.length || !payouts.length ? null : new Date().toISOString(),approvalSource:unresolved.length || !payouts.length ? null : 'verified-automatic'};
}
