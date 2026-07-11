import { getSession, isStaffSession } from "../_auth.js";
import { rosterTeamForSession } from "./_teams.js";

const SIGNUPS_KEY = "bingo:signups";

function displayNameForSession(session, signup = null) {
  return String(
    session?.nick ||
    signup?.displayName ||
    session?.global_name ||
    session?.username ||
    "Bingo member"
  ).trim().slice(0, 100);
}

async function signupForSession(session, env) {
  if (!session?.id) return null;
  const raw = await env.DROPS_KV.get(SIGNUPS_KEY);
  if (!raw) return null;
  try {
    const signups = JSON.parse(raw);
    if (!Array.isArray(signups)) return null;
    return signups.find(item => String(item?.discordId || "") === String(session.id)) || null;
  } catch {
    return null;
  }
}

function assignedTeamForSession(session, signup) {
  // The saved signup assignment is authoritative because staff can move members
  // between teams without changing their Discord nickname/RSN.
  if (["team1", "team2"].includes(signup?.team)) return signup.team;
  return rosterTeamForSession(session, signup);
}

export async function getAuthorizedBingoUser(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return { ok: false, status: 401, error: "Please sign in with Discord first." };
  }

  if (session.inGuild !== true) {
    return { ok: false, status: 403, error: "You must be in the Ironkin Discord to access Bingo." };
  }

  const signup = await signupForSession(session, env);
  const isStaff = isStaffSession(session);
  const team = assignedTeamForSession(session, signup);

  if (!team && !isStaff) {
    return { ok: false, status: 403, error: "You are not assigned to a Bingo team." };
  }

  return {
    ok: true,
    session,
    signup,
    team,
    isStaff,
    displayName: displayNameForSession(session, signup)
  };
}

export async function requireBingoTeam(request, env, requiredTeam = null) {
  const user = await getAuthorizedBingoUser(request, env);
  if (!user.ok) return user;

  // Staff can test either private board, but regular members remain locked to
  // the exact team stored on their signup/roster assignment.
  if (user.isStaff && requiredTeam && ["team1", "team2"].includes(requiredTeam)) {
    return { ...user, team: requiredTeam };
  }

  if (requiredTeam && user.team !== requiredTeam) {
    return { ok: false, status: 403, error: "You are not assigned to this Bingo team." };
  }
  return user;
}
