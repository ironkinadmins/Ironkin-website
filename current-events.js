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
    title: "Clan Goal",
    description: "Every kill brings Ironkin closer to the next clan milestone.",
    womCompetitionId: "138731",
    featured: true,
    active: true,
    dropsEnabled: true,
    target: 300,
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

async function fetchWomCompetitionDetails(competitionId) {
  if (!competitionId || competitionId === "PUT_YOUR_WOM_ID_HERE") {
    return null;
  }

  const response = await fetch(
    `https://api.wiseoldman.net/v2/competitions/${competitionId}`
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function hydrateEventFromWom(event) {
  const details = await fetchWomCompetitionDetails(event.womCompetitionId)
    .catch(() => null);

  if (!details) {
    return event;
  }

  return {
    ...event,
    title: details.title || event.title,
    metric: details.metric || event.metric || null,
    startDate: details.startsAt || event.startDate || null,
    endDate: details.endsAt || event.endDate || null,
    wom: {
      id: details.id,
      title: details.title || null,
      metric: details.metric || null,
      startsAt: details.startsAt || null,
      endsAt: details.endsAt || null
    }
  };
}

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("events:active");

  const storedEvents = saved
    ? JSON.parse(saved)
    : DEFAULT_EVENTS;

  const events = await Promise.all(
    storedEvents.map(event => hydrateEventFromWom(event))
  );

  return Response.json({
    active: events.length > 0,
    events
  });
}
