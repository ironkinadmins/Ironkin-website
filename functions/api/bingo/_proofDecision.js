import { enforceStateIntegrity, prepareStateForWrite } from "./_stateIntegrity.js";

function emptyProgress() {
  return { completedQuantity: 0, status: "open", completedBy: "", proofId: "" };
}

function appendLog(state, text) {
  const entry = { at: new Date().toISOString(), text: String(text || "").slice(0, 300) };
  state.log = Array.isArray(state.log) ? [entry, ...state.log].slice(0, 2000) : [entry];
}

function teamName(state, team) {
  return String(state?.teams?.[team]?.name || (team === "ember" ? "Team 1" : "Team 2"));
}

function opponent(team) {
  return team === "ember" ? "ash" : "ember";
}

function isTestProof(proof) {
  const note = String(proof?.note || "").toLowerCase();
  return Boolean(proof?.isTest || proof?.bingoId === "test-bingo" || note.includes("plugin test") || note.includes("test only"));
}

function recalculateSunk(state, defendingTeam) {
  const attacks = Array.isArray(state.attacks) ? state.attacks : [];
  for (const ship of state?.teams?.[defendingTeam]?.ships || []) {
    const cells = Array.isArray(ship.cells) ? ship.cells : [];
    ship.sunk = cells.length > 0 && cells.every(cell => attacks.some(a =>
      a.defendingTeam === defendingTeam && Number(a.targetIndex) === Number(cell) && a.result === "hit"
    ));
  }
}

function resolveAttack(state, proof) {
  const attackingTeam = proof.team;
  const defendingTeam = opponent(attackingTeam);
  const targetIndex = Number(proof.tileIndex);
  state.attacks = Array.isArray(state.attacks) ? state.attacks : [];

  const existing = state.attacks.find(a => a.attackingTeam === attackingTeam && Number(a.targetIndex) === targetIndex);
  if (existing) return existing;

  const ship = (state?.teams?.[defendingTeam]?.ships || []).find(s => Array.isArray(s.cells) && s.cells.includes(targetIndex));
  const attack = {
    id: crypto.randomUUID(),
    attackingTeam,
    defendingTeam,
    targetIndex,
    result: ship ? "hit" : "miss",
    shipKey: ship?.key || "",
    proofId: proof.id,
    at: new Date().toISOString()
  };
  state.attacks.push(attack);
  if (state?.teams?.[attackingTeam]) {
    state.teams[attackingTeam].attacks = state.attacks.filter(a => a.attackingTeam === attackingTeam);
  }
  appendLog(state, `${teamName(state, attackingTeam)} fired at ${teamName(state, defendingTeam)}: ${attack.result === "hit" ? "HIT" : "MISS"}.`);

  recalculateSunk(state, defendingTeam);
  const defendingShips = state?.teams?.[defendingTeam]?.ships || [];
  if (defendingShips.length && defendingShips.every(s => s.sunk)) {
    state.phase = "complete";
    appendLog(state, `${teamName(state, attackingTeam)} wins Battleship Bingo.`);
  }
  return attack;
}

export async function getBingoState(env) {
  const raw = await env.DROPS_KV.get("bingo:state:v2");
  return raw ? enforceStateIntegrity(JSON.parse(raw)) : null;
}

export async function decideProof(env, { proofId, decision, reviewerId = "", reviewerName = "Discord Staff", expectedRevision = null }) {
  if (!proofId || !["approve", "reject"].includes(decision)) {
    return { ok: false, status: 400, error: "Invalid proof decision." };
  }

  const state = await getBingoState(env);
  if (!state) return { ok: false, status: 404, error: "Bingo state not found." };
  if (expectedRevision !== null && Number(expectedRevision) !== Number(state.stateRevision)) {
    return { ok: false, status: 409, error: "The board changed after this page loaded. Refresh and try again.", code: "STALE_BOARD_STATE" };
  }
  const proof = (state.proofs || []).find(p => p.id === proofId);
  if (!proof) return { ok: false, status: 404, error: "Proof not found." };
  if (proof.status !== "pending") {
    return { ok: false, status: 409, error: `Proof was already ${proof.status}.`, proof, state };
  }

  proof.reviewedAt = new Date().toISOString();
  proof.reviewedByDiscordId = String(reviewerId || "");
  proof.reviewedBy = String(reviewerName || "Discord Staff").slice(0, 100);

  if (isTestProof(proof)) {
    proof.status = decision === "approve" ? "approved" : "rejected";
    appendLog(state, `${proof.status === "approved" ? "Approved" : "Rejected"} plugin test proof for ${proof.player || "Unknown"} by ${proof.reviewedBy}.`);
    prepareStateForWrite(state, state.stateRevision);
    await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
    return { ok: true, proof, state, attack: null, completed: false };
  }

  const tileIndex = Number(proof.tileIndex);
  const tile = state.tiles?.[tileIndex];
  if (!tile || !["ember", "ash"].includes(proof.team)) {
    return { ok: false, status: 400, error: "Proof has invalid tile or team." };
  }

  tile.teamProgress = tile.teamProgress || { ember: emptyProgress(), ash: emptyProgress() };
  const progress = tile.teamProgress[proof.team] || emptyProgress();
  tile.teamProgress[proof.team] = progress;
  const completedBefore = Math.max(0, Number(progress.completedQuantity) || 0);

  if (decision === "reject") {
    proof.status = "rejected";
    progress.status = completedBefore > 0 ? "partial" : "open";
    if (progress.proofId === proof.id) progress.proofId = "";
    appendLog(state, `Rejected proof for ${tile.name || `Tile ${tileIndex + 1}`} by ${proof.player || "Unknown"}; reviewed by ${proof.reviewedBy}.`);
    prepareStateForWrite(state, state.stateRevision);
    await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
    return { ok: true, proof, state, attack: null, completed: false };
  }

  const required = Math.max(1, Number(tile.quantity) || 1);
  const approvedQuantity = Math.max(1, Number(proof.quantity) || 1);
  const completedAfter = Math.min(required, completedBefore + approvedQuantity);
  proof.status = "approved";
  progress.completedQuantity = completedAfter;
  progress.completedBy = proof.player || "Unknown";
  progress.proofId = proof.id;

  let attack = null;
  const completed = completedAfter >= required;
  if (completed) {
    progress.status = "approved";
    attack = resolveAttack(state, proof);
    appendLog(state, `Approved proof for ${tile.name} by ${proof.player}; reviewed by ${proof.reviewedBy}. Tile complete (${completedAfter}/${required}).`);
  } else {
    progress.status = "partial";
    appendLog(state, `Approved proof for ${tile.name} by ${proof.player}; reviewed by ${proof.reviewedBy}. Progress ${completedAfter}/${required}.`);
  }

  prepareStateForWrite(state, state.stateRevision);
  await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
  return { ok: true, proof, state, attack, completed };
}
