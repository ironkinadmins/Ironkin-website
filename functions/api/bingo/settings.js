const DEFAULT_SETTINGS = {
  title: "Battleship Bingo",
  description: "Build a board, split into teams, claim tiles, and track summer progress.",
  active: false
};

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("bingo:settings");
  const settings = saved
    ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
    : DEFAULT_SETTINGS;

  return Response.json({ settings });
}
