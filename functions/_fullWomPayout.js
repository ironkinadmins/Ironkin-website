import { womFetch } from './_wom.js';
import { getEventWomCompetitionIds, normalizeWomStandingsRows } from './_womCompetition.js';

const normalize = value => String(value || '').trim().toLowerCase().replace(/[ _-]+/g, ' ');

// Read all pages directly from WOM; never accept a truncated archive or cached top-five.
async function fullStandings(env, id) {
  const pageSize = 50;
  const players = new Map();
  let expected = null;
  for (let offset=0; offset<5000; offset+=pageSize) {
    const url=`https://api.wiseoldman.net/v2/competitions/${encodeURIComponent(id)}/standings?limit=${pageSize}&offset=${offset}`;
    const response=await womFetch(env,url,{},'Ironkin-Payout-Recovery');
    if(!response.ok)throw Error(`WOM ${id} standings request failed (${response.status})`);
    const body=await response.json();
    const raw=Array.isArray(body)?body:(body?.standings||body?.results||body?.participations);
    if(!Array.isArray(raw))throw Error(`WOM ${id} returned an unrecognized standings format`);
    const count=Number(body?.pagination?.total ?? body?.total ?? body?.participantCount);
    if(Number.isInteger(count)&&count>=0)expected=count;
    for(const row of normalizeWomStandingsRows(raw)){
      const key=normalize(row.name);
      if(!key)continue;
      if(players.has(key))throw Error(`WOM ${id} returned duplicate player ${row.name}; review required`);
      players.set(key,row);
    }
    if(raw.length<pageSize){
      if(expected!==null&&players.size<expected)throw Error(`WOM ${id} incomplete: ${players.size}/${expected} participants`);
      return [...players.values()];
    }
  }
  throw Error(`WOM ${id} standings exceeded 5000 rows; refusing partial results`);
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
