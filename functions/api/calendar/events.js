import { syncDiscordCalendarBoard } from "../../_discordCalendar.js";

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

export async function onRequestGet({ env, waitUntil }) {
  const events = await getCustomEvents(env);
  const sortedEvents = sortEvents(events);

  // Keep the Discord #current-events board fresh whenever the website calendar is viewed.
  // This is intentionally non-blocking so the website calendar stays instant.
  if (typeof waitUntil === "function") {
    waitUntil(syncDiscordCalendarBoard(env));
  }

  return Response.json({
    events: sortedEvents,
    source: "ironkin-website",
    cached: false
  });
}
