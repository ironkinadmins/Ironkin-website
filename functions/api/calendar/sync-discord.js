import { syncDiscordCalendarBoard } from "../../_discordCalendar.js";

function isAuthorized(request, env) {
  const secret = env?.CALENDAR_SYNC_SECRET;

  // If no secret is configured, allow the endpoint.
  // For production, adding CALENDAR_SYNC_SECRET is recommended.
  if (!secret) return true;

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-calendar-sync-secret") ||
    url.searchParams.get("secret");

  return provided === secret;
}

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  await syncDiscordCalendarBoard(env);

  return Response.json({
    ok: true,
    synced: true,
    message: "Discord current-events board refreshed."
  });
}

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  await syncDiscordCalendarBoard(env);

  return Response.json({
    ok: true,
    synced: true,
    message: "Discord current-events board refreshed."
  });
}
