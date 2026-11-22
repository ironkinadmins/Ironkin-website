import { hybridKv } from "./_hybridKv.js";
import { syncRecordEmbeds } from "./_recordsAutoSync.js";

const KEY = "events:archive";
const eligibleType = entry => entry?.type === "sotw" ? "sotw" :
  (entry?.type === "botw" || entry?.type === "botw-standard" || entry?.type === "botw-elite") ? "botw" : null;
const parse = raw => { try { return JSON.parse(raw || "[]"); } catch { return []; } };
const retryDelay = attempts => Math.min(6 * 3600000, 15 * 60000 * (2 ** Math.min(5, Math.max(0, attempts - 1))));

// Invoked from the existing 15-minute cycle maintenance. It only republishes
// the historical record board from existing archived results. It does not
// rearchive, recalculate rewards, send winner DMs, or modify WOM competitions.
export async function retryFailedHistoricalRecordSync(env, now = new Date()) {
  const kv = hybridKv(env, "drops");
  const raw = await kv.get(KEY);
  const archive = parse(raw);
  if (!Array.isArray(archive)) return { skipped: "invalid_archive" };
  // Legacy Standard/Elite archives were committed before their archive hook
  // recognized the split types. They have no recordsSync metadata at all.
  // Reconcile those once, using the existing archive snapshot; never rearchive.
  const pending = archive.filter(entry => eligibleType(entry) && (
    entry?.recordsSync?.status === "failed" &&
      (!entry.recordsSync.nextRetryAt || Date.parse(entry.recordsSync.nextRetryAt) <= now.getTime()) ||
    (entry?.recordsSync == null && ["botw-standard", "botw-elite"].includes(entry.type))
  ));
  if (!pending.length) return { skipped: "no_due_failures" };
  // At most one Discord sync per category per invocation, even if many archives failed.
  const dueTypes = [...new Set(pending.map(eligibleType))];
  const results = {};
  for (const type of dueTypes) {
    try { results[type] = { status: "synced", result: await syncRecordEmbeds(env, archive, [type]) }; }
    catch (error) { results[type] = { status: "failed", error: String(error?.message || error).slice(0, 250) }; }
  }
  // Re-read after network requests to avoid overwriting new archives created
  // while Discord was responding. Only update matching failed record metadata.
  const latest = parse(await kv.get(KEY));
  if (!Array.isArray(latest)) return { skipped: "invalid_latest_archive" };
  const ids = new Set(pending.map(entry => String(entry.archiveRequestId || entry.id)));
  let updated = 0;
  for (const entry of latest) {
    if (!ids.has(String(entry.archiveRequestId || entry.id)) || !(entry?.recordsSync?.status === "failed" || (entry?.recordsSync == null && ["botw-standard", "botw-elite"].includes(entry.type)))) continue;
    const outcome = results[eligibleType(entry)];
    if (!outcome) continue;
    const attempts = Number(entry.recordsSync?.attempts || 0) + 1;
    entry.recordsSync = outcome.status === "synced"
      ? { status: "synced", at: now.toISOString(), attempts, results: outcome.result }
      : { status: "failed", at: now.toISOString(), attempts, nextRetryAt: new Date(now.getTime() + retryDelay(attempts)).toISOString(), error: outcome.error };
    updated++;
  }
  if (updated) await kv.put(KEY, JSON.stringify(latest));
  return { updated, types: Object.fromEntries(Object.entries(results).map(([type, result]) => [type, result.status])) };
}
