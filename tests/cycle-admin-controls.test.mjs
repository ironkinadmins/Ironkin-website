import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=(await fs.readFile(new URL('../functions/api/admin/events/cycle.js',import.meta.url),'utf8')).replace(/^import .*?;\s*$/gm,'');
let store=new Map(),staff=true;
globalThis.__adminControls={hybridKv:()=>({get:async k=>store.get(k)||null,put:async(k,v)=>store.set(k,v)}),getSession:async()=>({}),isStaffSession:()=>staff};
const {onRequest}=await import(`data:text/javascript;base64,${Buffer.from(`const {hybridKv,getSession,isStaffSession}=globalThis.__adminControls;\n${source}`).toString('base64')}`);
const controls={polling:false,womCreation:false,finalization:false,nominationReminders:true};
async function request(body,origin='https://ironkinclan.com',env={}){
 const req=new Request('https://ironkinclan.com/api/admin/events/cycle',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const r=await onRequest({request:req,env});return {status:r.status,data:await r.json()};
}
test('staff controls persist with safe values',async()=>{store=new Map();staff=true;const r=await request({action:'save-controls',controls});assert.equal(r.status,200);assert.equal(JSON.parse(store.get('events:sotw-botw-controls:v1')).polling,false);});
test('unknown control is rejected',async()=>{store=new Map();staff=true;const r=await request({action:'save-controls',controls:{...controls,skipVerification:true}});assert.equal(r.status,400);});
test('non-boolean controls are rejected',async()=>{store=new Map();staff=true;const r=await request({action:'save-controls',controls:{...controls,polling:'false'}});assert.equal(r.status,400);});
test('cross-origin updates are rejected',async()=>{store=new Map();staff=true;const r=await request({action:'save-controls',controls},'https://evil.example');assert.equal(r.status,403);});
test('Cloudflare gate blocks WOM activation',async()=>{store=new Map();staff=true;const r=await request({action:'save-controls',controls:{...controls,womCreation:true}});assert.equal(r.status,400);});
test('nonstaff controls cannot be changed',async()=>{store=new Map();staff=false;const r=await request({action:'save-controls',controls});assert.equal(r.status,403);staff=true;});
