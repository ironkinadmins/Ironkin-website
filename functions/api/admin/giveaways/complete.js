import { getSession, isStaffSession } from "../../_auth.js";

const GIVEAWAYS_KEY = "giveaways:kc";
function getDisplayName(session) {
  return session?.nick || session?.global_name || session?.username || "Unknown member";
}

function cleanText(value, fallback = "", max = 300) {
  const text = String(value || "").trim().slice(0, max);
  return text || fallback;
}

async function getGiveaways(env) {
  const raw = await env.DROPS_KV.get(GIVEAWAYS_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
}

async function saveGiveaways(env, giveaways) {
  await env.DROPS_KV.put(GIVEAWAYS_KEY, JSON.stringify(giveaways));
}

function publicGiveaway(giveaway, includeSubmissions = false) {
  const submissions = Array.isArray(giveaway.submissions) ? giveaway.submissions : [];
  return {
    ...giveaway,
    submissions: includeSubmissions ? submissions : submissions.map(item => ({
      rsn: item.rsn,
      kc: item.kc,
      submittedAt: item.submittedAt
    })),
    submissionCount: submissions.length
  };
}

function pickWinner(submissions, actualKc) {
  return submissions
    .slice()
    .sort((a, b) => {
      const diff = Math.abs(Number(a.kc || 0) - actualKc) - Math.abs(Number(b.kc || 0) - actualKc);
      if (diff !== 0) return diff;
      return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
    })[0] || null;
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const giveawayId = cleanText(body.giveawayId, "", 120);
  const actualKc = Number(body.actualKc);

  if (!giveawayId || !Number.isFinite(actualKc) || actualKc < 0 || !Number.isInteger(actualKc)) {
    return Response.json({ error: "Enter a valid actual KC." }, { status: 400 });
  }

  const giveaways = await getGiveaways(env);
  const giveaway = giveaways.find(item => item.id === giveawayId);

  if (!giveaway) {
    return Response.json({ error: "Giveaway not found." }, { status: 404 });
  }

  const submissions = Array.isArray(giveaway.submissions) ? giveaway.submissions : [];
  const winner = pickWinner(submissions, actualKc);

  giveaway.status = "completed";
  giveaway.actualKc = actualKc;
  giveaway.completedAt = new Date().toISOString();
  giveaway.completedBy = session.id;
  giveaway.winnerDiscordId = winner?.discordId || "";
  giveaway.winnerName = winner?.rsn || winner?.displayName || "";
  giveaway.winnerKc = winner ? Number(winner.kc) : null;
  giveaway.updatedAt = new Date().toISOString();

  await saveGiveaways(env, giveaways);

  return Response.json({
    success: true,
    giveaway: publicGiveaway(giveaway, true),
    winner
  });
}
