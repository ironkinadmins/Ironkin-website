import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../functions/api/events/cycle-automation.js',import.meta.url),'utf8');
const stripped=source.replace(/^import .*?;\s*$/gm,'');
let store, clock, coordinatorCalls, archiveCalls, snapshotFails, archiveFails, archivedPartial;
const RealDate=globalThis.Date;
class FakeDate extends RealDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;} }
globalThis.Date=FakeDate;
globalThis.__lifecycle={
 processNominationReminder:async()=>{},
 hybridKv:()=>({get:async k=>store.get(k)??null,put:async(k,v)=>store.set(k,v)}),
 buildEventResultsSnapshot:async(_env,record)=>{if(snapshotFails)throw Error('WOM not ready');return {leaderboard:[{username:'winner',gained:123}],endDate:record.endDate};},
 buildEventResultsContent:()=> 'results',getResultsChannelId:()=>null,
 archiveEventInternal:async({body})=>{archiveCalls++;if(archiveFails)throw Error('Archive failed');
  const item={id:'archive-1',archiveRequestId:body.archiveRequestId,womCompetitionId:body.event.womCompetitionId,eventId:body.event.id};
  store.set('events:archive',JSON.stringify([item]));
  if(!archivedPartial){const active=JSON.parse(store.get('events:active'));store.set('events:active',JSON.stringify(active.map(x=>x.id===body.event.id?{...x,active:false}:x)));}
  return Response.json({success:true,archiveEntry:item});},
 womFetch:async()=>({ok:true,json:async()=>({})})
};
const injected=`const {processNominationReminder,hybridKv,buildEventResultsSnapshot,buildEventResultsContent,getResultsChannelId,archiveEventInternal,womFetch}=globalThis.__lifecycle;\n${stripped}`;
const {onRequest}=await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
const prefix='events:sotw-botw-automation:v1:';
const id='botw:2026-11-13';
const env=()=>({CYCLE_AUTOMATION_SECRET:'secret',CYCLE_AUTO_WOM_CREATE_ENABLED:'true',CYCLE_AUTO_FINALIZE_ENABLED:'true',WOM_GROUP_VERIFICATION_CODE:'verified',CYCLE_COORDINATOR:{fetch:async(_url,opts)=>{coordinatorCalls++;const {id:requestId}=JSON.parse(opts.body);return Response.json({status:'created',competitionId:requestId.endsWith(':1')?'202':'101'});}}});
function reset(time='2026-11-12T21:00:00Z'){
 clock=RealDate.parse(time);store=new Map();coordinatorCalls=0;archiveCalls=0;snapshotFails=false;archiveFails=false;archivedPartial=false;
 store.set('events:sotw-botw-cycle:v1',JSON.stringify({enabled:true,startDate:'2026-11-13',firstEvent:'botw',startTime:'15:00'}));
 store.set(prefix+id,JSON.stringify({messageId:'123456789012345678',channelId:'123456789012345679',options:[{label:'Artio + Callisto',metrics:['Artio','Callisto']},{label:'Zulrah',metrics:['Zulrah']},{label:'Vorkath',metrics:['Vorkath']}]}));
}
async function call(method='GET',body=null,settings=env()){
 const response=await onRequest({request:new Request('https://ironkinclan.com/api/events/cycle-automation',{method,headers:{Authorization:'Bearer secret'},...(body?{body:JSON.stringify(body)}:{})}),env:settings});return {status:response.status,data:await response.json()};
}
const state=()=>JSON.parse(store.get(prefix+id));
async function close(){return call('POST',{action:'closed',id,messageId:'123456789012345678',counts:[12,4,1]});}
async function finish(){await close();clock=RealDate.parse('2026-11-20T21:30:00Z');return call();}

