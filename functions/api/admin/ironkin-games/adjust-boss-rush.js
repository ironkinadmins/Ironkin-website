import { getSession, isGamesAdminSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isGamesAdminSession(session)) return Response.json({ error: "Staff only." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const attemptId = String(body.attemptId || "");
  const boss = String(body.boss || "");
  const amount = Number(body.amount || 0);
  if (!attemptId || !/^[a-z0-9_]+$/.test(boss) || amount !== 1) {
    return Response.json({ error: "Invalid Boss Rush adjustment." }, { status: 400 });
  }

  const state = await loadGames(env);
  const attempt = (state.sessions || []).find(x => String(x.id) === attemptId && x.type === "boss-rush");
  if (!attempt) return Response.json({ error: "Boss Rush attempt not found." }, { status: 404 });
  if (!["completed", "late_review"].includes(String(attempt.status || ""))) {
    return Response.json({ error: "Only finished Boss Rush attempts can be adjusted." }, { status: 409 });
  }

  // Only allow real WOM boss metrics already present in this attempt's snapshots.
  // This prevents arbitrary keys/typos from being added to an official result.
  const knownBosses = new Set([
    ...Object.keys(attempt.baselineBosses || {}),
    ...Object.keys(attempt.endingBosses || {}),
    ...Object.keys(attempt.bossGains || {})
  ]);
  if (!knownBosses.has(boss)) {
    return Response.json({ error: "That boss is not available in this attempt's WOM boss data." }, { status: 400 });
  }

  attempt.bossGains = { ...(attempt.bossGains || {}) };
  attempt.bossGains[boss] = Math.max(0, Number(attempt.bossGains[boss] || 0)) + 1;
  attempt.completedBosses = Array.from(new Set([...(attempt.completedBosses || []), boss]));

  // Keep the saved ending snapshot internally consistent when one exists.
  if (attempt.endingBosses && typeof attempt.endingBosses === "object") {
    attempt.endingBosses = { ...attempt.endingBosses };
    const baseline = Number(attempt.baselineBosses?.[boss] || 0);
    attempt.endingBosses[boss] = Math.max(Number(attempt.endingBosses[boss] || 0), baseline + Number(attempt.bossGains[boss] || 0));
  }

  attempt.manualAdjustments = Array.isArray(attempt.manualAdjustments) ? attempt.manualAdjustments : [];
  attempt.manualAdjustments.push({ boss, amount: 1, at: new Date().toISOString(), by: String(session.id || session.discordId || "staff") });

  await saveGames(env, state);
  return Response.json({ ok: true, attempt, state });
}
