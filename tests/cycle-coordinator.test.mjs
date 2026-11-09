import test from 'node:test';
import assert from 'node:assert/strict';
import {CompetitionCoordinator,CycleCreation} from '../cycle-coordinator/src/index.js';
const payload={title:'Ironkin BOTW - Artio - 2026-11-13',metric:'artio',startsAt:'2026-11-13T20:00:00Z',endsAt:'2026-11-20T20:00:00Z',groupId:12095,groupVerificationCode:'verify'};
let memory,posts,mode,originalFetch;
const env=()=>({WOM_API_KEY:'api',WOM_GROUP_VERIFICATION_CODE:'verify',CYCLES:{idFromName:x=>x,get:()=>({fetch:async(_url,opts)=>object.fetch(new Request('https://durable.internal/create',opts))})}});
let object;
function setup(which='ok'){
 mode=which;posts=0;memory=new Map();
 object=new CycleCreation({storage:{get:async k=>memory.get(k),put:async(k,v)=>memory.set(k,v)},blockConcurrencyWhile:async fn=>fn()},env());
 originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  if(String(url).endsWith('/competitions') && opts?.method==='POST'){
   posts++;
   if(mode==='uncertain')throw Error('connection reset');
   if(mode==='429')return new Response(JSON.stringify({error:'rate limited'}),{status:429,headers:{'Retry-After':'60'}});
   return Response.json({id:101});
  }
  return Response.json({id:101,groupId:12095,metric:'artio',title:payload.title});
 };
}
async function create(p=payload){return new CompetitionCoordinator(null,env()).fetch(new Request('https://internal/create',{method:'POST',body:JSON.stringify({id:'botw:2026-11-13',payload:p})}));}
test('confirmed WOM create is idempotent through Durable Object',async()=>{setup();try{const a=await create();const b=await create();assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(posts,1);assert.equal((await b.json()).competitionId,'101');}finally{globalThis.fetch=originalFetch;}});
test('uncertain WOM outcome never causes a second POST',async()=>{setup('uncertain');try{assert.equal((await create()).status,409);await create();assert.equal(posts,1);assert.equal(memory.get('creation').status,'needs_review');}finally{globalThis.fetch=originalFetch;}});
test('rate limit remains review-only, not an automatic retry',async()=>{setup('429');try{assert.equal((await create()).status,409);await create();assert.equal(posts,1);assert.ok(memory.get('creation').retryAfterSeconds>=30);}finally{globalThis.fetch=originalFetch;}});
test('changed payload cannot reuse an attempted competition ID',async()=>{setup();try{await create();const result=await create({...payload,title:'Ironkin BOTW - Changed'});assert.equal(result.status,409);assert.equal(posts,1);}finally{globalThis.fetch=originalFetch;}});
