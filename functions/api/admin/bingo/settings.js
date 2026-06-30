import { getSession, isStaffSession } from "../../_auth.js";
const DEFAULT_SETTINGS = {
  title: "Battleship Bingo",
  description: "Build a board, split into teams, claim tiles, and track summer progress.",
  active: false,
  signupOpen: false,
  enableViewEvent: false,
  registrationEndsAt: "",
  boardRevealAt: "",
  teamOneName: "Team 1",
  teamTwoName: "Team 2"
};

function cleanString(value, fallback = "", max = 300) {
  const cleaned = String(value || "").trim().slice(0, max);
  return cleaned || fallback;
}

function cleanDateTime(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";

  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) ? cleaned : "";
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const settings = {
    title: cleanString(body.title, DEFAULT_SETTINGS.title, 80),
    description: cleanString(body.description, "", 300),
    active: body.active === true,
    signupOpen: body.signupOpen === true,
    enableViewEvent: body.enableViewEvent === true,
    registrationEndsAt: cleanDateTime(body.registrationEndsAt),
    boardRevealAt: cleanDateTime(body.boardRevealAt),
    teamOneName: cleanString(body.teamOneName, DEFAULT_SETTINGS.teamOneName, 40),
    teamTwoName: cleanString(body.teamTwoName, DEFAULT_SETTINGS.teamTwoName, 40)
  };

  await env.DROPS_KV.put("bingo:settings", JSON.stringify(settings));

  return Response.json({
    success: true,
    settings
  });
}
