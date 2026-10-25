import { hybridKv } from "../../_hybridKv.js";
import { womFetch } from "../../_wom.js";
const KEY="events:sotw-botw-live-test:v1";
const parse=(v,d)=>{try{return v?JSON.parse(v):d;}catch{return d;}};
const metricName=v=>({"The Nightmare":"nightmare","Phosani's Nightmare":"phosanis_nightmare"}[v]||String(v).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""));
export async function onRequest({request,env}){
 if(!env.CYCLE_AUTOMATION_SECRET||request.headers.get("Authorization")!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
 const kv=hybridKv(env,"drops");const test=parse(await kv.get(KEY),null);
 if(!test)return Response.json({task:null});
 const now=Date.now();
 if(request.method==="GET"){
  if(test.status==="polling"&&!test.messageId&&now<Date.parse(test.pollClosesAt))return Response.json({task:{action:"publish",id:test.id,type:"sotw",options:test.options,close:test.pollClosesAt,liveTest:true}});
  if(test.status==="polling"&&test.messageId&&now>=Date.parse(test.pollClosesAt))return Response.json({task:{action:"close",id:test.id,type:"sotw",options:test.options,messageId:test.messageId,channelId:test.channelId,liveTest:true}});
  if(test.status==="polling"&&!test.messageId&&now>=Date.parse(test.pollClosesAt)){const updated={...test,status:"failed",error:"Poll was not published before closing"};await kv.put(KEY,JSON.stringify(updated));return Response.json({task:null,test:updated});}
  if(test.status==="competition"&&now>=Date.parse(test.womEndsAt)){
   if(!test.womCompetitionId)return Response.json({task:null});
   try{const r=await womFetch(env,`/competitions/${test.womCompetitionId}`);if(!r.ok)throw Error(`WOM HTTP ${r.status}`);const data=await r.json();const competition=data.competition||data;
    // WOM can lag; never manufacture results.
    if(competition?.status!=="finished"&&competition?.status!=="completed")return Response.json({task:null,waitingForWom:true});
    const updated={...test,status:"completed",completedAt:new Date().toISOString(),womReportedStatus:competition.status};await kv.put(KEY,JSON.stringify(updated));return Response.json({task:null,testStatus:"completed",womUrl:test.womUrl});
   }catch(e){return Response.json({task:null,verificationError:String(e.message||e)});}
  }
  return Response.json({task:null,testStatus:test.status});
 }
 if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
 const body=await request.json().catch(()=>null);if(body?.id!==test.id)return Response.json({error:"Test ID mismatch"},{status:409});
 if(body.action==="published"){
  if(test.messageId)return Response.json({success:true});
  if(test.status!=="polling"||!/^\d{17,20}$/.test(String(body.messageId))||!/^\d{17,20}$/.test(String(body.channelId))||JSON.stringify(body.options)!==JSON.stringify(test.options))return Response.json({error:"Invalid publication receipt"},{status:409});
  const updated={...test,messageId:String(body.messageId),channelId:String(body.channelId)};await kv.put(KEY,JSON.stringify(updated));return Response.json({success:true});
 }
 if(body.action==="closed"){
  if(test.status!=="polling"||!test.messageId||String(body.messageId)!==test.messageId||now<Date.parse(test.pollClosesAt)||!Array.isArray(body.counts)||body.counts.length!==3||body.counts.some(n=>!Number.isInteger(n)||n<0))return Response.json({error:"Invalid closing receipt"},{status:409});
  const max=Math.max(...body.counts),indices=body.counts.map((n,i)=>n===max?i:-1).filter(i=>i>=0);
  const outcome=max===0?"no_votes":indices.length>1?"tie":"winner";
  let updated={...test,status:outcome==="winner"?"creating_wom":"needs_review",outcome,counts:body.counts,winningIndex:outcome==="winner"?indices[0]:null,closedAt:new Date().toISOString()};await kv.put(KEY,JSON.stringify(updated));
  if(outcome!=="winner")return Response.json({success:true,state:updated});
  const option=test.options[indices[0]];if(option.metrics.length!==1||!env.CYCLE_COORDINATOR||!env.WOM_GROUP_VERIFICATION_CODE){updated={...updated,status:"needs_review",error:"Missing WOM coordinator/credentials"};await kv.put(KEY,JSON.stringify(updated));return Response.json({success:true,state:updated});}
  const payload={title:`Ironkin SOTW LIVE TEST - ${option.label} - ${test.id}`,metric:metricName(option.metrics[0]),startsAt:test.womStartsAt,endsAt:test.womEndsAt,groupId:12095,groupVerificationCode:String(env.WOM_GROUP_VERIFICATION_CODE)};
  updated={...updated,womStatus:"attempted"};await kv.put(KEY,JSON.stringify(updated));
  try{const r=await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:test.id,payload})});const result=await r.json().catch(()=>({}));if(!r.ok||result.status!=="created"||!/^\d+$/.test(String(result.competitionId||"")))throw Error(String(result.error||result.status||`HTTP ${r.status}`));
   updated={...updated,status:"competition",womStatus:"created",womCompetitionId:String(result.competitionId),womUrl:`https://wiseoldman.net/competitions/${result.competitionId}`};await kv.put(KEY,JSON.stringify(updated));
  }catch(e){updated={...updated,status:"needs_review",womStatus:"needs_review",error:`WOM creation needs review: ${String(e.message||e)}`};await kv.put(KEY,JSON.stringify(updated));}
  return Response.json({success:true,state:updated});
 }
 return Response.json({error:"Unknown action"},{status:400});
}
