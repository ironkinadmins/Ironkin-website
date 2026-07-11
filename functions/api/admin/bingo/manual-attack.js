import { getSession, isStaffSession } from "../../_auth.js";

const STATE_KEY = "bingo:state:v2";
const VALID_TEAMS = new Set(["ember", "ash"]);
const VALID_RESULTS = new Set(["hit", "miss", "reset", "reset-progress"]);

function noStore(headers = {}) {
  return { "Cache-Control": "no-store", ...headers };
}

function opponent(team) {
  return team === "ember" ? "ash" : "ember";
}

function safeName(value, fallback) {
  const clean = String(value || "").trim().slice(0, 100);
  return clean || fallback;
}

function emptyProgress() {
  return { completedQuantity: 0, status: "open", completedBy: "", proofId: "" };
}

function recomputeSunkShips(state) {
  const attacks = Array.isArray(state.attacks) ? state.attacks : [];
  for (const teamKey of ["ember", "ash"]) {
    const ships = Array.isArray(state.teams?.[teamKey]?.ships) ? state.teams[teamKey].ships : [];
    for (const ship of ships) {
      const cells = Array.isArray(ship.cells) ? ship.cells : [];
      ship.sunk = cells.length > 0 && cells.every(cell => attacks.some(attack =>
        attack.defendingTeam === teamKey &&
        Number(attack.targetIndex) === Number(cell) &&
        attack.result === "hit"
      ));
    }
  }
}

function removeAttack(state, attackingTeam, targetIndex) {
  state.attacks = state.attacks.filter(attack => !(
    attack.attackingTeam === attackingTeam && Number(attack.targetIndex) === targetIndex
  ));
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403, headers: noStore() });
  }

  if (!String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return Response.json({ error: "Invalid request." }, { status: 415, headers: noStore() });
  }

  const body = await request.json().catch(() => ({}));
  const attackingTeam = VALID_TEAMS.has(body.attackingTeam) ? body.attackingTeam : null;
  const result = VALID_RESULTS.has(body.result) ? body.result : null;
  const targetIndex = Number(body.targetIndex);

  if (!attackingTeam || !result || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= 100) {
    return Response.json({ error: "Invalid team, tile, or result." }, { status: 400, headers: noStore() });
  }

  const raw = await env.DROPS_KV.get(STATE_KEY);
  if (!raw) {
    return Response.json({ error: "The Bingo board has not been created yet." }, { status: 404, headers: noStore() });
  }

  const state = JSON.parse(raw);
  state.attacks = Array.isArray(state.attacks) ? state.attacks : [];
  state.log = Array.isArray(state.log) ? state.log : [];
  state.teams = state.teams || {};
  state.teams.ember = state.teams.ember || { attacks: [], ships: [] };
  state.teams.ash = state.teams.ash || { attacks: [], ships: [] };

  const defendingTeam = opponent(attackingTeam);
  const existing = state.attacks.find(attack =>
    attack.attackingTeam === attackingTeam && Number(attack.targetIndex) === targetIndex
  );
  const previousResult = existing?.result || "open";
  const tile = state.tiles?.[targetIndex];
  const tileName = safeName(tile?.name, `Tile ${targetIndex + 1}`);
  const attackingName = safeName(state.teams?.[attackingTeam]?.name, attackingTeam);
  const defendingName = safeName(state.teams?.[defendingTeam]?.name, defendingTeam);
  const adminName = safeName(session.nick || session.global_name || session.username, "Staff");

  if (result === "reset-progress") {
    if (!tile) {
      return Response.json({ error: "That tile does not exist." }, { status: 404, headers: noStore() });
    }
    tile.teamProgress = tile.teamProgress || {};
    tile.teamProgress[attackingTeam] = emptyProgress();

    // Clear the old globally shared fields too, preventing legacy migration from restoring the quantity.
    if (tile.completedTeam === attackingTeam) {
      tile.completedQuantity = 0;
      tile.completedQty = 0;
      tile.progress = 0;
      tile.status = "open";
      tile.completedBy = "";
      tile.completedTeam = "";
      tile.proofId = "";
    }

    // A tile with no team progress should no longer have an attack result for that team.
    removeAttack(state, attackingTeam, targetIndex);
  } else if (result === "reset") {
    removeAttack(state, attackingTeam, targetIndex);
  } else {
    const defendingShips = Array.isArray(state.teams?.[defendingTeam]?.ships) ? state.teams[defendingTeam].ships : [];
    const matchingShip = defendingShips.find(ship => Array.isArray(ship.cells) && ship.cells.includes(targetIndex));
    const attack = {
      id: existing?.id || crypto.randomUUID(),
      attackingTeam,
      defendingTeam,
      targetIndex,
      result,
      shipKey: result === "hit" ? String(matchingShip?.key || "") : "",
      source: "admin-manual",
      manual: true,
      at: new Date().toISOString()
    };
    removeAttack(state, attackingTeam, targetIndex);
    state.attacks.push(attack);
  }

  state.teams.ember.attacks = state.attacks.filter(attack => attack.attackingTeam === "ember");
  state.teams.ash.attacks = state.attacks.filter(attack => attack.attackingTeam === "ash");
  recomputeSunkShips(state);

  const now = new Date().toISOString();
  state.updatedAt = now;
  let text;
  if (result === "reset-progress") {
    text = `${adminName} reset ${attackingName}'s tile progress on ${tileName}.`;
  } else if (result === "reset") {
    text = `${adminName} reset ${attackingName}'s attack on ${tileName} (was ${previousResult}).`;
  } else {
    text = `${adminName} manually marked ${attackingName}'s attack on ${defendingName} at ${tileName} as ${result.toUpperCase()}.`;
  }
  state.log.unshift({ at: now, text });
  state.log = state.log.slice(0, 120);

  await env.DROPS_KV.put(STATE_KEY, JSON.stringify(state));
  return Response.json({ ok: true, attackingTeam, defendingTeam, targetIndex, result, updatedAt: now }, { headers: noStore() });
}
