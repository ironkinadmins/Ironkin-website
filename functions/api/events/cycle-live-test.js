import { hybridKv } from "../../_hybridKv.js";

// Bot-only endpoint. The staff-facing endpoint is /api/admin/events/cycle-live-test.
const KEY = "events:sotw-botw-live-test:v1";
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
const json = (body, status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const iso = (s) => Number.isFinite(Date.parse(s)) ? Date.parse(s) : NaN;
const metric = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");

export async function onRequest({request,env}) {
  if (!env.CYCLE_AUTOMATION_SECRET || request.headers.get("Authorization") !== `Bearer ${env.CYCLE_AUTOMATION_SECRET}`)
    return json({error:"Unauthorized"},401);
  if (request.method !== "GET" && request.method !== "POST") return json({error:"Method not allowed"},405);
  const kv = hybridKv(env,"drops");
  const state = parse(await kv.get(KEY));
  if (!state || state.status === "cancelled") return json({task:null,testStatus:state?.status||"idle"});
  const now = Date.now();
  if (request.method === "GET") {
    if (state.status === "polling") {
      if (!state.messageId) {
        // Start the accelerated countdown on Discord publication, not test creation.
        // A generous acknowledgement timeout avoids declaring a healthy bot poll expired.
        if (now >= iso(state.createdAt) + 15 * 60000) {
          const failed={...state,status:"failed",error:"Discord did not acknowledge the poll within 15 minutes",failedAt:new Date().toISOString()};
          await kv.put(KEY,JSON.stringify(failed));
          return json({task:null,testStatus:"failed"});
        }
        return json({testStatus:"polling",task:{action:"publish",liveTest:true,id:state.id,type:"sotw",options:state.options,close:null}});
      }
      if (now >= iso(state.pollClosesAt)) return json({testStatus:"polling",task:{action:"close",liveTest:true,id:state.id,type:"sotw",messageId:state.messageId,options:state.options}});
    }
    return json({task:null,testStatus:state.status});
  }
  const body=await request.json().catch(()=>null);
  if (!body || body.id!==state.id) return json({error:"Test ID mismatch"},409);
  if (body.action === "published") {
    if (state.status!=="polling") return json({error:"Poll no longer active"},409);
    if (!/^\d{15,22}$/.test(String(body.messageId||"")) || !/^\d{15,22}$/.test(String(body.channelId||""))) return json({error:"Invalid Discord identifiers"},400);
    if (state.messageId && String(state.messageId)!==String(body.messageId)) return json({error:"Poll already acknowledged with another message"},409);
    const publishedAt=state.publishedAt||new Date().toISOString();
    const pollClosesAt=state.messageId ? state.pollClosesAt : new Date(Date.parse(publishedAt)+3*60000).toISOString();
    const womStartsAt=state.messageId ? state.womStartsAt : new Date(Date.parse(publishedAt)+5*60000).toISOString();
    const womEndsAt=state.messageId ? state.womEndsAt : new Date(Date.parse(publishedAt)+20*60000).toISOString();
    const updated={...state,messageId:String(body.messageId),channelId:String(body.channelId),publishedAt,pollClosesAt,womStartsAt,womEndsAt};
    await kv.put(KEY,JSON.stringify(updated));return json({testStatus:updated.status,test:updated});
  }
  if (body.action === "closed") {
    if (state.status!=="polling" || !state.messageId || String(body.messageId)!==String(state.messageId)) return json({error:"Poll not ready to close"},409);
    if (now < iso(state.pollClosesAt)) return json({error:"Voting is still open"},409);
    if (!Array.isArray(body.counts) || body.counts.length!==3 || !body.counts.every(n=>Number.isSafeInteger(n)&&n>=0)) return json({error:"Invalid vote counts"},400);
    const counts=body.counts;const top=Math.max(...counts);const winners=counts.map((n,i)=>n===top?i:-1).filter(i=>i>=0);
    const outcome=top===0?"no_votes":winners.length!==1?"tie":"winner";
    const updated={...state,status:outcome==="winner"?"awaiting_wom":"needs_review",outcome,winningIndex:outcome==="winner"?winners[0]:null,counts,closedAt:new Date().toISOString()};
    await kv.put(KEY,JSON.stringify(updated));
    return json({testStatus:updated.status,state:updated});
  }
  return json({error:"Unknown bot action"},400);
}
