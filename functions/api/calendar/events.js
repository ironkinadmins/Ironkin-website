const CUSTOM_EVENTS_KEY = "calendar:custom-events";

async function getCustomEvents(env) {
  if (!env.CALENDAR_KV) return [];

  const saved = await env.CALENDAR_KV.get(CUSTOM_EVENTS_KEY);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

function getStartValue(event) {
  return event?.start || event?.startDate || event?.date || "";
}

function sortEvents(events) {
  return events
    .filter(event => event && getStartValue(event))
    .sort((a, b) => new Date(getStartValue(a)) - new Date(getStartValue(b)));
}

export async function onRequestGet({ env }) {
  const events = await getCustomEvents(env);

  return Response.json({
    events: sortEvents(events),
    source: "ironkin-website",
    cached: false
  });
}
