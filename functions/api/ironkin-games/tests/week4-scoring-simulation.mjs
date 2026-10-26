import assert from 'node:assert/strict';
import {TERRITORIES} from '../functions/api/ironkin-games/_conquestConfig.js';
import {stateFor,summaries,derivedTaskBonuses} from '../functions/api/ironkin-games/_conquestEngine.js';
const games={teams:Array.from({length:4},(_,i)=>({id:`team${i}`,name:`Team ${i}`,captainDiscordId:`${i}-0`,members:Array.from({length:7},(_,j)=>({discordId:`${i}-${j+1}`}))}))};
const s={teams:{},published:false};
for(const team of games.teams){const t=stateFor(s,team.id);t.unlocked.push('asgarnia');const r=TERRITORIES.find(x=>x.id==='asgarnia');for(const objective of r.tasks.slice(0,7))t.approved[objective.id]=true;}
let scores=summaries(s,games).scores;assert.equal(Object.keys(scores).length,4);
for(const team of games.teams){const t=stateFor(s,team.id);const r=TERRITORIES.find(x=>x.id==='asgarnia');const expected=r.tasks.slice(0,7).reduce((n,x)=>n+x.points,0);assert.equal(scores[team.id].basePoints,expected);assert.equal(scores[team.id].captured.includes('asgarnia'),expected>=r.captureThreshold);}
const t=stateFor(s,'team0');t.scouted.push('asgarnia');t.approved['asgarnia-secret']=true;assert.equal(summaries(s,games).scores.team0.secretBonus,20);
for(let i=0;i<8;i++)t.participants[`asgarnia-${i+1}`]=[`${0}-${i}`];for(let i=0;i<8;i++)t.approved[`asgarnia-${i+1}`]=true;
assert.equal(summaries(s,games).scores.team0.participationBonus,25);
delete t.approved['asgarnia-8'];assert.equal(summaries(s,games).scores.team0.participationBonus,0);
t.declared.push({power:'asgarnia',taskId:'asgarnia-14',status:'completed'});t.approved['asgarnia-14']=true;assert.equal(derivedTaskBonuses(t),75);delete t.approved['asgarnia-14'];assert.equal(derivedTaskBonuses(t),0);
t.approved['asgarnia-14']=true;t.metrics['morytania-14']=1;t.approved['morytania-14']=true;for(let i=1;i<4;i++){const x=stateFor(s,`team${i}`);x.approved['morytania-14']=true;x.metrics['morytania-14']=i+1;}
s.published=true;const result=summaries(s,games);assert.deepEqual(result.rankings['morytania-14'].map(x=>x.bonus),[100,70,40,20]);
console.log('PASS: four teams, base/capture, Scout, participation reversal, task power reversal, published competitive placement.');
