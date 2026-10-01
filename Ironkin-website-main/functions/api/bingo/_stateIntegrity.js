const TEAM_KEYS = ["ember", "ash"];
const VALID_PROGRESS_STATUS = new Set(["open", "submitted", "partial", "approved", "rejected"]);
const VALID_PROOF_STATUS = new Set(["pending", "approved", "rejected"]);

export function opponentTeam(team) {
  return team === "ember" ? "ash" : team === "ash" ? "ember" : null;
}

export function emptyTeamProgress() {
  return { completedQuantity: 0, status: "open", completedBy: "", proofId: "" };
}

function clampString(value, max = 500) {
  return String(value || "").slice(0, max);
}

function positiveQuantity(value) {
  return Math.max(1, Number.parseInt(value ?? 1, 10) || 1);
}

function cleanProgress(source, required) {
  const completedQuantity = Math.min(required, Math.max(0, Number.parseInt(source?.completedQuantity ?? 0, 10) || 0));
  return {
    completedQuantity,
    status: VALID_PROGRESS_STATUS.has(source?.status) ? source.status : (completedQuantity > 0 ? "partial" : "open"),
    completedBy: clampString(source?.completedBy, 100),
    proofId: clampString(source?.proofId, 80)
  };
}

function migrateLegacyProgress(tile, required) {
  const hasCanonical = tile?.teamProgress && typeof tile.teamProgress === "object" &&
    (tile.teamProgress.ember || tile.teamProgress.ash);
  if (hasCanonical) return null;

  const legacyTeam = TEAM_KEYS.includes(tile?.completedTeam) ? tile.completedTeam : null;
  const legacyCompleted = Math.min(required, Math.max(0, Number.parseInt(
    tile?.completedQuantity ?? tile?.completedQty ?? tile?.progress ?? 0,
    10
  ) || 0));
  if (!legacyTeam || legacyCompleted <= 0) return null;

  return {
    team: legacyTeam,
    progress: {
      completedQuantity: legacyCompleted,
      status: legacyCompleted >= required ? "approved" : "partial",
      completedBy: clampString(tile?.completedBy, 100),
      proofId: clampString(tile?.proofId, 80)
    }
  };
}

function neutraliseLegacyTileFields(tile) {
  // These fields were the old globally shared progress state. They are kept at
  // neutral values only for backward-compatible rendering, never as a source of truth.
  tile.completedQuantity = 0;
  tile.completedQty = 0;
  tile.progress = 0;
  tile.status = "open";
  tile.completedBy = "";
  tile.completedTeam = "";
  tile.proofId = "";
  delete tile.__legacyProgressMigrated;
}

function normaliseProofs(state) {
  const proofs = Array.isArray(state.proofs) ? state.proofs : [];
  state.proofs = proofs.filter(proof => {
    const tileIndex = Number(proof?.tileIndex);
    const isTest = Boolean(proof?.isTest || proof?.bingoId === "test-bingo");
    return proof && TEAM_KEYS.includes(proof.team) && Number.isInteger(tileIndex) && (tileIndex >= 0 || isTest);
  }).map(proof => ({
    ...proof,
    team: proof.team,
    tileIndex: Number(proof.tileIndex),
    status: VALID_PROOF_STATUS.has(proof.status) ? proof.status : "pending",
    quantity: Math.max(1, Number.parseInt(proof.quantity ?? 1, 10) || 1)
  })).slice(0, 300);
}

function normaliseAttacks(state) {
  const source = Array.isArray(state.attacks) ? state.attacks : [];
  const byCoordinate = new Map();
  for (const attack of source) {
    const attackingTeam = TEAM_KEYS.includes(attack?.attackingTeam) ? attack.attackingTeam : null;
    const targetIndex = Number(attack?.targetIndex);
    if (!attackingTeam || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= 100) continue;
    const key = `${attackingTeam}:${targetIndex}`;
    byCoordinate.set(key, {
      ...attack,
      id: clampString(attack.id, 80) || crypto.randomUUID(),
      attackingTeam,
      defendingTeam: opponentTeam(attackingTeam),
      targetIndex,
      result: attack.result === "hit" ? "hit" : "miss",
      shipKey: attack.result === "hit" ? clampString(attack.shipKey, 80) : "",
      at: clampString(attack.at, 80) || new Date().toISOString()
    });
  }
  state.attacks = [...byCoordinate.values()].slice(-1000);
  state.teams = state.teams || {};
  for (const team of TEAM_KEYS) {
    state.teams[team] = state.teams[team] || { key: team, ships: [], attacks: [] };
    state.teams[team].attacks = state.attacks.filter(attack => attack.attackingTeam === team);
  }
}

