import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
import { womFetch } from "../../../_wom.js";

// One-shot, staff-only WOM integration test. The fixed coordinator ID ensures
// repeated requests cannot create multiple WOM competitions.
const KEY = "events:wom-connection-test:2026-10-25:v1";
const HISTORY_KEY = `${KEY}:history`;
const TITLE = "Ironkin AUTOMATION TEST - DELETE AFTER";
const json = (data, status = 200) => Response.json(data, {status, headers:{"Cache-Control":"no-store"}});
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

async function verifyCompetition(env, id) {
  try {
    const response = await womFetch(env, `/competitions/${encodeURIComponent(id)}`);
    const data = await response.json().catch(() => null);
    const competition = data?.competition || data;
    if (response.status === 404) return {verified:false, reason:"WOM returned 404: competition not found"};
    if (!response.ok) return {verified:false, reason:`WOM verification HTTP ${response.status}`};
    if (String(competition?.id) !== String(id)) return {verified:false, reason:"WOM ID mismatch"};
    if (String(competition?.groupId ?? competition?.group?.id) !== "12095") return {verified:false, reason:"WOM group 12095 not verified"};
    if (String(competition?.metric || "") !== "attack") return {verified:false, reason:"Unexpected competition metric"};
    if (String(competition?.title || "") !== TITLE) return {verified:false, reason:"Unexpected competition title"};
    return {verified:true, reason:null};
  } catch (error) {return {verified:false, reason:`Verification failed: ${String(error.message || error).slice(0,160)}`};}
}

