const EVENTS = [
  {
    id: "sotw-current",
    type: "sotw",

    label: "SOTW",

    title: "Skill of the Week",

    description:
      "Compete against fellow Ironkin members in the current Skill of the Week event.",

    womCompetitionId: null,

    featured: false,
    active: true,

    dropsEnabled: true,

    startDate: null,
    endDate: null
  },

  {
    id: "botw-current",
    type: "botw",

    label: "BOTW",

    title: "Boss of the Week",

    description:
      "Battle for the top spot in the current Boss of the Week challenge.",

    womCompetitionId: null,

    featured: false,
    active: true,

    dropsEnabled: true,

    startDate: null,
    endDate: null
  },

  {
    id: "clan-goal-hueycoatl",
    type: "clan-goal-boss",

    label: "Clan Goal",

    title: "2,000 Hueycoatl KC",

    description:
      "Every kill brings Ironkin closer to the next clan milestone.",

    womCompetitionId: "PUT_YOUR_WOM_ID_HERE",

    featured: true,
    active: true,

    dropsEnabled: true,

    target: 2000,

    startDate: "2026-05-26",
    endDate: "2026-06-09"
  }
];

export async function onRequestGet() {
  return Response.json({
    active: EVENTS.length > 0,
    events: EVENTS
  });
}