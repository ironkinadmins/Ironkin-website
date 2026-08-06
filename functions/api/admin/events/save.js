import { getSession, isStaffSession } from "../../_auth.js";
export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const events = body.events;

  if (!Array.isArray(events)) {
    return Response.json(
      { error: "Events must be an array." },
      { status: 400 }
    );
  }

  const sanitizedEvents = events.map(event => {
    if (event?.type !== "bounties" && event?.id !== "bounties") return event;
    const sanitized = { ...event };
    delete sanitized.rewards;
    return sanitized;
  });

  await env.DROPS_KV.put(
    "events:active",
    JSON.stringify(sanitizedEvents)
  );

  return Response.json({
    success: true,
    events: sanitizedEvents
  });
}