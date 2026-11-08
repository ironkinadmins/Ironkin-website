import { hybridKv } from "../../_hybridKv.js";
const KEY="events:sotw-botw-discord-poll-test:v1";
const read=v=>{try{return v?JSON.parse(v):null}catch{return null}};
const json=(v,s=200)=>Response.json(v,{status:s,headers:{"Cache-Control":"no-store"}});
export async function onRequest({request,env}){
 if(!env.CYCLE_AUTOMATION_SECRET||request.headers.get("Authorization")!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return json({error:"Unauthorized"},401);
 const kv=hybridKv(env,"drops"),state=read(await kv.get(KEY));
 if(request.method==="GET"){
  if(state?.status==="pending")return json({task:{action:"publish",id:state.id,type:"botw",options:state.options,testOnly:true}});
  if(state?.status==="delete_requested"&&state.messageId)return json({task:{action:"delete",id:state.id,messageId:state.messageId,channelId:state.channelId,testOnly:true}});
  return json({task:null,status:state?.status||"idle"});
 }
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const body=await request.json().catch(()=>null);
 if(!state||body?.id!==state.id)return json({error:"Test ID mismatch"},409);
 if(body.action==="published"){
  if(state.status!=="pending")return json({error:"Test not pending"},409);
  if(!/^\d{15,22}$/.test(String(body.messageId||""))||!/^\d{15,22}$/.test(String(body.channelId||"")))return json({error:"Invalid Discord identifiers"},400);
  const updated={...state,status:"published",messageId:String(body.messageId),channelId:String(body.channelId),publishedAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(updated));return json({test:updated});
 }
 if(body.action==="deleted"){
  if(state.status!=="delete_requested"||String(body.messageId)!==String(state.messageId))return json({error:"Deletion not requested or message mismatch"},409);
  const updated={...state,status:"deleted",deletedAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(updated));return json({test:updated});
 }
 return json({error:"Invalid action"},400);
}
