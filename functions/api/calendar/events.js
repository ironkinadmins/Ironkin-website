import { hybridKv } from "../../_hybridKv.js";
import { syncDiscordCalendarBoard } from "../../_discordCalendar.js";

const CUSTOM_EVENTS_KEY = "calendar:custom-events";

async function getCustomEvents(env) {
  if (!hybridKv(env, "calendar")) return [];

  const saved = await hybridKv(env, "calendar").get(CUSTOM_EVENTS_KEY);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

async function getBountyCalendarEntry(env) {
  const kv = hybridKv(env, "drops");
  if (!kv) return null;
  let drops = [];
  try { drops = JSON.parse(await kv.get("drops:bounties") || "[]"); } catch { return null; }
  const valid = (Array.isArray(drops) ? drops : []).filter(drop =>
    drop.bountyEnabled !== false && Number.isFinite(Date.parse(drop.bountyStartsAt)) &&
    Number.isFinite(Date.parse(drop.bountyEndsAt)) && Date.parse(drop.bountyEndsAt) > Date.now() &&
    Date.parse(drop.bountyStartsAt) < Date.parse(drop.bountyEndsAt)
  );
  if (!valid.length) return null;
  const start = new Date(Math.min(...valid.map(drop => Date.parse(drop.bountyStartsAt)))).toISOString();
  const end = new Date(Math.max(...valid.map(drop => Date.parse(drop.bountyEndsAt)))).toISOString();
  return { id: "ironkin-bounties-auto", title: "Bounties", eventType: "bounties", category: "bounties",
    start, end, description: "Visit the Bounties section to see currently active items and rewards. Announcements are handled by the team.",
    automated: true, discordNotificationsEnabled: false, remindersEnabled: false };
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
  const bounty = await getBountyCalendarEntry(env);
  // Replace legacy manually created Bounties entries to avoid duplicates.
  const filtered = events.filter(event => !(
    String(event?.eventType || event?.category || "").toLowerCase() === "bounties" ||
    String(event?.id || "") === "ironkin-bounties-auto" ||
    String(event?.title || "").trim().toLowerCase() === "bounties"
  ));
  const sortedEvents = sortEvents(bounty ? [...filtered, bounty] : filtered);

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
