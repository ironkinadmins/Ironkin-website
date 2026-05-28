const EVENTS = [
  {
    id: "sotw-current",
    type: "sotw",
    title: "Skill of the Week",
    womCompetitionId: null,
    featured: false,
    active: false
  },

  {
    id: "botw-current",
    type: "botw",
    title: "Boss of the Week",
    womCompetitionId: null,
    featured: false,
    active: false
  },

  {
    id: "clan-goal-hueycoatl",
    type: "clan-goal",
    title: "Clan Goal",
    subtitle: "2,000 Hueycoatl KC",

    womCompetitionId: "PUT_YOUR_WOM_ID_HERE",

    featured: true,
    active: true,

    target: 2000
  }
];

export async function onRequestGet() {
const activeEvents = EVENTS;

  return Response.json({
    active: activeEvents.length > 0,
    events: activeEvents
  });
}