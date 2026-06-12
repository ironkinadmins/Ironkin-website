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
    dropsEnabled: false,
    target: null,
    startDate: null,
    endDate: null
  },
  {
    id: "botw-elite",
    type: "botw",
    botwTier: "elite",
    label: "BOTW Elite",
    title: "Boss of the Week - Elite",
    description: "Battle for the top spot in the Elite Boss of the Week challenge.",
    womCompetitionId: null,
    featured: false,
    active: true,
    dropsEnabled: false,
    target: null,
    startDate: null,
    endDate: null
  },
  {
    id: "botw-standard",
    type: "botw",
    botwTier: "standard",
    label: "BOTW Standard",
    title: "Boss of the Week - Standard",
    description: "Battle for the top spot in the Standard Boss of the Week challenge.",
    womCompetitionId: null,
    featured: false,
    active: true,
    dropsEnabled: false,
    target: null,
    startDate: null,
    endDate: null
  },
  {
    id: "clan-goal",
    type: "clan-goal-boss",
    label: "Clan Goal",
    title: "Clan Goal",
    description: "Every gain brings Ironkin closer to the next clan milestone.",
    womCompetitionId: null,
    featured: false,
    active: true,
    dropsEnabled: true,
    target: null,
    startDate: null,
    endDate: null,
milestones: [
  { percent: 25, title: "Clan Mass" },
  { percent: 50, title: "Bond Giveaway" },
  { percent: 75, title: "Bonus Embers" },
  { percent: 100, title: "Bond Giveaway" }
]
  }
];


function normalizeBotwEvents(events) {
  const list = Array.isArray(events) ? [...events] : [];
  const hasElite = list.some(event => event.id === "botw-elite" || event.botwTier === "elite");
  const hasStandard = list.some(event => event.id === "botw-standard" || event.botwTier === "standard");
  const legacy = list.find(event => event.id === "botw-current" || (event.type === "botw" && !event.botwTier));

  if (hasElite && hasStandard) {
    return list.filter(event => event.id !== "botw-current");
  }

  const base = legacy || DEFAULT_EVENTS.find(event => event.id === "botw-elite") || {};
  const withoutLegacy = list.filter(event => event.id !== "botw-current" && !(event.type === "botw" && !event.botwTier));

  if (!hasElite) {
    withoutLegacy.splice(1, 0, {
      ...base,
      id: "botw-elite",
      type: "botw",
      botwTier: "elite",
      label: "BOTW Elite",
      title: base.title && base.title !== "Boss of the Week" ? base.title : "Boss of the Week - Elite",
      description: base.description || "Battle for the top spot in the Elite Boss of the Week challenge.",
      womCompetitionId: base.womCompetitionId || null,
      dropsEnabled: false
    });
  }

  if (!hasStandard) {
    withoutLegacy.splice(2, 0, {
      ...base,
      id: "botw-standard",
      type: "botw",
      botwTier: "standard",
      label: "BOTW Standard",
      title: "Boss of the Week - Standard",
      description: "Battle for the top spot in the Standard Boss of the Week challenge.",
      womCompetitionId: null,
      featured: false,
      dropsEnabled: false
    });
  }

  return withoutLegacy;
}

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("events:active");

  const events = normalizeBotwEvents(saved
    ? JSON.parse(saved)
    : DEFAULT_EVENTS);

  return Response.json({
    active: events.length > 0,
    events
  });
}