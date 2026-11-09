import { getSession, isStaffSession } from "../../_auth.js";
import { nominationNoticeStatus, sendNominationDm } from "../../../_winnerNominationNotifications.js";
export async function onRequest({request,env}){
 if(!isStaffSession(await getSession(request,env)))return Response.json({error:"Staff only"},{status:403});
 if(!["GET","POST"].includes(request.method))return Response.json({error:"Method not allowed"},{status:405});
 if(request.method==="GET"){
   const statuses=await Promise.all(["botw","sotw"].map(async type=>{const x=await nominationNoticeStatus(env,type);return {type,winner:x.status||null,window:x.window||null,notice:x.notice||null,nominationsComplete:x.complete};}));
   return Response.json({statuses},{headers:{"Cache-Control":"no-store"}});
 }
 const origin=request.headers.get("Origin");if(!origin||new URL(origin).origin!==new URL(request.url).origin)return Response.json({error:"Invalid origin"},{status:403});
 const body=await request.json().catch(()=>null);if(body?.action!=="retry_failed_invitation"||!["botw","sotw"].includes(body?.type))return Response.json({error:"Invalid action"},{status:400});
 const x=await nominationNoticeStatus(env,body.type);
 if(x.status?.state!=="resolved"||!x.status.discordId||!x.noticeKey||!x.window?.open||x.complete)return Response.json({error:"No eligible pending winner invitation"},{status:409});
 if(x.notice?.state!=="failed")return Response.json({error:"Only confirmed failed invitations can be retried. Unknown delivery outcomes require manual review."},{status:409});
 const claimed={...x.notice,state:"sending",retryAt:new Date().toISOString()};await x.kv.put(x.noticeKey,JSON.stringify(claimed));
 try {const receipt=await sendNominationDm(env,x.status.discordId,body.type,x.window.deadline,"invitation");const done={...claimed,state:"sent",sentAt:new Date().toISOString(),discordId:x.status.discordId,deadline:x.window.deadline,...receipt};await x.kv.put(x.noticeKey,JSON.stringify(done));return Response.json({success:true,notice:done});}
 catch(error){const failed={...claimed,state:"needs_review",error:String(error.message||error).slice(0,200),failedAt:new Date().toISOString()};await x.kv.put(x.noticeKey,JSON.stringify(failed));return Response.json({error:"Delivery outcome requires review; no automatic retry will be attempted.",notice:failed},{status:502});}
}
