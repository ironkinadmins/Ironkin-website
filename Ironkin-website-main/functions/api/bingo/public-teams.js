import { getConfig } from "./_teamAccess.js";

export async function onRequestGet({ env }) {
  const config = await getConfig(env);
  return Response.json({
    teams: {
      team1: { name: config.team1.name },
      team2: { name: config.team2.name }
    }
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
