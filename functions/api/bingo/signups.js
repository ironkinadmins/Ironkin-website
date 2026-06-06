const SIGNUPS_KEY = "bingo:signups";
const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);
  if (!match) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

function isStaff(session) {
  return Boolean(
    session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId))
  );
}

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

async function getBingoSettings(env) {
  const raw = await env.DROPS_KV.get("bingo:settings");
  const parsed = raw ? JSON.parse(raw) : {};
  const enableViewEvent =
    typeof parsed.enableViewEvent === "boolean"
      ? parsed.enableViewEvent
      : false;
  const signupOpen =
    typeof parsed.signupOpen === "boolean"
      ? parsed.signupOpen
      : parsed.active === true && enableViewEvent !== true;

  return {
    title: parsed.title || "Battleship Bingo",
    description: parsed.description || "Build a board, split into teams, claim tiles, and track summer progress.",
    active: parsed.active === true,
    signupOpen,
    enableViewEvent
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
  const session = getSession(request);
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
    isStaff: isStaff(session),
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
  const session = getSession(request);

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
  const session = getSession(request);

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

  if (removingSomeoneElse && !isStaff(session)) {
    return Response.json(
      { error: "Only staff can remove another member from Bingo." },
      { status: 403 }
    );
  }

  if (!removingSomeoneElse && !isStaff(session) && settings.signupOpen !== true) {
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
