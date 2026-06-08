
const GIVEAWAYS_KEY = "giveaways:kc";
const STAFF_ROLE_IDS = ["1364734283356569620", "1365445491776815104"];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);
  if (!match) return null;
  try { return JSON.parse(atob(match[1])); } catch { return null; }
}

function isStaffSession(session) {
  return Boolean(session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId)));
}

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

export async function onRequestGet({ request, env }) {
  const session = getSession(request);
  const staff = isStaffSession(session);
  const giveaways = await getGiveaways(env);

  const sorted = giveaways
    .slice()
    .sort((a, b) => {
      const statusScore = status => status === "open" ? 0 : status === "scheduled" ? 1 : status === "completed" ? 2 : 3;
      const diff = statusScore(a.status) - statusScore(b.status);
      if (diff !== 0) return diff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

  return Response.json({
    giveaways: sorted.map(item => publicGiveaway(item, staff)),
    currentUserId: session?.id || null,
    isStaff: staff
  });
}
