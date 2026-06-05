const DEFAULT_SETTINGS = {
  title: "Battleship Bingo",
  description: "Build a board, split into teams, claim tiles, and track summer progress.",
  active: false,
  enableViewEvent: false
};

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("bingo:settings");
  const parsed = saved ? JSON.parse(saved) : {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    enableViewEvent:
      typeof parsed.enableViewEvent === "boolean"
        ? parsed.enableViewEvent
        : parsed.active === true
  };

  return Response.json({ settings });
}
