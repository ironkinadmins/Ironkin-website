
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

function makeId() {
  return `giveaway-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export async function onRequestPost({ request, env }) {
  const session = getSession(request);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const giveaways = await getGiveaways(env);
  const id = cleanText(body.id, "", 120);
  const existing = id ? giveaways.find(item => item.id === id) : null;

  const giveaway = existing || {
    id: makeId(),
    createdAt: new Date().toISOString(),
    createdBy: session.id,
    submissions: []
  };

  giveaway.title = cleanText(body.title, "KC Guess Giveaway", 100);
  giveaway.host = cleanText(body.host, getDisplayName(session), 80);
  giveaway.drop = cleanText(body.drop, "Drop TBD", 100);
  giveaway.description = cleanText(body.description, "", 600);
  giveaway.closesAt = cleanDate(body.closesAt);
  giveaway.status = ["open", "scheduled", "cancelled", "completed"].includes(body.status) ? body.status : "open";
  giveaway.updatedAt = new Date().toISOString();

  if (!existing) {
    giveaways.push(giveaway);
  }

  await saveGiveaways(env, giveaways);

  return Response.json({
    success: true,
    giveaway: publicGiveaway(giveaway, true)
  });
}
