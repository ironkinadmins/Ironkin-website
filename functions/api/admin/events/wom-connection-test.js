import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

// One-shot, staff-only WOM integration test. The fixed coordinator ID ensures
// repeated requests cannot create multiple WOM competitions.
const KEY = "events:wom-connection-test:2026-10-25:v1";
const ID = "live-test:1792915200000";
const TITLE = "Ironkin AUTOMATION TEST - DELETE AFTER";
const json = (data, status = 200) => Response.json(data, {status, headers:{"Cache-Control":"no-store"}});
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

export async function onRequest({request, env}) {
  if (!isStaffSession(await getSession(request, env))) return json({error:"Staff only"}, 403);
  if (request.method !== "GET" && request.method !== "POST") return json({error:"Method not allowed"}, 405);
  const kv = hybridKv(env, "drops");
  const existing = parse(await kv.get(KEY));
  if (request.method === "GET") return json({test:existing});
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return json({error:"Invalid origin"},403);
  const body = await request.json().catch(()=>null);
  if (body?.action !== "create" || body?.confirmation !== "CREATE WOM TEST") return json({error:"Confirmation required"},400);
  if (existing) return json({error:"Test already attempted. Do not retry; check the recorded WOM ID and reconcile any uncertain result.",test:existing},409);
  if (!env.CYCLE_COORDINATOR?.fetch || !env.WOM_GROUP_VERIFICATION_CODE || Number(env.WOM_GROUP_ID || 12095) !== 12095)
    return json({error:"Coordinator binding or WOM group verification configuration missing"},503);
  // At least one full day, to avoid WOM rejecting a 15-minute competition.
  const startsAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 24 * 60 * 60 * 1000).toISOString();
  const payload = {title:TITLE, metric:"attack", startsAt, endsAt,
    groupId:12095, groupVerificationCode:String(env.WOM_GROUP_VERIFICATION_CODE)};
  const attempted = {status:"attempted",id:ID,title:TITLE,metric:"attack",startsAt,endsAt,
    attemptedAt:new Date().toISOString()};
  // Write before the external request; a failure must not allow a blind retry.
  await kv.put(KEY,JSON.stringify(attempted));
  try {
    const response = await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:ID,payload})
    });
    const result = await response.json().catch(()=>({}));
    const created = response.ok && result.status === "created" && /^\d+$/.test(String(result.competitionId || ""));
    const updated = {...attempted,status:created?"created":"needs_review",
      competitionId:created?String(result.competitionId):null,
      womUrl:created?`https://wiseoldman.net/competitions/${result.competitionId}`:null,
      error:created?null:String(result.error || result.status || `Coordinator HTTP ${response.status}`).slice(0,300),
      checkedAt:new Date().toISOString()};
    await kv.put(KEY,JSON.stringify(updated));
    return json({test:updated},created?200:409);
  } catch(error) {
    const updated={...attempted,status:"needs_review",error:`Coordinator response uncertain: ${String(error.message || error).slice(0,200)}`};
    await kv.put(KEY,JSON.stringify(updated));
    return json({test:updated},409);
  }
}
