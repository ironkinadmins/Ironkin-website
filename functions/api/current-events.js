const DEFAULT_EVENTS = [
  {
    id: "sotw-current",
    type: "sotw",
    label: "SOTW",
    title: "Skill of the Week",
    description: "Compete against fellow Ironkin members in the current Skill of the Week event.",
    womCompetitionId: null,
    featured: false,
    active: true,
    dropsEnabled: true,
    target: null,
    startDate: null,
    endDate: null
  },
  {
    id: "botw-current",
    type: "botw",
    label: "BOTW",
    title: "Boss of the Week",
    description: "Battle for the top spot in the current Boss of the Week challenge.",
    womCompetitionId: null,
    featured: false,
    active: true,
    dropsEnabled: true,
    target: null,
    startDate: null,
    endDate: null
  },
  {
    id: "clan-goal-hueycoatl",
    type: "clan-goal-boss",
    label: "Clan Goal",
    title: "Clan Goal - Hueycoatl",
    description: "Every kill brings Ironkin closer to the next clan milestone.",
    womCompetitionId: "138731",
    featured: true,
    active: true,
    dropsEnabled: true,
    target: 300,
    startDate: "2026-06-01",
    endDate: "2026-06-03"
  }
];

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("events:active");

  const events = saved
    ? JSON.parse(saved)
    : DEFAULT_EVENTS;

  return Response.json({
    active: events.length > 0,
    events
  });
}