const DEFAULT_SITE_URL = "https://ironkinclan.com";

function getSiteUrl(env) {
  return String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

async function runCalendarReminders(env) {
  const siteUrl = getSiteUrl(env);
  const url = new URL(`${siteUrl}/api/calendar/reminders`);

  const headers = new Headers();
  if (env.CALENDAR_REMINDER_SECRET) {
    headers.set("X-Calendar-Reminder-Secret", env.CALENDAR_REMINDER_SECRET);
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.warn("Calendar reminder run failed", response.status, data);
    throw new Error(`Calendar reminder run failed with status ${response.status}`);
  }

  console.log("Calendar reminder run completed", data);
  return data;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCalendarReminders(env));
  },

  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const data = await runCalendarReminders(env);
    return Response.json({ success: true, worker: "calendar-reminder-cron", result: data });
  }
};
