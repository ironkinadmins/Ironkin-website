import { mirrorCalendarEventCreate, mirrorCalendarEventDelete, mirrorCalendarEventCancel } from "../../../_discordCalendar.js";

const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

const CUSTOM_CALENDAR_EVENTS_KEY = "calendar:custom-events";
const ACTIVE_EVENTS_KEY = "events:active";

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);

  if (!match) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

function isStaff(request) {
  const session = getSession(request);
  return session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId));
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

const IRONKIN_ADMIN_TIME_ZONE = "America/Toronto";

function getTimeZoneOffsetMs(date, timeZone = IRONKIN_ADMIN_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date).reduce((map, part) => {
    if (part.type !== "literal") map[part.type] = part.value;
    return map;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function easternWallTimeToUtcIso(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcDate = new Date(wallTimeAsUtc - getTimeZoneOffsetMs(new Date(wallTimeAsUtc)));
  utcDate = new Date(wallTimeAsUtc - getTimeZoneOffsetMs(utcDate));

  return Number.isFinite(utcDate.getTime()) ? utcDate.toISOString() : null;
}

function normalizeDate(value) {
  if (!value) return null;

  const raw = String(value);

  // If the browser sent a timezone-aware timestamp, preserve that exact instant.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  // Legacy fallback: treat timezone-less admin timestamps as Eastern Time, not UTC.
  const easternIso = easternWallTimeToUtcIso(raw);
  if (easternIso) return easternIso;

  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function makeId(prefix = "calendar") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLabelForType(type) {
  if (type === "sotw") return "SOTW";
  if (type === "botw") return "BOTW";
  if (type === "clan-goal" || type === "clan-goal-skill" || type === "clan-goal-boss") return "Clan Goal";
  if (type === "normal") return "Normal Event";
  if (type === "mass") return "Clan Mass";
  if (type === "giveaway") return "Giveaway";
  return "Event";
}

async function getJson(kv, key, fallback) {
  if (!kv) return fallback;
  const saved = await kv.get(key);
  if (!saved) return fallback;

  try {
    return JSON.parse(saved);
  } catch {
    return fallback;
  }
}

async function putJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

async function getCustomCalendarEvents(env) {
  return getJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, []);
}

async function saveCustomCalendarEvent(env, event) {
  const events = await getCustomCalendarEvents(env);
  const index = events.findIndex(item => item.id === event.id);

  if (event.featured === true) {
    events.forEach(item => {
      if (item.id !== event.id) item.featured = false;
    });
  }

  const savedEvent = index >= 0
    ? { ...events[index], ...event, updatedAt: new Date().toISOString() }
    : event;

  if (index >= 0) events[index] = savedEvent;
  else events.push(savedEvent);

  events.sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));
  await putJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, events);

  return { events, event: savedEvent };
}

async function deleteCustomCalendarEvent(env, eventId) {
  const events = await getCustomCalendarEvents(env);
  const event = events.find(item => item.id === eventId);

  if (!event) return null;

  const remaining = events.filter(item => item.id !== eventId);
  await putJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, remaining);

  return event;
}

async function deleteActiveEvent(env, eventId) {
  if (!env.DROPS_KV) return;

  const events = await getJson(env.DROPS_KV, ACTIVE_EVENTS_KEY, []);
  const remaining = events.filter(item => item.id !== eventId);

  if (remaining.length !== events.length) {
    await env.DROPS_KV.put(ACTIVE_EVENTS_KEY, JSON.stringify(remaining));
  }
}

async function addOrUpdateActiveEvent(env, calendarEvent) {
  if (!env.DROPS_KV || !calendarEvent.womCompetitionId || calendarEvent.status === "cancelled") {
    if (calendarEvent.status === "cancelled") await deleteActiveEvent(env, calendarEvent.id);
    return;
  }

  const events = await getJson(env.DROPS_KV, ACTIVE_EVENTS_KEY, []);
  const activeEvent = {
    id: calendarEvent.id,
    type: calendarEvent.eventType,
    label: getLabelForType(calendarEvent.eventType),
    title: calendarEvent.title,
    description: calendarEvent.description || "",
    womCompetitionId: String(calendarEvent.womCompetitionId),
    featured: calendarEvent.featured === true,
    active: true,
    dropsEnabled: calendarEvent.dropsEnabled !== false,
    target: calendarEvent.target || null,
    startDate: calendarEvent.start,
    endDate: calendarEvent.end,
    metric: calendarEvent.womMetric || null,
    goalKind: calendarEvent.goalKind || null,
    milestones: calendarEvent.eventType === "clan-goal" || calendarEvent.eventType === "clan-goal-skill" || calendarEvent.eventType === "clan-goal-boss"
      ? [
          { percent: 33, title: "Clan Mass" },
          { percent: 66, title: "Bonus Embers" },
          { percent: 100, title: "Bond Giveaway" }
        ]
      : []
  };

  if (activeEvent.featured === true) {
    events.forEach(item => {
      item.featured = false;
    });
  }

  const index = events.findIndex(item => item.id === activeEvent.id);
  if (index >= 0) {
    events[index] = {
      ...events[index],
      ...activeEvent,
      milestones: Array.isArray(events[index].milestones) ? events[index].milestones : activeEvent.milestones
    };
  } else {
    events.push(activeEvent);
  }

  await env.DROPS_KV.put(ACTIVE_EVENTS_KEY, JSON.stringify(events));
}

