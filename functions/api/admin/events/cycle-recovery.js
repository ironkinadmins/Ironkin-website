import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

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
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
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
