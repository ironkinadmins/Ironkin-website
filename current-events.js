const EVENTS = [
  {
    id: "sotw-current",
    type: "sotw",
    label: "Skill of the Week",
    title: "Skill of the Week",
    description: "Compete with fellow Ironkin members in the current weekly skilling competition.",
    womCompetitionId: null,
    goal: null,
    featured: false,
    active: true,
    dropsEnabled: false
  },

  {
    id: "botw-current",
    type: "botw",
    label: "Boss of the Week",
    title: "Boss of the Week",
    description: "Face the selected boss and climb the Ironkin leaderboard.",
    womCompetitionId: null,
    goal: null,
    featured: false,
    active: true,
    dropsEnabled: false
  },

  {
    id: "clan-goal-hueycoatl",
    type: "clan-goal-boss",
    label: "Clan Goal",
    title: "Clan Goal - Hueycoatl",
    description: "The Forge calls for battle. Every kill brings Ironkin closer to the next clan milestone.",
    womCompetitionId: null,
    goal: 2000,
    featured: true,
    active: true,
    dropsEnabled: true
  }
];

export async function onRequestGet() {
  const activeEvents = EVENTS.filter(event => event.active);

  return Response.json({
    active: activeEvents.length > 0,
    events: activeEvents
  });
}
