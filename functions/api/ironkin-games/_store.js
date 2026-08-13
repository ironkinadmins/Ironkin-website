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
    resultsUnlocked: false,
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
  const raw = await env.DROPS_KV.get(GAMES_KEY);
  if (!raw) return defaultGames();
  try {
    const state = { ...defaultGames(), ...JSON.parse(raw) };

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
  await env.DROPS_KV.put(GAMES_KEY, JSON.stringify(state));
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

export function challengeFor(state, weekId, challengeId) {
  const week = (state.weeks || []).find(w => String(w.id) === String(weekId));
  if (!week) return { week:null, challenge:null };
  const challenge = (week.challenges || []).find(c => String(c.id) === String(challengeId));
  return { week, challenge: challenge || null };
}