test('closed poll creates both WOM metrics, links correct ordered IDs and does not duplicate on repeat',async()=>{
 reset();const r=await close();assert.equal(r.status,200);assert.equal(state().womStatus,'created');assert.deepEqual(state().womCompetitionIds,['101','202']);
 const active=JSON.parse(store.get('events:active'));assert.deepEqual(active[0].womCompetitionIds,['101','202']);assert.equal(coordinatorCalls,2);
 await close();assert.equal(coordinatorCalls,2);
});
test('disabled WOM creation records activation hold and does not call coordinator',async()=>{
 reset();const settings={...env(),CYCLE_AUTO_WOM_CREATE_ENABLED:'false'};await call('POST',{action:'closed',id,messageId:'123456789012345678',counts:[12,4,1]},settings);
 assert.equal(state().womStatus,'awaiting_activation');assert.equal(coordinatorCalls,0);
});
test('late activation after start is blocked without creating WOM competitions',async()=>{
 reset();await call('POST',{action:'closed',id,messageId:'123456789012345678',counts:[12,4,1]},{...env(),CYCLE_AUTO_WOM_CREATE_ENABLED:'false'});
 clock=RealDate.parse('2026-11-14T21:00:00Z');await call();assert.equal(state().womStatus,'needs_review');assert.equal(coordinatorCalls,0);
});
test('finalization archives exactly once after standings are available',async()=>{
 reset();await finish();assert.equal(archiveCalls,1);assert.equal(state().finalizationStatus,'completed');await call();assert.equal(archiveCalls,1);
});
test('unavailable WOM standings leaves cycle pending and retries later',async()=>{
 reset();await close();clock=RealDate.parse('2026-11-20T21:30:00Z');snapshotFails=true;await call();assert.equal(state().finalizationStatus,'pending');assert.equal(archiveCalls,0);
 snapshotFails=false;await call();assert.equal(state().finalizationStatus,'completed');assert.equal(archiveCalls,1);
});
test('uncertain archive failure enters manual review without blind retry',async()=>{
 reset();await close();clock=RealDate.parse('2026-11-20T21:30:00Z');archiveFails=true;await call();assert.equal(state().finalizationStatus,'needs_review');assert.equal(archiveCalls,1);
 archiveFails=false;await call();assert.equal(archiveCalls,1);
});
test('archive already exists with active matching event is flagged for review',async()=>{
 reset();await close();clock=RealDate.parse('2026-11-20T21:30:00Z');const current=state();store.set('events:archive',JSON.stringify([{id:'a1',archiveRequestId:`cycle-${id}-${current.womCompetitionId}`,womCompetitionId:current.womCompetitionId,eventId:current.websiteEventId}]));
 await call();assert.equal(state().finalizationStatus,'needs_review');assert.equal(archiveCalls,0);
});
test('archive already exists with inactive event marks completed without repost',async()=>{
 reset();await close();clock=RealDate.parse('2026-11-20T21:30:00Z');const current=state();store.set('events:archive',JSON.stringify([{id:'a1',archiveRequestId:`cycle-${id}-${current.womCompetitionId}`,womCompetitionId:current.womCompetitionId,eventId:current.websiteEventId}]));
 store.set('events:active',JSON.stringify(JSON.parse(store.get('events:active')).map(x=>({...x,active:false}))));
 await call();assert.equal(state().finalizationStatus,'completed');assert.equal(archiveCalls,0);
});

test('staff pause of WOM creation holds competition even with Cloudflare flag enabled',async()=>{
 reset();store.set('events:sotw-botw-controls:v1',JSON.stringify({polling:true,womCreation:false,finalization:true,nominationReminders:true}));
 await close();assert.equal(state().womStatus,'awaiting_activation');assert.equal(coordinatorCalls,0);
});
test('re-enabling WOM creation resumes the held competition before its start',async()=>{
 reset();store.set('events:sotw-botw-controls:v1',JSON.stringify({polling:true,womCreation:false,finalization:true,nominationReminders:true}));
 await close();store.set('events:sotw-botw-controls:v1',JSON.stringify({polling:true,womCreation:true,finalization:true,nominationReminders:true}));
 await call();assert.equal(state().womStatus,'created');assert.equal(coordinatorCalls,2);
});
test('finalization pause retains results without archiving and resumes once enabled',async()=>{
 reset();await close();clock=RealDate.parse('2026-11-20T21:30:00Z');
 store.set('events:sotw-botw-controls:v1',JSON.stringify({polling:true,womCreation:true,finalization:false,nominationReminders:true}));
 await call();assert.equal(archiveCalls,0);
 store.set('events:sotw-botw-controls:v1',JSON.stringify({polling:true,womCreation:true,finalization:true,nominationReminders:true}));
 await call();assert.equal(archiveCalls,1);
});
test('polling pause does not strand an already published poll',async()=>{
 reset();store.set('events:sotw-botw-controls:v1',JSON.stringify({polling:false,womCreation:true,finalization:true,nominationReminders:true}));
 const r=await call();assert.equal(r.data.task?.action,'close');
});
