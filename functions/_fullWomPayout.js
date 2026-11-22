import { womFetch } from './_wom.js';
import { getEventWomCompetitionIds, normalizeWomStandingsRows } from './_womCompetition.js';

const normalize = value => String(value || '').trim().toLowerCase().replace(/[ _-]+/g, ' ');

// WOM v2 exposes competition participations on the competition details resource.
// /competitions/:id/standings returns 404 for historical competitions.
async function fullStandings(env, id) {
  const url=`https://api.wiseoldman.net/v2/competitions/${encodeURIComponent(id)}`;
  const response=await womFetch(env,url,{},'Ironkin-Payout-Recovery');
  if(!response.ok)throw Error(`WOM ${id} competition details request failed (${response.status})`);
  const body=await response.json();
  const raw=body?.participations;
  if(!Array.isArray(raw))throw Error(`WOM ${id} details did not include a participations array; no changes made`);
  const count=Number(body?.participantCount ?? body?._count?.participations);
  if(Number.isInteger(count)&&count>=0&&raw.length!==count)
    throw Error(`WOM ${id} incomplete: ${raw.length}/${count} participants`);
  const rows=normalizeWomStandingsRows(raw);
  if(rows.length!==raw.length)throw Error(`WOM ${id} contains ${raw.length-rows.length} unrecognized participants`);
  const players=new Map();
  for(const row of rows){
    const key=normalize(row.name);
    if(players.has(key))throw Error(`WOM ${id} returned duplicate player ${row.name}; review required`);
    players.set(key,row);
  }
  if(!players.size)throw Error(`WOM ${id} returned no participants`);
  return [...players.values()];
}

export async function recoverFullWomLeaderboard(env, archive) {
  const ids=getEventWomCompetitionIds(archive);
  if(!ids.length)throw Error('Archived event has no WOM competition IDs; cannot safely recover participants');
  if(ids.length>2)throw Error('More than two WOM components; manual review required');
  if(archive.type==='botw-elite' && ids.length!==2)throw Error('Elite BOTW requires both regular TOA and expert TOA competition IDs');
  const all=await Promise.all(ids.map(id=>fullStandings(env,id)));
  const combined=new Map();
  for(let i=0;i<all.length;i++)for(const row of all[i]){
    const key=normalize(row.name);
    const existing=combined.get(key);
    if(existing){existing.gained+=Number(row.gained);existing.components.push({competitionId:ids[i],gained:Number(row.gained)});}
    else combined.set(key,{name:row.name,gained:Number(row.gained),components:[{competitionId:ids[i],gained:Number(row.gained)}]});
  }
  const leaderboard=[...combined.values()].sort((a,b)=>b.gained-a.gained||a.name.localeCompare(b.name));
  if(!leaderboard.length)throw Error('WOM returned zero participants; no draft was changed');
  return {leaderboard,competitionIds:ids,componentCounts:all.map(rows=>rows.length)};
}
