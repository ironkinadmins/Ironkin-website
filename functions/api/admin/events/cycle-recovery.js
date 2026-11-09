import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
import { womFetch } from "../../../_wom.js";
import { linkOrFlag } from "../../events/cycle-automation.js";

const PREFIX = "events:sotw-botw-automation:v1:";
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// Staff-only, read-only diagnostic endpoint. Deliberately never retries WOM
// creation or Discord posting: external writes may have succeeded even when
// the website failed to persist their receipt.
export async function onRequest({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }
  if (request.method === "POST") {
    // Explicit staff reconciliation of a known WOM competition. Never create
    // WOM competitions or publish Discord messages from this endpoint.
    const origin = request.headers.get("Origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    if (body?.action !== "attach_existing_wom" ||
        !/^(sotw|botw):\d{4}-\d{2}-\d{2}$/.test(String(body?.id || "")) ||
        !/^\d{1,15}$/.test(String(body?.competitionId || "")) ||
        (body?.metricIndex != null && ![0,1].includes(body.metricIndex))) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const kv = hybridKv(env, "drops");
    const stateKey = PREFIX + body.id;
    const state = parse(await kv.get(stateKey), {});
    if (state.outcome !== "winner" || !state.closedAt ||
        !["creating", "needs_review", "created", "awaiting_activation"].includes(state.womStatus)) {
      return Response.json({ error: "Cycle cannot be reconciled safely." }, { status: 409 });
    }
    const [type, date] = body.id.split(":");
    const option = state.options?.[state.winningIndex];
    if (!Array.isArray(option?.metrics) || option.metrics.length < 1 || option.metrics.length > 2) {
      return Response.json({ error: "Missing or unsupported WOM metrics." }, { status: 409 });
    }
    const metricIndex = Number(body.metricIndex ?? 0);
    if (metricIndex >= option.metrics.length) return Response.json({error:"Invalid metric index."},{status:400});
    const expectedIds = option.metrics.map((_,index)=>String(state.womCompetitions?.find(c => c.metricIndex === index || (c.metricIndex == null && c.role === (index === 0 ? "primary" : "paired")))?.competitionId || state.womCompetitionIds?.[index] || ""));
    if (state.websiteStatus === "linked")
      return Response.json({error:"This cycle is already linked. Reconciliation is blocked to protect the active event."},{status:409});
    if (expectedIds[metricIndex] && expectedIds[metricIndex] !== String(body.competitionId))
      return Response.json({error:"This metric already has a different WOM competition ID; staff review required."},{status:409});
    const response = await womFetch(env, `/competitions/${body.competitionId}`);
    if (!response.ok) return Response.json({ error: `WOM verification HTTP ${response.status}.` }, { status: 502 });
    const raw = await response.json().catch(() => null);
    const competition = raw?.competition || raw;
    const groupId = competition?.groupId ?? competition?.group?.id;
    const metricAliases={"The Nightmare":"nightmare","Phosani's Nightmare":"phosanis_nightmare"};
    const expectedMetric=String(metricAliases[option.metrics[metricIndex]] || option.metrics[metricIndex]).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const expectedTitle = option.metrics.length > 1 ? `${state.womTitle} (${option.metrics[metricIndex]})` : state.womTitle;
    if (String(competition?.id) !== String(body.competitionId) ||
        String(groupId) !== "12095" ||
        String(competition?.metric || "").toLowerCase() !== expectedMetric ||
        (state.womTitle && competition?.title !== expectedTitle)) {
      return Response.json({ error: "WOM group, metric, title or ID mismatch." }, { status: 409 });
    }
    // Preserve metric positions: a missing primary must not shift the paired ID into slot zero.
    const allIds=[...expectedIds];
    allIds[metricIndex]=String(body.competitionId);
    if (new Set(allIds.filter(Boolean)).size !== allIds.filter(Boolean).length)
      return Response.json({error:"Two different metrics cannot use the same WOM competition ID."},{status:409});
    const allReconciled=allIds.every(id=>/^\d+$/.test(id));
    const competitions=allIds.map((id,index)=>id ? {competitionId:id,metric:String(metricAliases[option.metrics[index]] || option.metrics[index]).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""),role:index===0?"primary":"paired",metricIndex:index} : null).filter(Boolean);
    const updated={...state,womStatus:allReconciled?"created":"needs_review",
      womCompetitionId:allReconciled?allIds[0]:state.womCompetitionId || null,
      womCompetitionIds:allReconciled?allIds:[],womCompetitions:competitions,
      womMetric:option.metrics.map(m=>String(metricAliases[m] || m).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")).join(" + "),
      womUrl:allReconciled?`https://wiseoldman.net/competitions/${allIds[0]}`:null,
      womReconciledAt:new Date().toISOString(),womError:allReconciled?null:"Paired metric still needs reconciliation."};
    await kv.put(stateKey, JSON.stringify(updated));
    const config = parse(await kv.get("events:sotw-botw-cycle:v1"), {});
    const event = { id: body.id, type, date, start: `${date}T${config.startTime || "15:00"}` };
    // Never link a partially reconciled pair to the public event.
    const linked = allReconciled ? await linkOrFlag(kv, event, updated) : updated;
    return Response.json({ success: true, womCompetitionId: linked.womCompetitionId,
      websiteStatus: linked.websiteStatus, websiteError: linked.websiteError || null },
      { headers: { "Cache-Control": "no-store" } });
  }
  const kv = hybridKv(env, "drops");
  const config = parse(await kv.get("events:sotw-botw-cycle:v1"), {});
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate || "")) {
    return Response.json({ enabled: false, cycles: [], message: "No cycle start date configured." });
  }
  const cycles = [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const elapsed = Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${config.startDate}T12:00:00Z`)) / (14 * 86400000)));
  for (let n = Math.max(0, elapsed - 3); n <= elapsed + 1; n++) {
    const date = shift(config.startDate, n * 14);
    const type = n % 2 === 0 ? config.firstEvent : config.firstEvent === "botw" ? "sotw" : "botw";
    if (!['sotw', 'botw'].includes(type)) continue;
    const id = `${type}:${date}`;
    const state = parse(await kv.get(PREFIX + id), {});
    const issue = state.womStatus === "needs_review" || state.websiteStatus === "needs_review" || state.finalizationStatus === "needs_review" || state.finalizationStatus === "processing" || state.womStatus === "creating";
    cycles.push({
      id, type, date, pollPublished: !!state.messageId, pollClosed: !!state.closedAt,
      outcome: state.outcome || null, winner: state.options?.[state.winningIndex]?.label || null,
      womStatus: state.womStatus || null, womError: state.womError || null, womCompetitionId: state.womCompetitionId || null,
      websiteStatus: state.websiteStatus || null, websiteEventId: state.websiteEventId || null,
      finalizationStatus: state.finalizationStatus || null, finalizationError: state.finalizationError || null, archiveId: state.archiveId || null,
      awaitingWomActivation: state.womStatus === "awaiting_activation",
      womCompetitionIds: state.womCompetitionIds || (state.womCompetitionId ? [state.womCompetitionId] : []),
      womCompetitions: state.womCompetitions || [],
      metricCount: state.options?.[state.winningIndex]?.metrics?.length || 0,
      womUrl: state.womUrl || null,
      needsReview: !!issue,
      errors: [state.womError, state.websiteError, state.finalizationError].filter(Boolean)
    });
  }
  const checks = [
    { id: "schedule", label: "Cycle schedule", ready: !!config.enabled, detail: config.enabled ? `${config.firstEvent?.toUpperCase()} starts ${config.startDate} at ${config.startTime || "15:00"} ET` : "Cycle is disabled" },
    { id: "secret", label: "Automation authentication", ready: !!env.CYCLE_AUTOMATION_SECRET, detail: env.CYCLE_AUTOMATION_SECRET ? "Secret configured" : "CYCLE_AUTOMATION_SECRET is missing" },
    { id: "wom", label: "Automatic WOM creation", ready: env.CYCLE_AUTO_WOM_CREATE_ENABLED === "true" && !!env.CYCLE_COORDINATOR && !!env.WOM_GROUP_VERIFICATION_CODE, detail: env.CYCLE_AUTO_WOM_CREATE_ENABLED !== "true" ? "Automatic WOM creation is disabled" : !env.CYCLE_COORDINATOR ? "CYCLE_COORDINATOR binding missing" : !env.WOM_GROUP_VERIFICATION_CODE ? "WOM group verification secret missing" : "WOM creation prerequisites configured" },
    { id: "finalize", label: "Automatic finalization", ready: env.CYCLE_AUTO_FINALIZE_ENABLED === "true", detail: env.CYCLE_AUTO_FINALIZE_ENABLED === "true" ? "Enabled" : "CYCLE_AUTO_FINALIZE_ENABLED is not true" },
    { id: "review", label: "Cycle review queue", ready: !cycles.some(c => c.needsReview), detail: cycles.some(c => c.needsReview) ? "One or more cycles require staff review" : "No flagged cycles in the recent window" }
  ];
  return Response.json({ enabled: !!config.enabled, autoFinalizeEnabled: env.CYCLE_AUTO_FINALIZE_ENABLED === "true", checks, cycles }, { headers: { "Cache-Control": "no-store" } });
}
