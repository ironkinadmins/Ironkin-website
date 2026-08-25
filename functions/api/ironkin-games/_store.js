import { hybridKv } from "../../_hybridKv.js";
export const GAMES_KEY = "ironkin-games:v1";

export function defaultGames() {
  return {
    enabled: true,
    showOnHome: false,
    showOnEvents: false,
    title: "Ironkin Games",
    subtitle: "Forged Alone. Bound as Kin. Tested Together.",
    season: "2026",
    timezone: "America/Toronto",
    resultsUnlocked: false, // legacy compatibility
    publishedResultWeeks: [],
    gamesCompleted: false,
    completedAt: "",
    winnerTeamId: "",
    winnerTeamIds: [],
    winnerTeamName: "",
    finalStandings: [],
    finalProgression: [],
    signupOpen: false,
    registrationOpensAt: "",
    registrationClosesAt: "",
    gamesStartsAt: "",
    rosterLocked: false,
    autoBalanceSignups: false,
    balanceWeights: { ehp: 40, ehb: 40, totalLevel: 20 },
    signups: [],
    rules: [
      "Main Challenges require one continuous recording or private stream from reveal through completion.",
      "Challenge information may not be shared with teams that have not completed their attempt.",
      "No outside assistance unless the challenge rules explicitly allow it.",
      "Staff may apply penalties or disqualify a run when proof is incomplete or rules are broken."
    ],
    scoring: { main: [100,75,55,40], side: [30,20,15,10] },
    teams: [
      { id:"team-1", name:"Team 1", captainDiscordId:"", members:[], points:0 },
      { id:"team-2", name:"Team 2", captainDiscordId:"", members:[], points:0 },
      { id:"team-3", name:"Team 3", captainDiscordId:"", members:[], points:0 },
      { id:"team-4", name:"Team 4", captainDiscordId:"", members:[], points:0 }
    ],
    weeks: [],
    sessions: [],
    submissions: [],
    updatedAt: new Date().toISOString()
  };
}

export async function loadGames(env) {
  const raw = await hybridKv(env, "drops").get(GAMES_KEY);
  if (!raw) return defaultGames();
  try {
    const state = { ...defaultGames(), ...JSON.parse(raw) };
    state.publishedResultWeeks = Array.isArray(state.publishedResultWeeks) ? state.publishedResultWeeks.map(String) : [];

    // Migrate the original themed team slot IDs to neutral internal IDs.
    // Custom team names are preserved and are always the user-facing identity.
    const legacyIds = { ember:"team-1", ash:"team-2", forge:"team-3", kin:"team-4" };
    let changed = false;
    state.teams = (state.teams || []).map((team, index) => {
      const oldId = String(team.id || "");
      const nextId = legacyIds[oldId] || oldId || `team-${index + 1}`;
      if (nextId !== oldId || Object.prototype.hasOwnProperty.call(team, "colorLabel")) changed = true;
      const { colorLabel, ...rest } = team;
      return { ...rest, id: nextId, name: String(team.name || `Team ${index + 1}`) };
    });
    const remap = id => legacyIds[String(id || "")] || id;
    state.sessions = (state.sessions || []).map(item => {
      const teamId = remap(item.teamId);
      if (teamId !== item.teamId) changed = true;
      return { ...item, teamId };
    });
    state.submissions = (state.submissions || []).map(item => {
      const teamId = remap(item.teamId);
      if (teamId !== item.teamId) changed = true;
      return { ...item, teamId };
    });
    if (changed) await saveGames(env, state);
    return state;
  } catch {
    return defaultGames();
  }
}

export async function saveGames(env, state) {
  state.updatedAt = new Date().toISOString();
  await hybridKv(env, "drops").put(GAMES_KEY, JSON.stringify(state));
  return state;
}

export function memberTeam(state, session) {
  const id = String(session?.id || "");
  if (!id) return null;
  return (state.teams || []).find(team =>
    String(team.captainDiscordId || "") === id ||
    (team.members || []).some(member => String(member.discordId || member.id || "") === id)
  ) || null;
}

export function challengeMinimumParticipants(challenge) {
  const text = String(challenge?.participants || "").trim();
  const match = text.match(/\d+/);
  return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

export function teamMemberCount(team) {
  if (!team) return 0;
  const ids = new Set();
  for (const member of team.members || []) {
    const id = String(member?.discordId || member?.id || "").trim();
    if (id) ids.add(id);
  }
  const captainId = String(team.captainDiscordId || "").trim();
  if (captainId) ids.add(captainId);
  return ids.size || (team.members || []).length;
}


export function progressionScore(signups, signup, weights = {}) {
  const list = Array.isArray(signups) ? signups : [];
  const metricPercentile = (field, value) => {
    const values = list.map(x => Number(x?.[field]) || 0).sort((a,b) => a-b);
    if (values.length <= 1) return 0.5;
    let below = 0;
    let equal = 0;
    for (const item of values) {
      if (item < value) below += 1;
      else if (item === value) equal += 1;
    }
    return (below + Math.max(0, equal - 1) / 2) / (values.length - 1);
  };
  const wEhp = Math.max(0, Number(weights.ehp ?? 40));
  const wEhb = Math.max(0, Number(weights.ehb ?? 40));
  const wTotal = Math.max(0, Number(weights.totalLevel ?? 20));
  const totalWeight = wEhp + wEhb + wTotal || 1;
  const ehp = metricPercentile("ehp", Number(signup.ehp) || 0);
  const ehb = metricPercentile("ehb", Number(signup.ehb) || 0);
  const total = metricPercentile("totalLevel", Number(signup.totalLevel) || 0);
  return ((ehp * wEhp) + (ehb * wEhb) + (total * wTotal)) / totalWeight;
}

export function balanceSignups(state) {
  const signups = Array.isArray(state.signups) ? state.signups : [];
  const teams = Array.isArray(state.teams) ? state.teams : [];
  if (!teams.length) return state;

  const ranked = signups.map(item => ({
    ...item,
    balanceScore: progressionScore(signups, item, state.balanceWeights || {})
  })).sort((a,b) => {
    const diff = (Number(b.balanceScore)||0) - (Number(a.balanceScore)||0);
    if (Math.abs(diff) > 1e-9) return diff;
    return String(a.rsn || a.displayName || "").localeCompare(String(b.rsn || b.displayName || ""));
  });

  const buckets = teams.map(() => []);
  const n = teams.length;
  ranked.forEach((player, index) => {
    const round = Math.floor(index / n);
    const offset = index % n;
    const teamIndex = round % 2 === 0 ? offset : (n - 1 - offset);
    buckets[teamIndex].push(player);
  });

  state.signups = ranked;
  state.teams = teams.map((team, index) => ({
    ...team,
    members: buckets[index].map(player => ({
      discordId: String(player.discordId || ""),
      name: String(player.displayName || player.discordName || player.rsn || "Member"),
      rsn: String(player.rsn || ""),
      ehp: Number(player.ehp) || 0,
      ehb: Number(player.ehb) || 0,
      totalLevel: Number(player.totalLevel) || 0,
      timezone: String(player.timezone || ""),
      balanceScore: Number(player.balanceScore) || 0
    }))
  }));
  return state;
}

export function challengeFor(state, weekId, challengeId) {
  const week = (state.weeks || []).find(w => String(w.id) === String(weekId));
  if (!week) return { week:null, challenge:null };
  const challenge = (week.challenges || []).find(c => String(c.id) === String(challengeId));
  return { week, challenge: challenge || null };
}
