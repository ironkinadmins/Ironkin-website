import { clearRate, failRate, getConfig, makeCookie, rateStatus, verifyPassword } from "./_teamAccess.js";
import { requireBingoTeam } from "./_teamAuthorization.js";

const headers = (extra = {}) => ({ "Cache-Control": "no-store", ...extra });

export async function onRequestPost({ request, env }) {
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return Response.json({ error: "Invalid request." }, { status: 415, headers: headers() });
  }

  const body = await request.json().catch(() => ({}));
  const team = ["team1", "team2"].includes(body.team) ? body.team : null;
  const password = String(body.password || "");
  if (!team || !password || password.length > 128) {
    return Response.json({ error: "Invalid team or password." }, { status: 400, headers: headers() });
  }

  const user = await requireBingoTeam(request, env, team);
  if (!user.ok) {
    return Response.json({ error: user.error }, { status: user.status, headers: headers() });
  }

  const rate = await rateStatus(request, env, team);
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429, headers: headers({ "Retry-After": "900" }) }
    );
  }

  const config = await getConfig(env);
  if (!(await verifyPassword(config, team, password))) {
    await failRate(env, rate.key);
    return Response.json({ error: "Invalid team or password." }, { status: 403, headers: headers() });
  }

  await clearRate(env, rate.key);
  return Response.json(
    { ok: true, team, name: config[team].name, displayName: user.displayName },
    { headers: headers({ "Set-Cookie": await makeCookie(team, env, config) }) }
  );
}
