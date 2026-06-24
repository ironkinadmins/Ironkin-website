import { getSession, isStaffSession } from "./functions/api/_auth.js";
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

  await env.DROPS_KV.put(
    "events:active",
    JSON.stringify(events)
  );

  return Response.json({
    success: true,
    events
  });
}