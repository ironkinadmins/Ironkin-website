import { hybridKv } from "../../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../../_auth.js";

// Staff may suppress a pending/failed automatic announcement without deleting results.
export async function onRequestPost({request,env}) {
  if (!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  const {archiveId}=await request.json().catch(()=>({}));
  if(typeof archiveId!=="string" || !archiveId.trim())return Response.json({error:"Archive ID required."},{status:400});
  const kv=hybridKv(env,"drops");
  const raw=await kv.get("events:archive");
  let archive;try{archive=JSON.parse(raw||"[]");}catch{return Response.json({error:"Invalid archive."},{status:500});}
  if(!Array.isArray(archive))return Response.json({error:"Invalid archive."},{status:500});
  const index=archive.findIndex(entry=>String(entry?.id)===archiveId);
  if(index<0)return Response.json({error:"Archive entry not found."},{status:404});
  const current=archive[index].resultsAnnouncement||{};
  if(current.status==="posted")return Response.json({error:"Already posted to Discord; cannot ignore a published announcement."},{status:409});
  archive[index]={...archive[index],resultsAnnouncement:{...current,enabled:false,status:"skipped",skippedAt:new Date().toISOString(),skippedReason:"Staff will publish results manually",error:null}};
  await kv.put("events:archive",JSON.stringify(archive));
  return Response.json({success:true,status:"skipped"});
}