function recomputeSunkShips(state) {
  for (const team of TEAM_KEYS) {
    const ships = Array.isArray(state.teams?.[team]?.ships) ? state.teams[team].ships : [];
    for (const ship of ships) {
      const cells = Array.isArray(ship.cells) ? ship.cells.map(Number).filter(Number.isInteger) : [];
      ship.sunk = cells.length > 0 && cells.every(cell => state.attacks.some(attack =>
        attack.defendingTeam === team && attack.targetIndex === cell && attack.result === "hit"
      ));
    }
  }
}

function reconcileTileProgress(state) {
  const pendingKeys = new Set(state.proofs
    .filter(proof => proof.status === "pending")
    .map(proof => `${proof.team}:${proof.tileIndex}`));

  state.tiles = (Array.isArray(state.tiles) ? state.tiles : []).slice(0, 100).map((tile, index) => {
    const next = { ...(tile || {}), id: index };
    const required = positiveQuantity(next.quantity);
    next.quantity = required;
    const migration = migrateLegacyProgress(next, required);
    next.teamProgress = next.teamProgress && typeof next.teamProgress === "object" ? next.teamProgress : {};

    for (const team of TEAM_KEYS) {
      let progress = cleanProgress(next.teamProgress[team], required);
      if (migration?.team === team && progress.completedQuantity === 0) progress = migration.progress;

      const hasPending = pendingKeys.has(`${team}:${index}`);
      if (progress.completedQuantity >= required) {
        progress.completedQuantity = required;
        progress.status = "approved";
      } else if (progress.completedQuantity > 0) {
        progress.status = "partial";
      } else if (hasPending) {
        progress.status = "submitted";
      } else if (progress.status === "submitted" || progress.status === "partial" || progress.status === "approved") {
        progress.status = "open";
        progress.proofId = "";
      }
      next.teamProgress[team] = progress;
    }

    neutraliseLegacyTileFields(next);
    return next;
  });
}

export function enforceStateIntegrity(input) {
  const state = input && typeof input === "object" ? input : {};
  state.schemaVersion = 3;
  state.teamSlotVersion = 1;
  state.stateRevision = Math.max(0, Number.parseInt(state.stateRevision ?? 0, 10) || 0);
  normaliseProofs(state);
  normaliseAttacks(state);
  reconcileTileProgress(state);
  recomputeSunkShips(state);
  return state;
}

export function prepareStateForWrite(input, currentRevision = null) {
  const state = enforceStateIntegrity(input);
  const base = currentRevision === null
    ? state.stateRevision
    : Math.max(0, Number.parseInt(currentRevision ?? 0, 10) || 0);
  state.stateRevision = base + 1;
  state.updatedAt = new Date().toISOString();
  return state;
}

export function auditStateIntegrity(input) {
  const issues = [];
  const state = enforceStateIntegrity(structuredClone(input || {}));
  for (const [index, tile] of state.tiles.entries()) {
    if (!tile.teamProgress?.ember || !tile.teamProgress?.ash) issues.push(`Tile ${index} is missing per-team progress.`);
    if (tile.completedQuantity || tile.completedTeam || tile.completedBy || tile.proofId) issues.push(`Tile ${index} contains active legacy shared progress.`);
  }
  for (const attack of state.attacks) {
    if (attack.defendingTeam !== opponentTeam(attack.attackingTeam)) issues.push(`Attack ${attack.id} has mismatched teams.`);
  }
  return { ok: issues.length === 0, issues, state };
}
