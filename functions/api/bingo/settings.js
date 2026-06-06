const DEFAULT_SETTINGS = {
  title: "Battleship Bingo",
  description: "Build a board, split into teams, claim tiles, and track summer progress.",
  active: false,
  signupOpen: false,
  enableViewEvent: false
};

function normalizeSettings(parsed = {}) {
  const enableViewEvent =
    typeof parsed.enableViewEvent === "boolean"
      ? parsed.enableViewEvent
      : false;

  const signupOpen =
    typeof parsed.signupOpen === "boolean"
      ? parsed.signupOpen
      : parsed.active === true && enableViewEvent !== true;

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
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
