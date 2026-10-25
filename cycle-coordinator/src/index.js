/** Dedicated single-writer WOM coordinator. Deploy separately as a Cloudflare Worker.
 * The Pages project connects using a service binding named CYCLE_COORDINATOR.
 * A durable "attempted" record prevents retries after an uncertain WOM response.
 */
export class CompetitionCoordinator {
  constructor(state, env) { this.state=state; this.env=env; }
  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/create")
      return Response.json({error:"Not found"},{status:404});
    const body=await request.json().catch(()=>null);
    if (!body || !/^(?:(sotw|botw):\d{4}-\d{2}-\d{2}(?::[01])?|live-test:\d{13})$/.test(String(body.id||"")))
      return Response.json({error:"Invalid cycle"},{status:400});
    const p=body.payload;
    if (!p || Number(p.groupId)!==12095 || !/^[a-z0-9_]+$/.test(String(p.metric||"")) ||
        typeof p.title!=="string" || p.title.length>160 || !p.title.startsWith("Ironkin ") ||
        !Number.isFinite(Date.parse(p.startsAt)) || !Number.isFinite(Date.parse(p.endsAt))) {
      return Response.json({error:"Invalid WOM request", reason:"invalid_payload", safeToRetry:true},{status:400});
    }
    if (!this.env.WOM_GROUP_VERIFICATION_CODE) {
      return Response.json({error:"Coordinator WOM verification secret not configured",reason:"missing_worker_secret",safeToRetry:true},{status:503});
    }
    if (String(p.groupVerificationCode)!==String(this.env.WOM_GROUP_VERIFICATION_CODE)) {
      return Response.json({error:"Coordinator WOM verification secret mismatch",reason:"worker_secret_mismatch",safeToRetry:true},{status:403});
    }
    const fingerprint=JSON.stringify({title:p.title,metric:p.metric,startsAt:p.startsAt,endsAt:p.endsAt,groupId:p.groupId});
    const id=this.env.CYCLES.idFromName(body.id);
    const stub=this.env.CYCLES.get(id);
    return stub.fetch("https://durable.internal/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fingerprint,payload:p})});
  }
}
export class CycleCreation {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
    const body=await request.json().catch(()=>null);
    if(!body?.fingerprint || !body?.payload)return Response.json({error:"Invalid request"},{status:400});
    return this.state.blockConcurrencyWhile(async () => {
    const existing=await this.state.storage.get("creation");
    if(existing){
      if(existing.fingerprint!==body.fingerprint)return Response.json({error:"Cycle payload changed after creation was attempted",status:"needs_review"},{status:409});
      return Response.json(existing);
    }
    const attempted={status:"attempted",fingerprint:body.fingerprint,attemptedAt:new Date().toISOString()};
    // Durable write completes before the external WOM POST; never automatically retry.
    await this.state.storage.put("creation",attempted);
    try {
      const headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"IronkinCycleCoordinator/1.0"};
      if(this.env.WOM_API_KEY)headers["x-api-key"]=this.env.WOM_API_KEY;
      const response=await fetch("https://api.wiseoldman.net/v2/competitions",{method:"POST",headers,body:JSON.stringify(body.payload)});
      const result=await response.json().catch(()=>({}));
      const competition=result.competition||result;
      if(!response.ok || !competition?.id){
        const failed={...attempted,status:"needs_review",error:String(result.message||result.error||`WOM HTTP ${response.status}`).slice(0,300)};
        await this.state.storage.put("creation",failed);return Response.json(failed,{status:409});
      }
      const created={...attempted,status:"created",competitionId:String(competition.id),createdAt:new Date().toISOString()};
      await this.state.storage.put("creation",created);return Response.json(created);
    }catch(error){
      const failed={...attempted,status:"needs_review",error:`WOM response uncertain: ${String(error.message||error).slice(0,200)}`};
      await this.state.storage.put("creation",failed);return Response.json(failed,{status:409});
    }
    });
  }
}
// Service bindings invoke the Worker's default fetch handler. Route only the
// internal creation endpoint; public GET requests remain inaccessible.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/create") {
      return Response.json({error:"Private service"}, {status:403});
    }
    // This endpoint is only intended for a Cloudflare service binding. The
    // coordinator validates the group verification code and cycle identity.
    return new CompetitionCoordinator(null, env).fetch(request);
  }
};
