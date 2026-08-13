export const GAMES_KEY = "ironkin-games:v1";

export function defaultGames() {
  return {
    enabled: true,
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
      { id:"ember", name:"Team Ember", colorLabel:"Ember", captainDiscordId:"", members:[], points:0 },
      { id:"ash", name:"Team Ash", colorLabel:"Ash", captainDiscordId:"", members:[], points:0 },
      { id:"forge", name:"Team Forge", colorLabel:"Forge", captainDiscordId:"", members:[], points:0 },
      { id:"kin", name:"Team Kin", colorLabel:"Kin", captainDiscordId:"", members:[], points:0 }
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
  try { return { ...defaultGames(), ...JSON.parse(raw) }; } catch { return defaultGames(); }
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
