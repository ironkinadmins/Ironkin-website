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
        !/^\d{1,15}$/.test(String(body?.competitionId || ""))) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const kv = hybridKv(env, "drops");
    const stateKey = PREFIX + body.id;
    const state = parse(await kv.get(stateKey), {});
    if (state.outcome !== "winner" || !state.closedAt ||
        (state.womCompetitionId && String(state.womCompetitionId) !== String(body.competitionId)) ||
        !["creating", "needs_review", "created", "awaiting_activation"].includes(state.womStatus)) {
      return Response.json({ error: "Cycle cannot be reconciled safely." }, { status: 409 });
    }
    const [type, date] = body.id.split(":");
    const option = state.options?.[state.winningIndex];
    if (option?.metrics?.length !== 1) {
      return Response.json({ error: "Paired or missing WOM metric requires manual setup." }, { status: 409 });
    }
    const response = await womFetch(env, `/competitions/${body.competitionId}`);
    if (!response.ok) return Response.json({ error: `WOM verification HTTP ${response.status}.` }, { status: 502 });
    const raw = await response.json().catch(() => null);
    const competition = raw?.competition || raw;
    const groupId = competition?.groupId ?? competition?.group?.id;
    const expectedMetric = String(state.womMetric || option.metrics[0]).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (String(competition?.id) !== String(body.competitionId) ||
        String(groupId) !== "12095" ||
        String(competition?.metric || "").toLowerCase() !== expectedMetric ||
        (state.womTitle && competition?.title !== state.womTitle)) {
      return Response.json({ error: "WOM group, metric, title or ID mismatch." }, { status: 409 });
    }
    const updated = { ...state, womStatus: "created", womCompetitionId: String(body.competitionId),
      womMetric: expectedMetric, womUrl: `https://wiseoldman.net/competitions/${body.competitionId}`,
      womReconciledAt: new Date().toISOString(), womError: null };
    await kv.put(stateKey, JSON.stringify(updated));
    const config = parse(await kv.get("events:sotw-botw-cycle:v1"), {});
    const event = { id: body.id, type, date, start: `${date}T${config.startTime || "15:00"}` };
    const linked = await linkOrFlag(kv, event, updated);
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
      womStatus: state.womStatus || null, womCompetitionId: state.womCompetitionId || null,
      websiteStatus: state.websiteStatus || null, websiteEventId: state.websiteEventId || null,
      finalizationStatus: state.finalizationStatus || null, archiveId: state.archiveId || null,
      needsReview: !!issue,
      errors: [state.womError, state.websiteError, state.finalizationError].filter(Boolean)
    });
  }
  return Response.json({ enabled: !!config.enabled, autoFinalizeEnabled: env.CYCLE_AUTO_FINALIZE_ENABLED === "true", cycles }, { headers: { "Cache-Control": "no-store" } });
}
