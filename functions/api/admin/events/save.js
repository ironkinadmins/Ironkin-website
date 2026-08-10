import { getSession, isStaffSession } from "../../_auth.js";
import { eventTypeSlug } from "../../_pluginEvents.js";
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


  const previousRaw = await env.DROPS_KV.get("events:active");
  let previousEvents = [];
  try { previousEvents = previousRaw ? JSON.parse(previousRaw) : []; } catch { previousEvents = []; }
  const previousById = new Map((Array.isArray(previousEvents) ? previousEvents : []).map(event => [event?.id, event]));

  function ensurePluginEventId(event) {
    if (event?.id === "pvm-entry" || event?.type === "pvm-entry") {
      return { ...event, id: "pvm-entry", type: "pvm-entry", pluginEventId: "pvm-entry", pluginOnly: true, active: true, dropsEnabled: true, featured: false, womCompetitionId: null };
    }
    if (!event?.active) return event;
    const previous = previousById.get(event.id);
    if (previous?.active && previous?.pluginEventId) return { ...event, pluginEventId: previous.pluginEventId };
    if (event.pluginEventId) return event;
    const type = eventTypeSlug(event);
    const wom = String(event.womCompetitionId || "").trim();
    const suffix = wom || `${new Date().toISOString().slice(0,10).replace(/-/g, "")}-${crypto.randomUUID().slice(0,8)}`;
    return { ...event, pluginEventId: `${type}-${suffix}` };
  }

  const sanitizedEvents = events.map(event => {
    if (event?.id === "pvm-entry" || event?.type === "pvm-entry") {
      const sanitized = {
        ...event,
        id: "pvm-entry",
        type: "pvm-entry",
        label: "PvM Entry",
        title: event?.title || "PvM Entry",
        womCompetitionId: null,
        featured: false,
        active: true,
        dropsEnabled: true,
        pluginEventId: "pvm-entry",
        pluginOnly: true
      };
      delete sanitized.rewards;
      return sanitized;
    }
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
  const eventsWithPluginIds = sanitizedEvents.map(ensurePluginEventId);

  const bountyEvents = eventsWithPluginIds.filter(event => event?.id === "bounties" || event?.type === "bounties");
  const canonicalBounty = bountyEvents.find(event => event.id === "bounties") || bountyEvents[0] || null;
  const eventsToStore = eventsWithPluginIds.filter(event => event?.id !== "bounties" && event?.type !== "bounties");
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