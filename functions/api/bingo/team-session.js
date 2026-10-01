import { clearCookie, getConfig, getTeamSession } from "./_teamAccess.js";
import { requireBingoTeam } from "./_teamAuthorization.js";

const headers = (extra = {}) => ({ "Cache-Control": "no-store", ...extra });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const requestedTeam = ["team1", "team2"].includes(url.searchParams.get("team"))
    ? url.searchParams.get("team")
    : null;

  const user = await requireBingoTeam(request, env, requestedTeam);
  if (!user.ok) {
    return Response.json({ error: user.error }, { status: user.status, headers: headers() });
  }

  const cookieTeam = await getTeamSession(request, env);
  const validTeamSession = cookieTeam === user.team ? cookieTeam : null;
  const config = await getConfig(env);
  const responseHeaders = validTeamSession || !cookieTeam
    ? headers()
    : headers({ "Set-Cookie": clearCookie() });

  return Response.json({
    team: validTeamSession,
    authorizedTeam: user.team,
    displayName: user.displayName,
    isStaff: Boolean(user.isStaff),
    teams: {
      team1: { name: config.team1.name, passwordSet: Boolean(config.team1.hash) },
      team2: { name: config.team2.name, passwordSet: Boolean(config.team2.hash) }
    }
  }, { headers: responseHeaders });
}

export async function onRequestDelete() {
  return Response.json({ ok: true }, { headers: headers({ "Set-Cookie": clearCookie() }) });
}
