import { getSession, isStaffSession } from "../../_auth.js";
const SIGNUPS_KEY = "bingo:signups";
async function getSignups(env) {
  const raw = await env.DROPS_KV.get(SIGNUPS_KEY);
  const signups = raw ? JSON.parse(raw) : [];
  return Array.isArray(signups) ? signups : [];
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);

  if (!isStaffSession(session)) {
    return Response.json(
      { error: "Staff only." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const discordId = String(body.discordId || "").trim();
  const team = String(body.team || "").trim();

  if (!discordId || !["team1", "team2"].includes(team)) {
    return Response.json(
      { error: "Missing member or invalid team." },
      { status: 400 }
    );
  }

  const signups = await getSignups(env);
  const signup = signups.find(item => item.discordId === discordId);

  if (!signup) {
    return Response.json(
      { error: "Signup not found." },
      { status: 404 }
    );
  }

  signup.team = team;
  signup.movedBy = session.id;
  signup.movedAt = new Date().toISOString();

  await env.DROPS_KV.put(SIGNUPS_KEY, JSON.stringify(signups));

  return Response.json({
    success: true,
    signup
  });
}
