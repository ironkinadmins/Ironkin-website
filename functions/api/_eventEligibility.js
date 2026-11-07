// Shared submission eligibility for RuneLite event discovery and proof intake.
// Permanent categories are intentionally independent of competition dates.
export function isPermanentSubmissionEvent(event) {
  return ["pvm-entry", "bounties"].includes(String(event?.id || "").toLowerCase()) ||
    ["pvm-entry", "bounties"].includes(String(event?.type || "").toLowerCase());
}

export function isEventAcceptingSubmissions(event, now = Date.now()) {
  if (!event) return false;
  if (isPermanentSubmissionEvent(event)) return true;
  if (event.active !== true) return false;
  const startRaw = event.startDate || event.start;
  const endRaw = event.endDate || event.end;
  if (startRaw) {
    const start = Date.parse(startRaw);
    if (!Number.isFinite(start) || now < start) return false;
  }
  if (endRaw) {
    const end = Date.parse(endRaw);
    if (!Number.isFinite(end) || now >= end) return false;
  } else if (["sotw", "botw"].includes(String(event.type || "").toLowerCase())) {
    // A missing competition deadline must fail closed, not stay open forever.
    return false;
  }
  return true;
}
