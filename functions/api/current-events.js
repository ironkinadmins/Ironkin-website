const EVENTS = [
  {
    id: "sotw-current",
    type: "sotw",
    title: "Skill of the Week",
    womCompetitionId: "138731",
    featured: true,
    active: true
  },

  {
    id: "botw-current",
    type: "botw",
    title: "Boss of the Week",
    womCompetitionId: "PUT_BOTW_WOM_ID_HERE",
    featured: false,
    active: true
  }

  // Add clan goals later here
];

export async function onRequestGet() {
  const activeEvents = EVENTS.filter(event => event.active);

  return Response.json({
    active: activeEvents.length > 0,
    events: activeEvents
  });
}