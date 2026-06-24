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

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const giveawayId = cleanText(body.giveawayId, "", 120);

  if (!giveawayId) {
    return Response.json({ error: "Missing giveaway." }, { status: 400 });
  }

  const giveaways = await getGiveaways(env);
  const next = giveaways.filter(item => item.id !== giveawayId);

  await saveGiveaways(env, next);

  return Response.json({ success: true });
}
