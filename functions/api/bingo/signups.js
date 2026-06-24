import { getSession, isStaffSession } from "../_auth.js";
const SIGNUPS_KEY = "bingo:signups";
function getDisplayName(session) {
  return (
    session?.nick ||
    session?.global_name ||
    session?.username ||
    "Unknown member"
  );
}

async function getSignups(env) {
  const raw = await env.DROPS_KV.get(SIGNUPS_KEY);
  const signups = raw ? JSON.parse(raw) : [];
  return Array.isArray(signups) ? signups : [];
}

async function saveSignups(env, signups) {
  await env.DROPS_KV.put(SIGNUPS_KEY, JSON.stringify(signups));
}

function hasRegistrationDeadlinePassed(registrationEndsAt) {
  if (!registrationEndsAt) return false;
  const deadline = new Date(registrationEndsAt);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() <= Date.now();
}

async function getBingoSettings(env) {
  const raw = await env.DROPS_KV.get("bingo:settings");
  const parsed = raw ? JSON.parse(raw) : {};
  const registrationEndsAt = typeof parsed.registrationEndsAt === "string" ? parsed.registrationEndsAt : "";

  let enableViewEvent =
    typeof parsed.enableViewEvent === "boolean"
      ? parsed.enableViewEvent
      : false;
  let signupOpen =
    typeof parsed.signupOpen === "boolean"
      ? parsed.signupOpen
      : parsed.active === true && enableViewEvent !== true;

  if (parsed.active === true && signupOpen === true && hasRegistrationDeadlinePassed(registrationEndsAt)) {
    signupOpen = false;
    enableViewEvent = true;
  }

  return {
    title: parsed.title || "Battleship Bingo",
    description: parsed.description || "Build a board, split into teams, claim tiles, and track summer progress.",
    active: parsed.active === true,
    signupOpen,
    enableViewEvent,
    registrationEndsAt,
    teamOneName: parsed.teamOneName || "Team 1",
    teamTwoName: parsed.teamTwoName || "Team 2"
  };
}

function chooseBalancedTeam(signups) {
  const teamOneCount = signups.filter(item => item.team === "team1").length;
  const teamTwoCount = signups.filter(item => item.team === "team2").length;

  if (teamOneCount < teamTwoCount) return "team1";
  if (teamTwoCount < teamOneCount) return "team2";

  return Math.random() < 0.5 ? "team1" : "team2";
}

function publicSignup(signup) {
  return {
    discordId: signup.discordId,
    displayName: signup.displayName,
    username: signup.username,
    avatar: signup.avatar,
    team: signup.team,
    signedUpAt: signup.signedUpAt
  };
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  const [signups, settings] = await Promise.all([
    getSignups(env),
    getBingoSettings(env)
  ]);

  signups.sort((a, b) =>
    String(a.displayName || "").localeCompare(String(b.displayName || ""))
  );

  return Response.json({
    signedIn: Boolean(session),
    inGuild: session?.inGuild === true,
    isStaff: isStaffSession(session),
    currentUser: session ? {
      discordId: session.id,
      displayName: getDisplayName(session),
      username: session.username,
      avatar: session.avatar
    } : null,
    currentSignup: session
      ? signups.find(item => item.discordId === session.id) || null
      : null,
    signups: signups.map(publicSignup),
    settings
  });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);

  if (!session) {
    return Response.json(
      { error: "Please sign in with Discord first." },
      { status: 401 }
    );
  }

  if (session.inGuild !== true) {
    return Response.json(
      { error: "You must be in the Ironkin Discord to sign up." },
      { status: 403 }
    );
  }

  const [signups, settings] = await Promise.all([
    getSignups(env),
    getBingoSettings(env)
  ]);
  const existing = signups.find(item => item.discordId === session.id);

  if (existing) {
    existing.displayName = getDisplayName(session);
    existing.username = session.username;
    existing.avatar = session.avatar;

    await saveSignups(env, signups);

    return Response.json({
      success: true,
      alreadySignedUp: true,
      signup: publicSignup(existing),
      signups: signups.map(publicSignup)
    });
  }

  if (settings.active !== true || settings.signupOpen !== true) {
    return Response.json(
      { error: "Bingo registration is currently closed." },
      { status: 403 }
    );
  }

  const signup = {
    eventId: "battleship-bingo",
    discordId: session.id,
    username: session.username,
    displayName: getDisplayName(session),
    avatar: session.avatar,
    team: chooseBalancedTeam(signups),
    signedUpAt: new Date().toISOString()
  };

  signups.push(signup);
  await saveSignups(env, signups);

  return Response.json({
    success: true,
    signup: publicSignup(signup),
    signups: signups.map(publicSignup)
  });
}

export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);

  if (!session) {
    return Response.json(
      { error: "Please sign in with Discord first." },
      { status: 401 }
    );
  }

  let requestedDiscordId = session.id;

  try {
    const body = await request.json();
    if (body?.discordId) {
      requestedDiscordId = String(body.discordId);
    }
  } catch {
    // Body is optional. No body means the signed-in user is removing themself.
  }

  const removingSomeoneElse = requestedDiscordId !== session.id;

const [signups, settings] = await Promise.all([
  getSignups(env),
  getBingoSettings(env)
]);

  if (removingSomeoneElse && !isStaffSession(session)) {
    return Response.json(
      { error: "Only staff can remove another member from Bingo." },
      { status: 403 }
    );
  }

  if (!removingSomeoneElse && !isStaffSession(session) && settings.signupOpen !== true) {
    return Response.json(
      { error: "Registration is locked, so members can no longer leave the team." },
      { status: 403 }
    );
  }

  const existing = signups.find(item => item.discordId === requestedDiscordId);

  if (!existing) {
    return Response.json(
      { error: "That member is not currently signed up." },
      { status: 404 }
    );
  }

  const updatedSignups = signups.filter(item => item.discordId !== requestedDiscordId);
  await saveSignups(env, updatedSignups);

  return Response.json({
    success: true,
    removedSignup: publicSignup(existing),
    currentSignup: requestedDiscordId === session.id
      ? null
      : updatedSignups.find(item => item.discordId === session.id) || null,
    signups: updatedSignups.map(publicSignup)
  });
}
