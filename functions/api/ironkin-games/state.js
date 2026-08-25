import { getSession, isStaffSession } from "../_auth.js";
import { loadGames, memberTeam, challengeMinimumParticipants, teamMemberCount } from "./_store.js";


function submissionReviewStatus(related) {
  const list = [...(related || [])];
  const reviewed = list.filter(x => ["approved", "rejected"].includes(String(x.status || "").toLowerCase()));
  if (reviewed.length) {
    reviewed.sort((a,b) => new Date(b.reviewedAt || b.submittedAt || b.createdAt || 0).getTime() - new Date(a.reviewedAt || a.submittedAt || a.createdAt || 0).getTime());
    return String(reviewed[0].status || "").toLowerCase();
  }
  if (list.length) return "submitted";
  return "";
}

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
  const registrationOpens = state.registrationOpensAt ? new Date(state.registrationOpensAt).getTime() : null;
  const registrationCloses = state.registrationClosesAt ? new Date(state.registrationClosesAt).getTime() : null;
  const registrationWithinWindow = (!Number.isFinite(registrationOpens) || now >= registrationOpens) && (!Number.isFinite(registrationCloses) || now <= registrationCloses);
  const effectiveSignupOpen = Boolean(state.signupOpen) && !state.rosterLocked && registrationWithinWindow;
  const publishedWeeks = new Set((state.publishedResultWeeks || []).map(String));
  // Backward compatibility for an older all-results toggle. If it was previously
  // enabled, treat every configured week as published until the new per-week control is used.
  if (state.resultsUnlocked && !publishedWeeks.size) {
    for (const w of state.weeks || []) publishedWeeks.add(String(w.id));
  }
  const publicPoints = new Map((state.teams || []).map(t => [String(t.id), 0]));
  if (state.gamesCompleted && Array.isArray(state.finalStandings) && state.finalStandings.length) {
    for (const row of state.finalStandings) publicPoints.set(String(row.teamId), Number(row.points) || 0);
  } else {
    for (const sub of state.submissions || []) {
      if (String(sub.status || '').toLowerCase() !== 'approved') continue;
      if (!publishedWeeks.has(String(sub.weekId))) continue;
      publicPoints.set(String(sub.teamId), (publicPoints.get(String(sub.teamId)) || 0) + (Number(sub.points) || 0));
    }
  }

  const weeks = (state.weeks || []).map(week => ({
    id: week.id, name: week.name, startDate:week.startDate || "", endDate:week.endDate || "",
    challenges: (week.challenges || []).map(challenge => {
      const publicReveal = challenge.kind === "side" || challenge.status === "complete" || publishedWeeks.has(String(week.id));
      const teamReveal = team && started.has(`${week.id}:${challenge.id}`);
      const reveal = publicReveal || teamReveal;
      const item = safeChallenge(challenge, reveal);
      item.revealed = Boolean(reveal);
      if (!reveal && challenge.kind === "main") item.name = challenge.publicName || "Mystery Main Challenge";
      const own = sessions.find(s => s.weekId === week.id && s.challengeId === challenge.id && (!team || s.teamId === team.id));
      if (own) item.session = own;
      if (challenge.opensAt) item.isOpen = now >= new Date(challenge.opensAt).getTime() && (!challenge.closesAt || now <= new Date(challenge.closesAt).getTime());
      return item;
    })
  }));

  return Response.json({
    enabled:state.enabled, showOnHome:Boolean(state.showOnHome), showOnEvents:Boolean(state.showOnEvents), signupOpen:effectiveSignupOpen, signupEnabled:Boolean(state.signupOpen), registrationOpensAt:state.registrationOpensAt || "", registrationClosesAt:state.registrationClosesAt || "", rosterLocked:Boolean(state.rosterLocked), title:state.title, subtitle:state.subtitle, season:state.season, timezone:state.timezone,
    rules:state.rules || [], scoring:state.scoring, teams:(state.teams || []).map(t => ({
      id:t.id, name:t.name, points:publicPoints.get(String(t.id)) || 0,
      members:(t.members || []).map(m => ({ name:m.name || m.rsn || "Member", rsn:m.rsn || "", ehp:m.ehp, ehb:m.ehb, totalLevel:m.totalLevel }))
    })), weeks,
    myTeam: team ? { id:team.id, name:team.name, captainDiscordId:team.captainDiscordId, memberCount:teamMemberCount(team) } : null,
    // Public master schedule: expose only safe scheduling metadata for all teams.
    // Never expose challenge names, objectives, rules, scores, proof, or other reveal-sensitive data here.
    scheduleSessions: allSessions.filter(s => s.scheduledAt).map(s => {
      const related = (state.submissions || []).filter(x => x.weekId === s.weekId && x.challengeId === s.challengeId && x.teamId === s.teamId);
      const submissionStatus = String(s.reviewStatus || submissionReviewStatus(related) || "").toLowerCase();
      return {
        weekId:s.weekId, challengeId:s.challengeId, teamId:s.teamId, scheduledAt:s.scheduledAt,
        startedAt:s.startedAt || "", endsAt:s.endsAt || "", status:s.status || "scheduled",
        submissionStatus
      };
    }),
    signedIn:Boolean(session), isStaff:staff,
    publishedResultWeeks:[...publishedWeeks],
    hasPublishedResults:publishedWeeks.size > 0,
    gamesCompleted:Boolean(state.gamesCompleted),
    completedAt:state.completedAt || "",
    winnerTeamId:state.winnerTeamId || "",
    winnerTeamIds:Array.isArray(state.winnerTeamIds) ? state.winnerTeamIds : (state.winnerTeamId ? [state.winnerTeamId] : []),
    winnerTeamName:state.winnerTeamName || "",
    finalStandings:Array.isArray(state.finalStandings) ? state.finalStandings : [],
    finalProgression:Array.isArray(state.finalProgression) ? state.finalProgression : [],
    canEndGames:staff && !state.gamesCompleted && (state.weeks || []).length > 0 && (state.weeks || []).every(w => publishedWeeks.has(String(w.id))) && !(state.submissions || []).some(s => !["approved","rejected"].includes(String(s.status || "").toLowerCase())),
    resultsUnlocked:false, // legacy field; public UI now publishes results per week
    submissions: (state.submissions || []).filter(s => staff || publishedWeeks.has(String(s.weekId)) || (team && s.teamId === team.id)).map(s => ({...s, proofUrl: staff || (team && s.teamId === team.id) ? s.proofUrl : ""}))
  }, { headers:{"Cache-Control":"no-store"} });
}
