import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const sourcePath = new URL('../functions/api/admin/events/cycle-recovery.js', import.meta.url);
const original = await fs.readFile(sourcePath, 'utf8');
const code = original.replace(/^import .*?;\n/gms, (line) => line.includes('from ') ? '' : line);
// Load the endpoint with deterministic in-memory adapters. No WOM writes or external calls.
let store, remote, linked, staff;
globalThis.__cycleTest = {
  hybridKv: () => ({get: async k => store.get(k) ?? null, put: async (k,v) => {store.set(k,v);}}),
  getSession: async () => ({}), isStaffSession: () => staff,
  womFetch: async (_env,path) => ({ok:true,json:async()=>remote[path.split('/').pop()]}),
  linkOrFlag: async (_kv,_event,state) => { linked++; return {...state,websiteStatus:'linked'}; }
};
const moduleText = `const {hybridKv,getSession,isStaffSession,womFetch,linkOrFlag}=globalThis.__cycleTest;\n${code}`;
const {onRequest} = await import(`data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`);
const prefix='events:sotw-botw-automation:v1:';
const id='botw-elite:2026-11-13';
function setup() {
  store=new Map();remote={};linked=0;staff=true;
  store.set('events:sotw-botw-cycle:v1',JSON.stringify({enabled:true,startDate:'2026-11-13',firstEvent:'botw',startTime:'15:00'}));
  store.set(prefix+id,JSON.stringify({outcome:'winner',closedAt:'2026-11-12T20:00:00Z',womStatus:'needs_review',womTitle:'Ironkin BOTW ELITE - Artio + Callisto - 2026-11-13',winningIndex:0,options:[{label:'Artio + Callisto',metrics:['Artio','Callisto']}]}));
  for (const [n,metric] of [['101','artio'],['202','callisto']]) remote[n]={id:Number(n),groupId:12095,metric,title:`Ironkin BOTW ELITE - Artio + Callisto - 2026-11-13 (${metric==='artio'?'Artio':'Callisto'})`};
}
async function attach(competitionId,metricIndex,origin='https://ironkinclan.com') {
  const request=new Request('https://ironkinclan.com/api/admin/events/cycle-recovery',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'attach_existing_wom',id,competitionId,metricIndex})});
  const response=await onRequest({request,env:{}});
  return {status:response.status,data:await response.json(),state:JSON.parse(store.get(prefix+id))};
}
test('paired-first reconciliation keeps slot 0 empty and does not link',async()=>{
  setup();const r=await attach('202',1);
  assert.equal(r.status,200);assert.equal(r.state.womStatus,'needs_review');assert.equal(linked,0);
  assert.equal(r.state.womCompetitions[0].metricIndex,1);assert.deepEqual(r.state.womCompetitionIds,[]);
});
test('second reconciliation completes both slots in correct order and links once',async()=>{
  setup();await attach('202',1);const r=await attach('101',0);
  assert.equal(r.status,200);assert.deepEqual(r.state.womCompetitionIds,['101','202']);assert.equal(r.state.womCompetitionId,'101');assert.equal(linked,1);
});
test('same competition cannot occupy both metrics',async()=>{
  setup();await attach('101',0);remote['101'].metric='callisto';remote['101'].title='Ironkin BOTW ELITE - Artio + Callisto - 2026-11-13 (Callisto)';
  const r=await attach('101',1);assert.equal(r.status,409);assert.equal(linked,0);
});
test('wrong origin is rejected',async()=>{setup();const r=await attach('101',0,'https://other.example');assert.equal(r.status,403);});
test('already linked event is protected',async()=>{setup();const state=JSON.parse(store.get(prefix+id));state.websiteStatus='linked';store.set(prefix+id,JSON.stringify(state));const r=await attach('101',0);assert.equal(r.status,409);});
test('nonstaff access is rejected',async()=>{setup();staff=false;const r=await attach('101',0);assert.equal(r.status,403);});
