const DEFAULT_EVENTS = [
  {
    id: "sotw-current",
    type: "sotw",
    label: "SOTW",
    title: "Skill of the Week",
    description: "Compete against fellow Ironkin members in the current Skill of the Week event.",
    womCompetitionId: null,
    featured: false,
    active: false,
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
    active: false,
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
    active: false,
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
    active: false,
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
  ,
  {
    id: "bounties",
    type: "bounties",
    label: "Bounties",
    title: "Clan Bounties",
    description: "Collect selected bounty items and earn Embers for every completed drop.",
    womCompetitionId: null,
    featured: false,
    active: false,
    dropsEnabled: true,
    target: null,
    startDate: null,
    endDate: null
  }];


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

function isCurrentEventActive(event, now = Date.now()) {
  if (!event || event.active !== true) return false;

  const start = event.startDate ? new Date(event.startDate).getTime() : null;
  const end = event.endDate ? new Date(event.endDate).getTime() : null;

  if (start && end && Number.isFinite(start) && Number.isFinite(end)) {
    return start <= now && end >= now;
  }

  // Bounties are intentionally manual and never use WOM.
  if (event?.type === "bounties" || event?.id === "bounties") return true;

  // Legacy/manual safety: keep other undated events only if they are explicitly active and linked to WOM.
  // This prevents old default placeholders from becoming the current event.
  return Boolean(event.womCompetitionId);
}

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("events:active");
  const rawEvents = saved ? JSON.parse(saved) : [];
  const normalized = normalizeBotwEvents(rawEvents);
  const clanGoalCandidates = normalized.filter(event => String(event?.type || "").includes("clan-goal") || event?.id === "clan-goal");
  const preferredClanGoal = clanGoalCandidates.find(event => event.id === "clan-goal") || clanGoalCandidates[0];
  let deduped = normalized.filter(event => !(String(event?.type || "").includes("clan-goal") || event?.id === "clan-goal"));
  if (preferredClanGoal) deduped.push({ ...preferredClanGoal, id: "clan-goal", label: "Clan Goal" });

  // Keep exactly one canonical bounty board. Older builds could leave an extra
  // bounty-shaped event behind, which made the public site disagree with the
  // checkbox shown in Admin.
  const bountyCandidates = deduped.filter(event => event?.id === "bounties" || event?.type === "bounties");
  const preferredBounties = bountyCandidates.find(event => event.id === "bounties") || bountyCandidates[0];
  deduped = deduped.filter(event => event?.id !== "bounties" && event?.type !== "bounties");
  if (preferredBounties) deduped.push({ ...preferredBounties, id: "bounties", type: "bounties", label: "Bounties", womCompetitionId: null });

  const byId = new Map(deduped.map(event => [event.id, event]));
  const defaultIds = new Set(DEFAULT_EVENTS.map(event => event.id));
  const events = [
    ...DEFAULT_EVENTS.map(defaultEvent => ({ ...defaultEvent, ...(byId.get(defaultEvent.id) || {}) })),
    ...deduped.filter(event => event?.id && !defaultIds.has(event.id))
  ].filter(event => event?.id !== "pvm-entry" && event?.type !== "pvm-entry" && event?.pluginOnly !== true).map(event => {
    if (event?.type !== "bounties" && event?.id !== "bounties") return event;
    const sanitized = { ...event };
    delete sanitized.rewards;
    return sanitized;
  });

  return Response.json({
    active: events.some(event => isCurrentEventActive(event)),
    events
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }
  });
}