async function createWomCompetition(env, event) {
  const groupId = Number(env.WOM_GROUP_ID || 12095);
  const groupVerificationCode = env.WOM_GROUP_VERIFICATION_CODE;

  if (!groupId || !groupVerificationCode) {
    throw new Error("Missing WOM_GROUP_ID or WOM_GROUP_VERIFICATION_CODE Cloudflare secret.");
  }

  const payload = {
    title: event.title,
    metric: event.womMetric,
    startsAt: event.start,
    endsAt: event.end,
    groupId,
    groupVerificationCode: String(groupVerificationCode)
  };

  const response = await fetch("https://api.wiseoldman.net/v2/competitions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Ironkin-Website-Calendar"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Wise Old Man could not create the competition.");
  }

  const competition = data.competition || data;
  if (!competition?.id) throw new Error("Wise Old Man created a response without a competition ID.");

  return competition;
}

export async function onRequestDelete({ request, env, waitUntil }) {
  if (!isStaff(request)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  if (!env.CALENDAR_KV) {
    return Response.json({ error: "Missing CALENDAR_KV binding." }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const eventId = cleanText(body.id);

    if (!eventId) {
      return Response.json({ error: "Missing event ID." }, { status: 400 });
    }

    const deletedEvent = await deleteCustomCalendarEvent(env, eventId);

    if (!deletedEvent) {
      return Response.json(
        { error: "Event not found or cannot be deleted from here." },
        { status: 404 }
      );
    }

    await deleteActiveEvent(env, eventId);

    const discordSync = mirrorCalendarEventDelete(env, deletedEvent);
    if (typeof waitUntil === "function") waitUntil(discordSync);
    else await discordSync.catch(() => null);

    return Response.json({ success: true, deletedId: eventId });
  } catch (error) {
    return Response.json({ error: error.message || "Could not delete calendar event." }, { status: 500 });
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!isStaff(request)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  if (!env.CALENDAR_KV) {
    return Response.json({ error: "Missing CALENDAR_KV binding." }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const createWomRequested = body.createWom === true;
    const events = await getCustomCalendarEvents(env);
    const existing = cleanText(body.id) ? events.find(item => item.id === cleanText(body.id)) : null;

    const event = {
      ...(existing || {}),
      id: cleanText(body.id) || makeId("calendar"),
      source: "ironkin-admin",
      title: cleanText(body.title, "Untitled Event"),
      description: cleanText(body.description),
      location: cleanText(body.location),
      start: normalizeDate(body.start),
      end: normalizeDate(body.end),
      eventType: cleanText(body.eventType, "other"),
      category: cleanText(body.category, body.eventType || "other"),
      featured: body.featured === true,
      dropsEnabled: body.dropsEnabled !== false,
      target: body.target ? Number(body.target) : null,
      goalKind: cleanText(body.goalKind),
      womMetric: cleanText(body.womMetric) || cleanText(existing?.womMetric),
      womCompetitionId: cleanText(body.womCompetitionId) || cleanText(existing?.womCompetitionId) || null,
      status: cleanText(body.status, existing?.status || "scheduled"),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!event.title || !event.start || !event.end) {
      return Response.json({ error: "Title, start date, and end date are required." }, { status: 400 });
    }

    if (new Date(event.end).getTime() <= new Date(event.start).getTime()) {
      return Response.json({ error: "End date must be after start date." }, { status: 400 });
    }

    if (event.status === "cancelled") {
      event.featured = false;
    }

    if (createWomRequested && !event.womCompetitionId && event.status !== "cancelled") {
      if (!event.womMetric) {
        return Response.json({ error: "Choose a skill or boss metric before creating a WOM competition." }, { status: 400 });
      }

      if ((event.eventType === "clan-goal" || event.eventType === "clan-goal-skill" || event.eventType === "clan-goal-boss") && !event.target) {
        return Response.json({ error: "Clan Goals need a target XP or target KC." }, { status: 400 });
      }

      const womCompetition = await createWomCompetition(env, event);
      event.womCompetitionId = String(womCompetition.id);
      event.womCreatedAt = new Date().toISOString();
    }

    const { event: savedEvent } = await saveCustomCalendarEvent(env, event);

    if (savedEvent.status === "cancelled") await deleteActiveEvent(env, savedEvent.id);
    else if (savedEvent.womCompetitionId) await addOrUpdateActiveEvent(env, savedEvent);

    const discordSync = savedEvent.status === "cancelled"
      ? mirrorCalendarEventCancel(env, savedEvent)
      : mirrorCalendarEventCreate(env, savedEvent);

    if (typeof waitUntil === "function") waitUntil(discordSync);
    else await discordSync.catch(() => null);

    return Response.json({ success: true, event: savedEvent });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save calendar event." }, { status: 500 });
  }
}
