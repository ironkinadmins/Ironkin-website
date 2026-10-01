import { womFetch } from "../_wom.js";
export async function onRequestGet({ env }) {
  const COMPETITION_ID = "138731";

  const response = await womFetch(env, `/competitions/${COMPETITION_ID}`);

  const comp = await response.json();

  if (!response.ok) {
    return Response.json(
      { active: false, error: "Could not load WOM competition", details: comp },
      { status: response.status }
    );
  }

  const title = comp.title || "";

  let eventType = "competition";
  if (/sotw/i.test(title)) eventType = "sotw";
  if (/botw/i.test(title)) eventType = "botw";
  if (/clan goal|clan xp|xp push/i.test(title)) eventType = "clan_goal";

  return Response.json({
    active: true,
    id: comp.id,
    title: comp.title,
    type: eventType,
    metric: comp.metric,
    startsAt: comp.startsAt,
    endsAt: comp.endsAt,
    participantCount: comp.participations?.length || 0
  });
}