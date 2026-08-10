export function eventTypeSlug(event) {
  const type = String(event?.type || event?.eventType || "event").toLowerCase();
  if (type === "clan-goal-skill" || type === "clan-goal-boss" || type === "clan_goal") return "clan-goal";
  return type.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
}

export function makePluginEventId(event) {
  if (event?.id === "pvm-entry" || event?.type === "pvm-entry") return "pvm-entry";
  if (event?.pluginEventId) return String(event.pluginEventId);
  const type = eventTypeSlug(event);
  const wom = String(event?.womCompetitionId || "").trim();
  if (wom) return `${type}-${wom}`;
  const date = String(event?.startDate || event?.start || "").slice(0, 10).replace(/-/g, "");
  return `${type}-${date || "current"}`;
}
