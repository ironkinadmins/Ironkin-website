const CUSTOM_CALENDAR_EVENTS_KEY = "calendar:custom-events";
const EVENT_ANNOUNCEMENT_CHANNEL_ID = "1368582354960121927";
const IRONKIN_ADMIN_TIME_ZONE = "America/Toronto";
const LOOKBACK_MS = 10 * 60 * 1000;

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

async function getJson(kv, key, fallback) {
  if (!kv) return fallback;
  const saved = await kv.get(key);
  if (!saved) return fallback;
  try { return JSON.parse(saved); } catch { return fallback; }
}

async function putJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

function getEventType(event) {
  return String(event?.eventType || event?.category || "normal").toLowerCase();
}

function isProgressionEvent(event) {
  const type = getEventType(event);
  return type === "sotw" || type === "botw" || type === "botw-elite" || type === "botw-standard" || type.startsWith("clan-goal");
}

function isMultiDayEvent(event) {
  const start = new Date(event?.start);
  const end = new Date(event?.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
}

function getLabelForType(type, botwTier = "") {
  if (type === "sotw") return "Skill of the Week";
  if (type === "botw" && botwTier === "elite") return "Boss of the Week - Elite";
  if (type === "botw" && botwTier === "standard") return "Boss of the Week - Standard";
  if (type === "botw" || type === "botw-elite" || type === "botw-standard") return "Boss of the Week";
  if (type === "clan-goal" || type === "clan-goal-skill" || type === "clan-goal-boss") return "Clan Goal";
  if (type === "mass") return "Clan Mass";
  if (type === "giveaway") return "Giveaway";
  return "Event";
}

function toDiscordTimestamp(value, style = "f") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "TBD";
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function formatDiscordDate(value) {
  return toDiscordTimestamp(value, "D");
}

function formatDiscordTimeRange(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const startText = Number.isFinite(start.getTime()) ? toDiscordTimestamp(startValue, "F") : "TBD";
  const endText = Number.isFinite(end.getTime()) ? toDiscordTimestamp(endValue, "t") : "TBD";
  return `${startText} - ${endText}`;
}

function isDue(triggerMs, nowMs) {
  return nowMs >= triggerMs && nowMs - triggerMs <= LOOKBACK_MS;
}

function getReminderPlan(event) {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const progression = isProgressionEvent(event);
  const multiDay = isMultiDayEvent(event);

  if (progression || multiDay) {
    return [
      { key: "start", triggerMs: start, label: "starts now", kind: "start" },
      { key: "ends24h", triggerMs: end - 24 * 60 * 60 * 1000, label: "ends in 24 hours", kind: "endSoon" }
    ];
  }

  return [
    { key: "start24h", triggerMs: start - 24 * 60 * 60 * 1000, label: "starts in 24 hours", kind: "startSoon" },
    { key: "start1h", triggerMs: start - 60 * 60 * 1000, label: "starts in 1 hour", kind: "startSoon" },
    { key: "start15m", triggerMs: start - 15 * 60 * 1000, label: "starts in 15 minutes", kind: "startSoon" }
  ];
}

function buildReminderPayload(env, event, reminder) {
  const siteUrl = String(env.SITE_URL || "https://ironkinclan.com").replace(/\/+$/, "");
  const type = getEventType(event);
  const title = event.title || getLabelForType(type, event.botwTier);
  const announcementId = cleanText(event.discordAnnouncementMessageId);
  const announcementChannel = cleanText(event.discordAnnouncementChannelId, EVENT_ANNOUNCEMENT_CHANNEL_ID);
  const announcementLink = announcementId && env.DISCORD_GUILD_ID
    ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${announcementChannel}/${announcementId}`
    : "";

  const isEndSoon = reminder.kind === "endSoon";
  const embedTitle = isEndSoon ? `⏳ ${title} ends in 24 hours!` : `⏰ ${title} ${reminder.label}!`;

  const fields = [
    { name: "Date", value: formatDiscordDate(event.start), inline: true },
    { name: "Time", value: formatDiscordTimeRange(event.start, event.end), inline: true },
    { name: "Calendar", value: `${siteUrl}/calendar`, inline: false }
  ];
  if (announcementLink) fields.push({ name: "Original Announcement", value: announcementLink, inline: false });

  return {
    content: "@everyone",
    allowed_mentions: { parse: ["everyone"] },
    embeds: [{
      title: embedTitle,
      color: isEndSoon ? 0xf59e0b : 0xff7a1a,
      description: isEndSoon
        ? "Make sure you finish up before the event ends."
        : (event.description || "This event is coming up soon."),
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: "Ironkin Calendar Reminder" }
    }]
  };
}

async function sendDiscordMessage(env, payload) {
  if (!env.DISCORD_BOT_TOKEN) return false;
  const response = await fetch(`https://discord.com/api/v10/channels/${EVENT_ANNOUNCEMENT_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.warn("Discord reminder failed", response.status, data);
    return false;
  }
  return true;
}

export async function processCalendarReminders(env) {
  if (!env.CALENDAR_KV) return { checked: 0, sent: 0, error: "Missing CALENDAR_KV binding." };
  const events = await getJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, []);
  const now = Date.now();
  let changed = false;
  let sent = 0;

 for (const event of events) {
  if (!event || String(event.status || "scheduled").toLowerCase() === "cancelled") continue;

  const flags = event.reminderFlags && typeof event.reminderFlags === "object"
    ? event.reminderFlags
    : {};

  for (const reminder of getReminderPlan(event)) {
    if (flags[reminder.key]) continue;

    console.log({
      title: event.title,
      reminder: reminder.key,
      triggerMs: reminder.triggerMs,
      trigger: reminder.triggerMs ? new Date(reminder.triggerMs).toISOString() : null,
      nowMs: now,
      now: new Date(now).toISOString(),
      differenceMinutes: reminder.triggerMs
        ? Math.round((now - reminder.triggerMs) / 60000)
        : null,
      due: reminder.triggerMs ? isDue(reminder.triggerMs, now) : false,
    });

    if (!isDue(reminder.triggerMs, now)) continue;

    const ok = await sendDiscordMessage(env, buildReminderPayload(env, event, reminder));

    if (ok) {
      flags[reminder.key] = new Date().toISOString();
      event.reminderFlags = flags;
      changed = true;
      sent += 1;
    }
  }
}

  if (changed) {
    events.sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));
    await putJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, events);
  }

  return { checked: events.length, sent };
}

function isAuthorized(request, env) {
  const expected = cleanText(env.CALENDAR_REMINDER_SECRET);
  if (!expected) return true;
  const url = new URL(request.url);
  const provided = cleanText(request.headers.get("X-Calendar-Reminder-Secret")) || cleanText(url.searchParams.get("secret"));
  return provided === expected;
}

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await processCalendarReminders(env);
  return Response.json({ success: true, ...result });
}

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await processCalendarReminders(env);
  return Response.json({ success: true, ...result });
}
