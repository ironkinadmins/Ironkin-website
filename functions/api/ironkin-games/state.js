import { getSession, isStaffSession } from "../_auth.js";
import { loadGames, memberTeam, challengeMinimumParticipants, teamMemberCount } from "./_store.js";

function safeChallenge(challenge, reveal) {
  const base = {
    id: challenge.id, name: challenge.name, kind: challenge.kind || "main", status: challenge.status || "upcoming",
    durationMinutes: Number(challenge.durationMinutes || 0), opensAt: challenge.opensAt || "", closesAt: challenge.closesAt || "",
    participants: challenge.participants || "", minimumParticipants: challengeMinimumParticipants(challenge), proofRequired: challenge.proofRequired !== false,
    summary: challenge.summary || "", results: challenge.results || []
  };
  if (reveal) Object.assign(base, { objective:challenge.objective || "", rules:challenge.rules || [], instructions:challenge.instructions || "" });
  return base;
}

export async function onRequestGet({ request, env }) {
  const state = await loadGames(env);
  const session = await getSession(request, env);
  const staff = isStaffSession(session);
  const team = memberTeam(state, session);
  const allSessions = state.sessions || [];
  // Staff may review all sessions, but the public challenge reveal must still
  // behave like a normal player view. Only this viewer's own team sessions can
  // unlock a hidden Main Challenge on the public Ironkin Games page.
  const sessions = allSessions.filter(s => staff || (team && s.teamId === team.id));
  const teamSessions = team ? allSessions.filter(s => s.teamId === team.id) : [];
  const started = new Set(teamSessions.filter(s => s.startedAt).map(s => `${s.weekId}:${s.challengeId}`));
  const now = Date.now();

  const weeks = (state.weeks || []).map(week => ({
    id: week.id, name: week.name, startDate:week.startDate || "", endDate:week.endDate || "",
    challenges: (week.challenges || []).map(challenge => {
      const publicReveal = challenge.kind === "side" || challenge.status === "complete" || state.resultsUnlocked;
      const teamReveal = team && started.has(`${week.id}:${challenge.id}`);
      const reveal = publicReveal || teamReveal;
      const item = safeChallenge(challenge, reveal);
      if (!reveal && challenge.kind === "main") item.name = challenge.publicName || "Mystery Main Challenge";
      const own = sessions.find(s => s.weekId === week.id && s.challengeId === challenge.id && (!team || s.teamId === team.id));
      if (own) item.session = own;
      if (challenge.opensAt) item.isOpen = now >= new Date(challenge.opensAt).getTime() && (!challenge.closesAt || now <= new Date(challenge.closesAt).getTime());
      return item;
    })
  }));

  return Response.json({
    enabled:state.enabled, showOnHome:Boolean(state.showOnHome), showOnEvents:Boolean(state.showOnEvents), signupOpen:Boolean(state.signupOpen), rosterLocked:Boolean(state.rosterLocked), title:state.title, subtitle:state.subtitle, season:state.season, timezone:state.timezone,
    rules:state.rules || [], scoring:state.scoring, teams:(state.teams || []).map(t => ({
      id:t.id, name:t.name, points:t.points || 0,
      members:(t.members || []).map(m => ({ name:m.name || m.rsn || "Member", rsn:m.rsn || "", ehp:m.ehp, ehb:m.ehb, totalLevel:m.totalLevel }))
    })), weeks,
    myTeam: team ? { id:team.id, name:team.name, captainDiscordId:team.captainDiscordId, memberCount:teamMemberCount(team) } : null,
    signedIn:Boolean(session), isStaff:staff, resultsUnlocked:Boolean(state.resultsUnlocked),
    submissions: (state.submissions || []).filter(s => staff || state.resultsUnlocked || (team && s.teamId === team.id)).map(s => ({...s, proofUrl: staff || (team && s.teamId === team.id) ? s.proofUrl : ""}))
  }, { headers:{"Cache-Control":"no-store"} });
}
