import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
const KEY="events:sotw-botw-discord-poll-test:v1";
const read=v=>{try{return v?JSON.parse(v):null}catch{return null}};
const json=(v,s=200)=>Response.json(v,{status:s,headers:{"Cache-Control":"no-store"}});
export async function onRequest({request,env}){
 if(!isStaffSession(await getSession(request,env)))return json({error:"Staff only"},403);
 const kv=hybridKv(env,"drops"),existing=read(await kv.get(KEY));
 if(request.method==="GET")return json({test:existing});
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const origin=request.headers.get("Origin");if(!origin||new URL(origin).origin!==new URL(request.url).origin)return json({error:"Invalid origin"},403);
 const body=await request.json().catch(()=>null);
 if(body?.action==="start"){
  if(existing&&!(["deleted","cancelled"].includes(existing.status)))return json({error:"Previous test must be deleted before starting another",test:existing},409);
  // TEST ONLY: generate options from the eligible pool. Never read or write
  // production drafts, nominations, reservation state, or rotation history.
  const pools=read(await kv.get("events:sotw-botw-pools:v1"))||{};
  const source=Array.isArray(pools["botw-standard"])?pools["botw-standard"]:[];
  const unique=[...new Map(source.filter(x=>typeof x==="string"&&x.trim()).map(x=>[x.trim().toLowerCase(),x.trim()])).values()];
  if(unique.length<3)return json({error:"At least three eligible BOTW options are required for a test."},409);
  const selected=[];
  for(let i=0;i<3;i++){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);selected.push(unique.splice(bytes[0]%unique.length,1)[0]);}
  const options=selected.map(value=>({label:value,metrics:[value]}));
  const state={id:`poll-test:${Date.now()}`,status:"pending",options,createdAt:new Date().toISOString(),testOnly:true};
  await kv.put(KEY,JSON.stringify(state));return json({test:state});
 }
 if(body?.action==="close"){
  if(!existing)return json({error:"No test exists"},404);
  if(existing.status==="closed")return json({test:existing});
  if(existing.status!=="published"||!existing.messageId)return json({error:"Only a published test poll can be closed",test:existing},409);
  const state={...existing,status:"close_requested",closeRequestedAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(state));return json({test:state});
 }
 if(body?.action==="delete"){
  if(!existing)return json({error:"No test exists"},404);
  if(existing.status==="deleted")return json({test:existing});
  if(existing.status==="pending"&&!existing.messageId){const state={...existing,status:"cancelled",cancelledAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(state));return json({test:state});}
  if(!existing.messageId)return json({error:"Publication status uncertain; cannot safely reset until reconciled",test:existing},409);
  const state={...existing,status:"delete_requested",deleteRequestedAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(state));return json({test:state});
 }
 return json({error:"Invalid action"},400);
}
