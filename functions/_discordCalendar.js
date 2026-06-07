const DISCORD_API = "https://discord.com/api/v10";
const CUSTOM_CALENDAR_EVENTS_KEY = "calendar:custom-events";
const DISCORD_BOARD_MESSAGE_KEY = "discord:current-events-message-id";

function hasDiscordConfig(env) {
  return Boolean(
    env?.DISCORD_BOT_TOKEN &&
    env?.DISCORD_GUILD_ID &&
    env?.CURRENT_EVENTS_CHANNEL_ID
  );
}

function getSiteUrl(env) {
  return String(env?.SITE_URL || "https://ironkinclan.com").replace(/\/+$/, "");
}

function getHeaders(env) {
  return {
    "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "Ironkin-Website-Calendar"
  };
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function truncate(value, max) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toDiscordTimestamp(value, style = "f") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "TBD";
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function getEventUrl(env, event) {
  const siteUrl = getSiteUrl(env);
  if (event?.womCompetitionId) {
    return `${siteUrl}/event.html?id=${encodeURIComponent(event.id)}`;
  }
  return `${siteUrl}/calendar`;
}

function getEventKind(event) {
  const type = String(event?.eventType || event?.type || event?.category || "event");
  const labels = {
    normal: "Normal Event",
    mass: "Clan Mass",
    sotw: "Skill of the Week",
    botw: "Boss of the Week",
    "clan-goal": "Clan Goal",
    "clan-goal-skill": "Clan Goal",
    "clan-goal-boss": "Clan Goal"
  };
  return labels[type] || "Event";
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
  if (!kv) return;
  await kv.put(key, JSON.stringify(value));
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter(event => event && event.start && Number.isFinite(new Date(event.start).getTime()))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function buildScheduledEventPayload(env, event) {
  const start = new Date(event.start);
  const end = new Date(event.end || start.getTime() + 60 * 60 * 1000);
  const siteUrl = getSiteUrl(env);

  return {
    name: truncate(event.title || "Ironkin Event", 100),
    description: truncate(event.description || `${getEventKind(event)} from Ironkin.`, 1000),
    privacy_level: 2,
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
    entity_type: 3,
    entity_metadata: {
      location: getEventUrl(env, event) || `${siteUrl}/calendar`
    }
  };
}

async function createDiscordScheduledEvent(env, event) {
  if (!hasDiscordConfig(env) || !event?.start) return null;

  const response = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/scheduled-events`, {
    method: "POST",
    headers: getHeaders(env),
    body: JSON.stringify(buildScheduledEventPayload(env, event))
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.warn("Discord scheduled event create failed", response.status, data);
    return null;
  }

  return data;
}

async function updateDiscordScheduledEvent(env, event) {
  if (!hasDiscordConfig(env) || !event?.discordScheduledEventId || !event?.start) return null;

  const response = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/scheduled-events/${event.discordScheduledEventId}`, {
    method: "PATCH",
    headers: getHeaders(env),
    body: JSON.stringify(buildScheduledEventPayload(env, event))
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.warn("Discord scheduled event update failed", response.status, data);
    return null;
  }

  return data;
}

async function deleteDiscordScheduledEvent(env, discordScheduledEventId) {
  if (!hasDiscordConfig(env) || !discordScheduledEventId) return;

  const response = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/scheduled-events/${discordScheduledEventId}`, {
    method: "DELETE",
    headers: getHeaders(env)
  });

  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    console.warn("Discord scheduled event delete failed", response.status, data);
  }
}

async function saveDiscordScheduledEventId(env, eventId, discordScheduledEventId) {
  if (!env?.CALENDAR_KV || !eventId || !discordScheduledEventId) return;

  const events = await getJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, []);
  const index = events.findIndex(event => event.id === eventId);
  if (index < 0) return;

  events[index] = {
    ...events[index],
    discordScheduledEventId: String(discordScheduledEventId),
    discordSyncedAt: new Date().toISOString()
  };

  await putJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, events);
}

function buildCurrentEventsEmbed(env, events) {
  const siteUrl = getSiteUrl(env);
  const now = Date.now();
  const normalized = normalizeEvents(events);
  const visible = normalized.filter(event => String(event.status || "scheduled").toLowerCase() !== "cancelled");
  const active = visible.filter(event => {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end || event.start).getTime();
    return start <= now && end >= now;
  });
  const upcoming = visible.filter(event => new Date(event.start).getTime() > now).slice(0, 8);
  const cancelled = normalized
    .filter(event => String(event.status || "").toLowerCase() === "cancelled")
    .slice(0, 3);
  const featured = visible.find(event => event.featured) || active[0] || upcoming[0];

  const fields = [];

  if (featured) {
    fields.push({
      name: "🔥 Featured Event",
      value: `**[${truncate(featured.title, 80)}](${getEventUrl(env, featured)})**\n${getEventKind(featured)} · ${toDiscordTimestamp(featured.start, "R")}\nStarts ${toDiscordTimestamp(featured.start, "f")}`,
      inline: false
    });
  }

  fields.push({
    name: "🟢 Active Now",
    value: active.length
      ? active.slice(0, 5).map(event => `• **[${truncate(event.title, 70)}](${getEventUrl(env, event)})** · ends ${toDiscordTimestamp(event.end || event.start, "R")}`).join("\n")
      : "No active events right now.",
    inline: false
  });

  fields.push({
    name: "🗓 Upcoming",
    value: upcoming.length
      ? upcoming.map(event => `• ${toDiscordTimestamp(event.start, "D")} · **[${truncate(event.title, 70)}](${getEventUrl(env, event)})** · ${toDiscordTimestamp(event.start, "t")}`).join("\n")
      : "No upcoming events found.",
    inline: false
  });

  if (cancelled.length) {
    fields.push({
      name: "❌ Recently Cancelled",
      value: cancelled.map(event => `• ~~${truncate(event.title, 70)}~~`).join("\n"),
      inline: false
    });
  }

  return {
    title: "📅 Ironkin Current Events",
    description: `Updated automatically from [ironkinclan.com](${siteUrl}/calendar).`,
    color: 0xff7a1a,
    fields,
    footer: {
      text: "Website calendar is the source of truth."
    },
    timestamp: new Date().toISOString()
  };
}

async function upsertCurrentEventsMessage(env, events) {
  if (!hasDiscordConfig(env) || !env?.CALENDAR_KV) return;

  const payload = {
    embeds: [buildCurrentEventsEmbed(env, events)]
  };

  const existingMessageId = await env.CALENDAR_KV.get(DISCORD_BOARD_MESSAGE_KEY);

  if (existingMessageId) {
    const patch = await fetch(`${DISCORD_API}/channels/${env.CURRENT_EVENTS_CHANNEL_ID}/messages/${existingMessageId}`, {
      method: "PATCH",
      headers: getHeaders(env),
      body: JSON.stringify(payload)
    });

    if (patch.ok) return;
    if (patch.status !== 404) {
      const data = await patch.json().catch(() => ({}));
      console.warn("Discord current-events message update failed", patch.status, data);
      return;
    }
  }

  const post = await fetch(`${DISCORD_API}/channels/${env.CURRENT_EVENTS_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: getHeaders(env),
    body: JSON.stringify(payload)
  });

  const data = await post.json().catch(() => ({}));

  if (!post.ok) {
    console.warn("Discord current-events message create failed", post.status, data);
    return;
  }

  if (data.id) {
    await env.CALENDAR_KV.put(DISCORD_BOARD_MESSAGE_KEY, String(data.id));
  }
}

export async function syncDiscordCalendarBoard(env) {
  if (!hasDiscordConfig(env) || !env?.CALENDAR_KV) return;
  const events = await getJson(env.CALENDAR_KV, CUSTOM_CALENDAR_EVENTS_KEY, []);
  await upsertCurrentEventsMessage(env, events);
}

export async function mirrorCalendarEventCreate(env, event) {
  if (!hasDiscordConfig(env)) return;

  try {
    let updatedEvent = event;

    if (String(event?.status || "").toLowerCase() === "cancelled") {
      await mirrorCalendarEventCancel(env, event);
      return event;
    }

    if (event.discordScheduledEventId) {
      await updateDiscordScheduledEvent(env, event);
    } else {
      const scheduledEvent = await createDiscordScheduledEvent(env, event);
      if (scheduledEvent?.id) {
        updatedEvent = { ...event, discordScheduledEventId: String(scheduledEvent.id) };
        await saveDiscordScheduledEventId(env, event.id, scheduledEvent.id);
      }
    }

    await syncDiscordCalendarBoard(env);
    return updatedEvent;
  } catch (error) {
    console.warn("Discord calendar create/update mirror failed", error?.message || error);
    return event;
  }
}

export async function mirrorCalendarEventCancel(env, event) {
  if (!hasDiscordConfig(env)) return;

  try {
    await deleteDiscordScheduledEvent(env, event?.discordScheduledEventId);
    await syncDiscordCalendarBoard(env);
  } catch (error) {
    console.warn("Discord calendar cancel mirror failed", error?.message || error);
  }
}

export async function mirrorCalendarEventDelete(env, event) {
  if (!hasDiscordConfig(env)) return;

  try {
    await deleteDiscordScheduledEvent(env, event?.discordScheduledEventId);
    await syncDiscordCalendarBoard(env);
  } catch (error) {
    console.warn("Discord calendar delete mirror failed", error?.message || error);
  }
}
