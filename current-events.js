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
    endDate: null,
    rewards: {
      placement: [
        { label: "🥇 1st Place", reward: "50 Embers + SOTW Rank" },
        { label: "🥈 2nd Place", reward: "40 Embers" },
        { label: "🥉 3rd Place", reward: "35 Embers" }
      ],
      participation: [
        { requirement: "1250K XP", reward: "30 Embers" },
        { requirement: "750K XP", reward: "20 Embers" },
        { requirement: "300K XP", reward: "10 Embers" }
      ]
    }
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
    endDate: null,
    rewards: {
      placement: [
        { label: "🥇 1st Place", reward: "75 Embers + BOTW Rank" },
        { label: "🥈 2nd Place", reward: "50 Embers" },
        { label: "🥉 3rd Place", reward: "35 Embers" }
      ],
      participation: [
        { requirement: "High Tier", reward: "Participation Embers vary by boss" },
        { requirement: "Low Tier", reward: "Participation Embers vary by boss" }
      ]
    }
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
    endDate: "2026-06-03",
    milestones: [
      { percent: 25, title: "Clan Mass" },
      { percent: 50, title: "Bond Giveaway" },
      { percent: 75, title: "Bonus Embers" },
      { percent: 100, title: "Bond Giveaway" }
    ],
    rewards: {
      placement: [
        { label: "25%", reward: "Clan Mass" },
        { label: "50%", reward: "Bond Giveaway" },
        { label: "75%", reward: "Bonus Embers" },
        { label: "100%", reward: "Bond Giveaway" }
      ],
      participation: []
    }
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
