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

function cleanText(value, fallback = "", max = 300) {
  const text = String(value || "").trim().slice(0, max);
  return text || fallback;
}

function normalizeRsn(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const giveawayId = cleanText(body.giveawayId, "", 120);
  const rsn = cleanText(body.rsn, "", 40);
  const kc = Number(body.kc);

  if (!giveawayId) {
    return Response.json({ error: "Missing giveaway ID." }, { status: 400 });
  }

  if (!rsn) {
    return Response.json({ error: "Enter an RSN." }, { status: 400 });
  }

  if (!Number.isFinite(kc) || kc < 0 || !Number.isInteger(kc)) {
    return Response.json({ error: "Enter a valid whole-number KC guess." }, { status: 400 });
  }

  const giveaways = await getGiveaways(env);
  const giveaway = giveaways.find(item => item.id === giveawayId);

  if (!giveaway) {
    return Response.json({ error: "Giveaway not found." }, { status: 404 });
  }

  if (["completed", "cancelled"].includes(String(giveaway.status || "").toLowerCase())) {
    return Response.json({ error: "This giveaway is closed." }, { status: 400 });
  }

  const submissions = Array.isArray(giveaway.submissions) ? giveaway.submissions : [];
  const rsnKey = normalizeRsn(rsn);
  const existing = submissions.find(item => normalizeRsn(item.rsn || item.displayName) === rsnKey);

  if (existing) {
    return Response.json({
      error: `${existing.rsn || rsn} already has a guess for this giveaway.`,
      submission: existing
    }, { status: 409 });
  }

  const entry = {
    discordId: `manual:${rsnKey}`,
    rsn,
    displayName: rsn,
    kc,
    submittedAt: new Date().toISOString(),
    submittedByAdmin: true,
    submittedBy: session.id || "staff"
  };

  submissions.push(entry);
  giveaway.submissions = submissions;
  giveaway.updatedAt = new Date().toISOString();

  await saveGiveaways(env, giveaways);

  return Response.json({
    success: true,
    giveaway: publicGiveaway(giveaway, true),
    submission: entry
  });
}


export async function onRequestDelete({ request, env }) {
  const session = getSession(request);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const giveawayId = cleanText(body.giveawayId, "", 120);
  const submissionId = cleanText(body.submissionId, "", 120);
  const submittedAt = cleanText(body.submittedAt, "", 120);
  const rsn = cleanText(body.rsn, "", 40);

  if (!giveawayId) {
    return Response.json({ error: "Missing giveaway ID." }, { status: 400 });
  }

  if (!submissionId && !submittedAt && !rsn) {
    return Response.json({ error: "Missing submission details." }, { status: 400 });
  }

  const giveaways = await getGiveaways(env);
  const giveaway = giveaways.find(item => item.id === giveawayId);

  if (!giveaway) {
    return Response.json({ error: "Giveaway not found." }, { status: 404 });
  }

  const submissions = Array.isArray(giveaway.submissions) ? giveaway.submissions : [];
  const rsnKey = normalizeRsn(rsn);
  const beforeCount = submissions.length;

  giveaway.submissions = submissions.filter(item => {
    if (submissionId && String(item.discordId || "") === submissionId) return false;
    if (submittedAt && String(item.submittedAt || "") === submittedAt) return false;
    if (rsnKey && normalizeRsn(item.rsn || item.displayName) === rsnKey) return false;
    return true;
  });

  if (giveaway.submissions.length === beforeCount) {
    return Response.json({ error: "Submission not found." }, { status: 404 });
  }

  giveaway.updatedAt = new Date().toISOString();
  await saveGiveaways(env, giveaways);

  return Response.json({
    success: true,
    giveaway: publicGiveaway(giveaway, true)
  });
}
