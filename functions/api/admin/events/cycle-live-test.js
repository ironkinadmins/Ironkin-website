import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
const KEY = "events:sotw-botw-live-test:v1";
const parse = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
export async function onRequest({request,env}) {
  if (!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only"},{status:403});
  const kv=hybridKv(env,"drops");
  if(request.method==="GET")return Response.json({test:parse(await kv.get(KEY),null)},{headers:{"Cache-Control":"no-store"}});
  if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  const origin=request.headers.get("Origin");
  if(!origin || new URL(origin).origin!==new URL(request.url).origin)return Response.json({error:"Invalid origin"},{status:403});
  const body=await request.json().catch(()=>null);
  if(body?.action!=="start" && body?.action!=="cancel")return Response.json({error:"Invalid action"},{status:400});
  const existing=parse(await kv.get(KEY),null);
  if(body.action==="cancel") {
    if(existing?.status==="polling" && !existing.messageId){const cancelled={...existing,status:"cancelled",cancelledAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(cancelled));return Response.json({test:cancelled});}
    return Response.json({error:"Cannot cancel a posted poll or WOM competition. Review manually."},{status:409});
  }
  if(existing && !["cancelled","completed","failed","needs_review"].includes(existing.status))return Response.json({error:"A live test is already running",test:existing},{status:409});
  if(existing?.womStatus==="attempted" || existing?.womStatus==="needs_review")return Response.json({error:"Reconcile the previous WOM creation before starting another test."},{status:409});
  if(!env.CYCLE_COORDINATOR || !env.WOM_GROUP_VERIFICATION_CODE || !env.CYCLE_AUTOMATION_SECRET)return Response.json({error:"Missing production coordinator or WOM/cycle credentials"},{status:503});
  const pools=parse(await kv.get("events:sotw-botw-pools:v1"),{});
  const skills=[...new Set((pools.sotw||[]).filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim()))];
  if(skills.length<3)return Response.json({error:"Save at least three eligible SOTW skills first"},{status:400});
  const choices=[];const remaining=[...skills];while(choices.length<3){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);choices.push(remaining.splice(bytes[0]%remaining.length,1)[0]);}
  const now=Date.now();const id=`live-test:${now}`;
  const test={id,status:"polling",type:"sotw",options:choices.map(label=>({label,metrics:[label]})),createdAt:new Date(now).toISOString(),pollClosesAt:new Date(now+3*60000).toISOString(),womStartsAt:new Date(now+5*60000).toISOString(),womEndsAt:new Date(now+20*60000).toISOString(),mode:"isolated-production-integrations",notice:"Public Discord and WOM; no active website event, Embers, nominations or archives modified"};
  await kv.put(KEY,JSON.stringify(test));return Response.json({test});
}
