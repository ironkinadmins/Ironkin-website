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
  const drafts=read(await kv.get("events:sotw-botw-poll-drafts:v1"))||{};
  const draft=drafts.botw;
  if(draft?.cycleId!=="botw:2026-11-13"||!Array.isArray(draft.options)||draft.options.length!==3||new Set(draft.options.map(x=>x.label)).size!==3)return json({error:"Prepare three distinct November 13 BOTW options on Settings first"},409);
  const state={id:`poll-test:${Date.now()}`,status:"pending",options:draft.options,createdAt:new Date().toISOString(),cycleId:"botw:2026-11-13"};
  await kv.put(KEY,JSON.stringify(state));return json({test:state});
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
