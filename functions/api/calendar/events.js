const CACHE_KEY = "calendar:events";
const CACHE_TTL_SECONDS = 60 * 30; // 30 minutes

function parseIcsDate(value) {
  if (!value) return null;

  const clean = value.trim();

  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`;
  }

  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}Z`;
  }

  if (/^\d{8}T\d{6}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
  }

  return clean;
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function getIcsValue(lines, key) {
  const line = lines.find(item =>
    item.startsWith(`${key}:`) ||
    item.startsWith(`${key};`)
  );

  if (!line) return "";

  return line
    .slice(line.indexOf(":") + 1)
    .replace(/\\,/g, ",")
    .replace(/\\n/g, " ")
    .trim();
}

function parseEvents(icsText) {
  const unfolded = unfoldIcs(icsText);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);

  return blocks
    .map(block => {
      const lines = block.split(/\r?\n/);

      return {
        title: getIcsValue(lines, "SUMMARY") || "Untitled Event",
        description: getIcsValue(lines, "DESCRIPTION"),
        location: getIcsValue(lines, "LOCATION"),
        start: parseIcsDate(getIcsValue(lines, "DTSTART")),
        end: parseIcsDate(getIcsValue(lines, "DTEND"))
      };
    })
    .filter(event => event.start);
}

async function getCachedEvents(env) {
  if (!env.CALENDAR_KV) return null;

  const cached = await env.CALENDAR_KV.get(CACHE_KEY);

  if (!cached) return null;

  return JSON.parse(cached);
}

async function setCachedEvents(env, events) {
  if (!env.CALENDAR_KV) return;

  await env.CALENDAR_KV.put(
    CACHE_KEY,
    JSON.stringify(events),
    {
      expirationTtl: CACHE_TTL_SECONDS
    }
  );
}

export async function onRequestGet({ env }) {
  const calendarUrl = env.GOOGLE_CALENDAR_ICS_URL;

  if (!calendarUrl) {
    return Response.json(
      { error: "Missing GOOGLE_CALENDAR_ICS_URL secret." },
      { status: 500 }
    );
  }

  const cachedEvents = await getCachedEvents(env);

  if (cachedEvents) {
    return Response.json({
      events: cachedEvents,
      cached: true
    });
  }

  const response = await fetch(calendarUrl, {
    headers: {
      "User-Agent": "Ironkin-Website-Calendar"
    }
  });

  if (!response.ok) {
    return Response.json(
      {
        error: "Could not load Google Calendar.",
        status: response.status,
        statusText: response.statusText
      },
      { status: 500 }
    );
  }

  const icsText = await response.text();
  const events = parseEvents(icsText);

  await setCachedEvents(env, events);

  return Response.json({
    events,
    cached: false
  });
}