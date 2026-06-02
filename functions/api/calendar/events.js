function parseIcsDate(value) {
  if (!value) return null;

  const clean = value.trim();

  if (/^\d{8}$/.test(clean)) {
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);

    return `${year}-${month}-${day}T00:00:00`;
  }

  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    const hour = clean.slice(9, 11);
    const minute = clean.slice(11, 13);
    const second = clean.slice(13, 15);

    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }

  if (/^\d{8}T\d{6}$/.test(clean)) {
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    const hour = clean.slice(9, 11);
    const minute = clean.slice(11, 13);
    const second = clean.slice(13, 15);

    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  return clean;
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function getIcsValue(lines, key) {
  const line = lines.find(item => item.startsWith(`${key}:`) || item.startsWith(`${key};`));
  if (!line) return "";

  return line.slice(line.indexOf(":") + 1)
    .replace(/\\,/g, ",")
    .replace(/\\n/g, " ")
    .trim();
}

function parseEvents(icsText) {
  const unfolded = unfoldIcs(icsText);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);

  return blocks.map(block => {
    const lines = block.split(/\r?\n/);

    return {
      title: getIcsValue(lines, "SUMMARY") || "Untitled Event",
      description: getIcsValue(lines, "DESCRIPTION"),
      location: getIcsValue(lines, "LOCATION"),
      start: parseIcsDate(getIcsValue(lines, "DTSTART")),
      end: parseIcsDate(getIcsValue(lines, "DTEND"))
    };
  }).filter(event => event.start);
}

export async function onRequestGet({ env }) {
  const calendarUrl = env.GOOGLE_CALENDAR_ICS_URL;

  if (!calendarUrl) {
    return Response.json(
      { error: "Missing GOOGLE_CALENDAR_ICS_URL secret." },
      { status: 500 }
    );
  }

  const response = await fetch(calendarUrl);

  if (!response.ok) {
    return Response.json(
      { error: "Could not load Google Calendar." },
      { status: 500 }
    );
  }

  const icsText = await response.text();
  const events = parseEvents(icsText);

  return Response.json({ events });
}