export async function onRequest({request, env}) {
  if (!isStaffSession(await getSession(request, env))) return json({error:"Staff only"}, 403);
  if (request.method !== "GET" && request.method !== "POST") return json({error:"Method not allowed"}, 405);
  const kv = hybridKv(env, "drops");
  const existing = parse(await kv.get(KEY));
  if (request.method === "GET") {
    return json({test:existing});
  }
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return json({error:"Invalid origin"},403);
  const body = await request.json().catch(()=>null);
  if (body?.action === "resolve_missing_competition") {
    if (body.confirmation !== "RESOLVE MISSING WOM TEST") return json({error:"Explicit confirmation required"},400);
    if (!existing || existing.status !== "needs_review" || !/^\d+$/.test(String(existing.competitionId || "")))
      return json({error:"Only a recorded, unverified WOM competition can be resolved here"},409);
    const first = await verifyCompetition(env, existing.competitionId);
    if (first.reason !== "WOM returned 404: competition not found")
      return json({error:"WOM no longer returns a definite 404. Do not resolve without manual review.",verification:first},409);
    const history = parse(await kv.get(HISTORY_KEY)) || [];
    const resolved = {...existing,status:"resolved_missing",resolvedAt:new Date().toISOString(),
      resolution:"Administrator confirmed missing from WOM group; API rechecked and returned 404. Original response preserved.",
      verificationError:first.reason};
    await kv.put(HISTORY_KEY,JSON.stringify([...history.slice(-19),resolved]));
    await kv.put(KEY,JSON.stringify(resolved));
    return json({test:resolved,historySaved:true});
  }
  if (body?.action === "resolve_rate_limited_attempt") {
    if (body.confirmation !== "I CHECKED WOM AND ACCEPT THE DUPLICATE RISK")
      return json({error:"Explicit manual reconciliation confirmation required"},400);
    if (!existing || existing.status !== "needs_review" || existing.competitionId ||
        !/Too Many Requests|rate.limit|HTTP 429/i.test(String(existing.error || "")))
      return json({error:"Only an unconfirmed rate-limited attempt without a competition ID can be reviewed here"},409);
    // Reconciliation only archives the local record. It makes no WOM request and
    // does not override a rate limit imposed by WOM or the coordinator.
    const history = parse(await kv.get(HISTORY_KEY)) || [];
    const resolved = {...existing,status:"resolved_missing",resolvedAt:new Date().toISOString(),
      resolution:"Admin manually checked WOM group 12095 and acknowledged that a 429 response cannot rule out creation. No WOM API call made."};
    await kv.put(HISTORY_KEY,JSON.stringify([...history.slice(-19),resolved]));
    await kv.put(KEY,JSON.stringify(resolved));
    return json({test:resolved,historySaved:true,warning:"Local record reconciled; WOM rate limits remain in force. Check WOM again before any new creation."});
  }
  if (body?.action === "resolve_missing_api_key") {
    if (body.confirmation !== "RESOLVE MISSING API KEY")
      return json({error:"Explicit confirmation required"},400);
    // Coordinator checks WOM_API_KEY before calling WOM. Only this exact
    // preflight rejection is safe to resolve without an external lookup.
    if (!existing || existing.status !== "needs_review" ||
        existing.error !== "Coordinator WOM_API_KEY secret is missing" ||
        Number(existing.coordinatorHttpStatus) !== 503 ||
        existing.competitionId != null || existing.womCreateHttpStatus != null)
      return json({error:"Not a confirmed preflight API-key rejection; manual reconciliation required."},409);
    const history = parse(await kv.get(HISTORY_KEY)) || [];
    const resolved = {...existing,status:"resolved_missing",resolvedAt:new Date().toISOString(),
      resolution:"Missing API key rejected by coordinator before WOM creation; admin resolved stored preflight failure. No WOM API request made."};
    await kv.put(HISTORY_KEY,JSON.stringify([...history.slice(-19),resolved]));
    await kv.put(KEY,JSON.stringify(resolved));
    return json({test:resolved,historySaved:true});
  }
  if (body?.action === "reset_private_service" || body?.action === "reset_preflight_rejection") {
    if (body.confirmation !== "RESET FAILED TEST") return json({error:"Confirmation required"},400);
    if (!existing || existing.status !== "needs_review" || !(["Private service", "Invalid WOM request", "Coordinator WOM verification secret not configured", "Coordinator WOM verification secret mismatch"].includes(existing.error) && (existing.error === "Private service" || existing.safeToRetry === true || existing.error === "Invalid WOM request")) || existing.competitionId)
      return json({error:"Reset blocked: this result is not proven safe to retry. Reconcile WOM manually."},409);
    await kv.delete(KEY);
    return json({test:null,reset:true});
  }
  if (body?.action !== "create" || body?.confirmation !== "CREATE WOM TEST") return json({error:"Confirmation required"},400);
  if (existing && existing.status !== "resolved_missing")
    return json({error:"Test already attempted. Reconcile WOM before retrying.",test:existing},409);
  if (existing?.status === "resolved_missing" && body?.retryConfirmation !== "CREATE NEW WOM TEST AFTER RESOLUTION")
    return json({error:"A new real WOM competition requires a second explicit confirmation",test:existing},400);
  if (!env.CYCLE_COORDINATOR?.fetch || !env.WOM_GROUP_VERIFICATION_CODE || Number(env.WOM_GROUP_ID || 12095) !== 12095)
    return json({error:"Coordinator binding or WOM group verification configuration missing"},503);
  // At least one full day, to avoid WOM rejecting a 15-minute competition.
  const startsAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 24 * 60 * 60 * 1000).toISOString();
  const payload = {title:TITLE, metric:"attack", startsAt, endsAt,
    groupId:12095, groupVerificationCode:String(env.WOM_GROUP_VERIFICATION_CODE)};
  const id = `live-test:${Date.now()}`;
  const attempted = {status:"attempted",id,title:TITLE,metric:"attack",startsAt,endsAt,
    attemptedAt:new Date().toISOString()};
  // Write before the external request; a failure must not allow a blind retry.
  await kv.put(KEY,JSON.stringify(attempted));
  try {
    const response = await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,payload})
    });
    const result = await response.json().catch(()=>({}));
    const returnedId = /^\d+$/.test(String(result.competitionId || "")) ? String(result.competitionId) : null;
    const created = response.ok && result.status === "created" && Boolean(returnedId);
    const check = created ? await verifyCompetition(env, result.competitionId) : null;
    const verified = created && check.verified;
    const updated = {...attempted,status:verified?"verified":"needs_review", verificationError:created&&!verified?check.reason:null,
      competitionId:returnedId,
      coordinatorStatus:String(result.status || "unknown"),
      coordinatorHttpStatus:response.status,
      womCreateHttpStatus:result.womCreateHttpStatus ?? null,
      verificationHttpStatus:result.verificationHttpStatus ?? null,
      womUrl:returnedId?`https://wiseoldman.net/competitions/${returnedId}`:null,
      error:created?null:String(result.error || result.status || `Coordinator HTTP ${response.status}`).slice(0,300),
      reason:created?null:(result.reason || null), safeToRetry:!created && result.safeToRetry === true,
      checkedAt:new Date().toISOString()};
    await kv.put(KEY,JSON.stringify(updated));
    return json({test:updated},verified?200:409);
  } catch(error) {
    const updated={...attempted,status:"needs_review",error:`Coordinator response uncertain: ${String(error.message || error).slice(0,200)}`};
    await kv.put(KEY,JSON.stringify(updated));
    return json({test:updated},409);
  }
}
