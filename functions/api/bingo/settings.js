const DEFAULT_SETTINGS = {
  title: "Battleship Bingo",
  description: "Build a board, split into teams, claim tiles, and track summer progress.",
  active: false,
  signupOpen: false,
  enableViewEvent: false,
  registrationEndsAt: "",
  teamOneName: "Team 1",
  teamTwoName: "Team 2"
};

function hasRegistrationDeadlinePassed(registrationEndsAt) {
  if (!registrationEndsAt) return false;
  const deadline = new Date(registrationEndsAt);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() <= Date.now();
}

function normalizeSettings(parsed = {}) {
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
    ...DEFAULT_SETTINGS,
    ...parsed,
    registrationEndsAt,
    teamOneName: parsed.teamOneName || DEFAULT_SETTINGS.teamOneName,
    teamTwoName: parsed.teamTwoName || DEFAULT_SETTINGS.teamTwoName,
    signupOpen,
    enableViewEvent
  };
}

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("bingo:settings");
  const parsed = saved ? JSON.parse(saved) : {};

  return Response.json({
    settings: normalizeSettings(parsed)
  });
}
