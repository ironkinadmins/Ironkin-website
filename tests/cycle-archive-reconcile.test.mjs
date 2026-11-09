import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../functions/api/admin/events/cycle-recovery.js',import.meta.url),'utf8');
const code=source.replace(/^import .*?;\s*$/gm,'');
let store,staff;
globalThis.__archiveTest={
 hybridKv:()=>({get:async k=>store.get(k)??null,put:async(k,v)=>store.set(k,v)}),
 getSession:async()=>({}),isStaffSession:()=>staff,womFetch:async()=>({ok:false}),linkOrFlag:async()=>{throw Error('Must not link');}
};
const {onRequest}=await import(`data:text/javascript;base64,${Buffer.from('const {hybridKv,getSession,isStaffSession,womFetch,linkOrFlag}=globalThis.__archiveTest;\n'+code).toString('base64')}`);
const id='botw:2026-11-13',prefix='events:sotw-botw-automation:v1:';
const active=()=>({id:'botw-elite',type:'botw',womCompetitionId:'101',womCompetitionIds:['101','202'],active:true});
function setup({archive=true,activeId='101',staffAccess=true}={}){
 store=new Map();staff=staffAccess;
 store.set(prefix+id,JSON.stringify({closedAt:'2026-11-12T20:00:00Z',outcome:'winner',womStatus:'created',womCompetitionId:'101',websiteEventId:'botw-elite',websiteStatus:'linked',finalizationStatus:'needs_review'}));
 store.set('events:active',JSON.stringify([{...active(),womCompetitionId:activeId}]));
 store.set('events:archive',JSON.stringify(archive?[{id:'archive-101',archiveRequestId:`cycle-${id}-101`,eventId:'botw-elite',womCompetitionId:'101',resultsAnnouncement:{status:'posted'}}]:[]));
}
async function reconcile(origin='https://ironkinclan.com'){
 const response=await onRequest({request:new Request('https://ironkinclan.com/api/admin/events/cycle-recovery',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'reconcile_archive',id})}),env:{}});
 return {status:response.status,data:await response.json()};
}
test('matching archive closes only archived active event without recreating anything',async()=>{
 setup();const r=await reconcile();assert.equal(r.status,200);assert.equal(r.data.archiveId,'archive-101');
 assert.equal(JSON.parse(store.get('events:active'))[0].active,false);
 assert.equal(JSON.parse(store.get(prefix+id)).finalizationStatus,'completed');
 assert.equal(JSON.parse(store.get('events:archive')).length,1);
});
test('missing archive never silently retries or resets',async()=>{setup({archive:false});const r=await reconcile();assert.equal(r.status,409);assert.equal(JSON.parse(store.get('events:active'))[0].active,true);});
test('newer active event is protected',async()=>{setup({activeId:'999'});const r=await reconcile();assert.equal(r.status,409);assert.equal(JSON.parse(store.get('events:active'))[0].womCompetitionId,'999');});
test('unauthorized and cross-origin reconciliation rejected',async()=>{setup({staffAccess:false});assert.equal((await reconcile()).status,403);setup();assert.equal((await reconcile('https://attacker.example')).status,403);});
test('duplicate archives require manual review',async()=>{setup();const archive=JSON.parse(store.get('events:archive'));archive.push({...archive[0],id:'duplicate'});store.set('events:archive',JSON.stringify(archive));assert.equal((await reconcile()).status,409);});
test('reconciliation is idempotent',async()=>{setup();assert.equal((await reconcile()).status,200);const r=await reconcile();assert.equal(r.status,200);assert.equal(r.data.status,'completed');});
