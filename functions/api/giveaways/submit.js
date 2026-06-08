
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

export async function onRequestPost({ request, env }) {
  const session = getSession(request);
  if (!session?.id) {
    return Response.json({ error: "Sign in with Discord to submit a guess." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const giveawayId = cleanText(body.giveawayId, "", 120);
  const kc = Number(body.kc);

  if (!giveawayId || !Number.isFinite(kc) || kc < 0 || !Number.isInteger(kc)) {
    return Response.json({ error: "Enter a valid whole-number KC guess." }, { status: 400 });
  }

  const giveaways = await getGiveaways(env);
  const giveaway = giveaways.find(item => item.id === giveawayId);

  if (!giveaway) {
    return Response.json({ error: "Giveaway not found." }, { status: 404 });
  }

  if (giveaway.status !== "open") {
    return Response.json({ error: "This giveaway is not open for guesses." }, { status: 400 });
  }

  if (giveaway.closesAt) {
    const closes = new Date(giveaway.closesAt);
    if (Number.isFinite(closes.getTime()) && closes.getTime() <= Date.now()) {
      return Response.json({ error: "This giveaway is closed." }, { status: 400 });
    }
  }

  const submissions = Array.isArray(giveaway.submissions) ? giveaway.submissions : [];
  const existing = submissions.find(item => item.discordId === session.id);
  const entry = {
    discordId: session.id,
    rsn: getDisplayName(session),
    displayName: getDisplayName(session),
    kc,
    submittedAt: existing?.submittedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, entry);
  } else {
    submissions.push(entry);
  }

  giveaway.submissions = submissions;
  giveaway.updatedAt = new Date().toISOString();

  await saveGiveaways(env, giveaways);

  return Response.json({
    success: true,
    submission: entry
  });
}
