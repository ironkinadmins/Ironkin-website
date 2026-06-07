const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

const CUSTOM_CALENDAR_EVENTS_KEY = "calendar:custom-events";
const GOOGLE_CACHE_KEY = "calendar:events";
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

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function makeId(prefix = "calendar") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLabelForType(type) {
  if (type === "sotw") return "SOTW";
  if (type === "botw") return "BOTW";
  if (type === "clan-goal-skill" || type === "clan-goal-boss") return "Clan Goal";
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

async function saveCustomCalendarEvent(env, event) {
  const events = await getJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, []);
  const index = events.findIndex(item => item.id === event.id);

  if (index >= 0) events[index] = event;
  else events.push(event);

  events.sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));

  await env.CALENDAR_KV.put(CUSTOM_CALENDAR_EVENTS_KEY, JSON.stringify(events));
  await env.CALENDAR_KV.delete(GOOGLE_CACHE_KEY).catch(() => null);

  return events;
}

async function addOrUpdateActiveEvent(env, calendarEvent) {
  if (!env.DROPS_KV || !calendarEvent.womCompetitionId) return;

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
    milestones: calendarEvent.eventType === "clan-goal-skill" || calendarEvent.eventType === "clan-goal-boss"
      ? [
          { percent: 33, title: "Clan Mass" },
          { percent: 66, title: "Bonus Embers" },
          { percent: 100, title: "Bond Giveaway" }
        ]
      : []
  };

  const index = events.findIndex(item => item.id === activeEvent.id);
  if (index >= 0) {
    events[index] = {
      ...events[index],
      ...activeEvent,
      milestones: Array.isArray(events[index].milestones) ? events[index].milestones : []
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

export async function onRequestPost({ request, env }) {
  if (!isStaff(request)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  if (!env.CALENDAR_KV) {
    return Response.json({ error: "Missing CALENDAR_KV binding." }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const createWom = body.createWom === true;

    const event = {
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
      womMetric: cleanText(body.womMetric),
      womCompetitionId: cleanText(body.womCompetitionId) || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!event.title || !event.start || !event.end) {
      return Response.json({ error: "Title, start date, and end date are required." }, { status: 400 });
    }

    if (new Date(event.end).getTime() <= new Date(event.start).getTime()) {
      return Response.json({ error: "End date must be after start date." }, { status: 400 });
    }

    if (createWom) {
      if (!event.womMetric) {
        return Response.json({ error: "Choose a skill or boss metric before creating a WOM competition." }, { status: 400 });
      }

      if ((event.eventType === "clan-goal-skill" || event.eventType === "clan-goal-boss") && !event.target) {
        return Response.json({ error: "Clan Goals need a target XP or target KC." }, { status: 400 });
      }

      const womCompetition = await createWomCompetition(env, event);
      event.womCompetitionId = String(womCompetition.id);
      event.womCreatedAt = new Date().toISOString();
    }

    await saveCustomCalendarEvent(env, event);
    if (event.womCompetitionId) await addOrUpdateActiveEvent(env, event);

    return Response.json({ success: true, event });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save calendar event." }, { status: 500 });
  }
}
