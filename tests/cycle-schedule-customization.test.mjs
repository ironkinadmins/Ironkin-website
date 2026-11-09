import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=(await fs.readFile(new URL('../functions/api/admin/events/cycle.js',import.meta.url),'utf8')).replace(/^import .*?;\s*$/gm,'');
let store=new Map();
globalThis.__cycleSchedule={hybridKv:()=>({get:async k=>store.get(k)||null,put:async(k,v)=>store.set(k,v)}),getSession:async()=>({}),isStaffSession:()=>true};
const {onRequest}=await import(`data:text/javascript;base64,${Buffer.from(`const {hybridKv,getSession,isStaffSession}=globalThis.__cycleSchedule;\n${source}`).toString('base64')}`);
const base={enabled:false,startDate:'2026-11-13',startTime:'15:00',firstEvent:'botw',durationDays:10,rotationDays:21};
async function post(body){const request=new Request('https://ironkinclan.com/api/admin/events/cycle',{method:'POST',headers:{Origin:'https://ironkinclan.com','Content-Type':'application/json'},body:JSON.stringify(body)});const response=await onRequest({request,env:{}});return {status:response.status,body:await response.json()};}
test('custom durations and intervals produce alternating competition previews',async()=>{store=new Map();const r=await post(base);assert.equal(r.status,200);assert.equal(r.body.preview[0].type,'botw');assert.equal(r.body.preview[1].type,'sotw');assert.equal(r.body.preview[1].startDate,'2026-12-04');assert.equal(r.body.preview[0].endDate,'2026-11-23');});
test('duration cannot exceed rotation',async()=>{store=new Map();assert.equal((await post({...base,durationDays:22})).status,400);});
test('rotation must use whole weeks',async()=>{store=new Map();assert.equal((await post({...base,rotationDays:10})).status,400);});
test('saving a schedule preserves existing active status',async()=>{store=new Map([['events:sotw-botw-cycle:v1',JSON.stringify({...base,enabled:true})]]);const r=await post(base);assert.equal(r.status,200);assert.equal(r.body.config.enabled,true);});
test('published upcoming poll prevents changing duration or interval',async()=>{store=new Map([['events:sotw-botw-cycle:v1',JSON.stringify(base)],['events:sotw-botw-automation:v1:botw:2026-11-13',JSON.stringify({messageId:'123'})]]);const r=await post({...base,durationDays:8});assert.equal(r.status,409);});
