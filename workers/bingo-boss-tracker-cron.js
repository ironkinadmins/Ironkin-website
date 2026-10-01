const DEFAULT_SITE_URL = "https://ironkinclan.com";

// Each POST to the tracker endpoint refreshes one small batch of players
// (WOM rate limits make one big batch impossible), so a sweep loops until the
// endpoint reports the cycle is complete. Batches are spaced a minute apart
// to keep Wise Old Man happy.
const MAX_BATCHES_PER_SWEEP = 12;
const DELAY_BETWEEN_BATCHES_MS = 65 * 1000;

function getSiteUrl(env) {
  return String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTrackerSweep(env) {
  const siteUrl = getSiteUrl(env);
  const url = `${siteUrl}/api/bingo/boss-tracker`;

  const headers = new Headers();
  if (env.BINGO_TRACKER_SECRET) {
    headers.set("X-Bingo-Tracker-Secret", env.BINGO_TRACKER_SECRET);
  }

  const batches = [];

  for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
    const response = await fetch(url, { method: "POST", headers });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      console.warn("Bingo boss tracker batch failed", response.status, data);
      throw new Error(`Bingo boss tracker batch failed with status ${response.status}`);
    }

    batches.push(data);

    if (data?.waiting || data?.skipped || data?.cycleComplete) {
      break;
    }

    await wait(DELAY_BETWEEN_BATCHES_MS);
  }

  console.log("Bingo boss tracker sweep completed", JSON.stringify(batches.at(-1)));
  return batches;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runTrackerSweep(env));
  },

  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const batches = await runTrackerSweep(env);
    return Response.json({ success: true, worker: "bingo-boss-tracker-cron", batches });
  }
};
