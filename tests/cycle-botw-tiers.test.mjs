import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=(await fs.readFile(new URL('../functions/api/events/cycle-automation.js',import.meta.url),'utf8')).replace(/^import .*?;\s*$/gm,'');
const kv=new Map();
const OriginalDate=globalThis.Date;
let clock=OriginalDate.parse('2026-11-11T21:00:00Z');
class ClockDate extends OriginalDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
globalThis.Date=ClockDate;
globalThis.__dual={hybridKv:()=>({get:async k=>kv.get(k)??null,put:async(k,v)=>kv.set(k,v)}),processNominationReminder:async()=>{},archiveEventInternal:async()=>Response.json({success:true}),buildEventResultsSnapshot:async()=>({}),buildEventResultsContent:()=>'',getResultsChannelId:()=>null,womFetch:async()=>({ok:false})};
const injected=`const {hybridKv,processNominationReminder,archiveEventInternal,buildEventResultsSnapshot,buildEventResultsContent,getResultsChannelId,womFetch}=globalThis.__dual;\n${source}`;
const {onRequest}=await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
const env={CYCLE_AUTOMATION_SECRET:'secret',CYCLE_AUTO_WOM_CREATE_ENABLED:'false'};
const prefix='events:sotw-botw-automation:v1:';
const base='2026-11-13';
function setup(){kv.clear();clock=OriginalDate.parse('2026-11-11T21:00:00Z');kv.set('events:sotw-botw-cycle:v1',JSON.stringify({enabled:true,startDate:base,firstEvent:'botw',startTime:'15:00',durationDays:7,rotationDays:14}));kv.set('events:sotw-botw-pools:v1',JSON.stringify({'botw-standard':['Giant Mole','Barrows','Sarachnis'],'botw-elite':['Zulrah','Vorkath','Nex'],sotw:['Mining','Fishing','Woodcutting']}));kv.set('events:sotw-botw-nomination-winners:v1',JSON.stringify({'botw-standard':'111','botw-elite':'222'}));kv.set('events:sotw-botw-nominations:v1',JSON.stringify({'botw-standard':{discordId:'111',options:['Giant Mole','Barrows']},'botw-elite':{discordId:'222',options:['Zulrah','Vorkath']}}));}
async function request(method='GET',body){const response=await onRequest({request:new Request('https://ironkinclan.com/api/events/cycle-automation',{method,headers:{Authorization:'Bearer secret'},...(body?{body:JSON.stringify(body)}:{})}),env});return {status:response.status,data:await response.json()};}
test('standard and elite publish separate polls and retain their own winners and boss pools',async()=>{
 setup();let r=await request();assert.equal(r.data.task.id,`botw-standard:${base}`);assert.deepEqual(r.data.task.options.slice(0,2).map(x=>x.label),['Giant Mole','Barrows']);
 const first=r.data.task;const msg='123456789012345678';r=await request('POST',{action:'published',id:first.id,messageId:msg,channelId:'123456789012345679',options:first.options});assert.equal(r.status,200);
 r=await request();assert.equal(r.data.task.id,`botw-elite:${base}`);assert.deepEqual(r.data.task.options.slice(0,2).map(x=>x.label),['Zulrah','Vorkath']);
 const second=r.data.task;r=await request('POST',{action:'published',id:second.id,messageId:'123456789012345680',channelId:'123456789012345679',options:second.options});assert.equal(r.status,200);
 assert.equal((await request()).data.task,null);
 clock=OriginalDate.parse('2026-11-12T21:01:00Z');r=await request();assert.equal(r.data.task.id,first.id);assert.equal(r.data.task.action,'close');
 r=await request('POST',{action:'closed',id:first.id,messageId:msg,counts:[5,2,1]});assert.equal(r.status,200);
 r=await request();assert.equal(r.data.task.id,second.id);assert.equal(r.data.task.action,'close');
 r=await request('POST',{action:'closed',id:second.id,messageId:'123456789012345680',counts:[1,5,2]});assert.equal(r.status,200);
 assert.equal(JSON.parse(kv.get(prefix+first.id)).womStatus,'awaiting_activation');
 assert.equal(JSON.parse(kv.get(prefix+second.id)).womStatus,'awaiting_activation');
 assert.equal(kv.has(prefix+`botw:${base}`),false);
});
test('unconfigured elite pool cannot fall back to standard or legacy botw pool',async()=>{
 setup();kv.set('events:sotw-botw-pools:v1',JSON.stringify({'botw-standard':['A','B','C'],botw:['X','Y','Z']}));
 let r=await request();assert.equal(r.data.task.type,'botw-standard');
 await request('POST',{action:'published',id:r.data.task.id,messageId:'123456789012345678',channelId:'123456789012345679',options:r.data.task.options});
 r=await request();assert.equal(r.data.task,null);assert.match(r.data.error,/three distinct/i);
});
