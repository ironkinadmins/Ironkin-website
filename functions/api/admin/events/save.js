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
    const sanitized = {
      ...event,
      id: "bounties",
      type: "bounties",
      label: "Bounties",
      womCompetitionId: null
    };
    delete sanitized.rewards;
    return sanitized;
  });

  // Keep one canonical bounty event so Admin and the public site cannot drift
  // onto different legacy bounty records.
  const bountyEvents = sanitizedEvents.filter(event => event?.id === "bounties" || event?.type === "bounties");
  const canonicalBounty = bountyEvents.find(event => event.id === "bounties") || bountyEvents[0] || null;
  const eventsToStore = sanitizedEvents.filter(event => event?.id !== "bounties" && event?.type !== "bounties");
  if (canonicalBounty) eventsToStore.push(canonicalBounty);

  await env.DROPS_KV.put(
    "events:active",
    JSON.stringify(eventsToStore)
  );

  return Response.json({
    success: true,
    events: eventsToStore
  });
}