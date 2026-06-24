import { getSession, isStaffSession } from "../_auth.js";
const BINGO_SIZE = 10;
const MAX_TILES = BINGO_SIZE * BINGO_SIZE;
const SHIP_TEMPLATES = [
  { key: "carrier", name: "Carrier", size: 5 },
  { key: "battleship", name: "Battleship", size: 4 },
  { key: "cruiser", name: "Cruiser", size: 3 },
  { key: "submarine", name: "Submarine", size: 3 },
  { key: "destroyer", name: "Destroyer", size: 3 },
  { key: "patrol", name: "Patrol Boat", size: 2 }
];

function emptyTiles() {
  return Array.from({ length: MAX_TILES }, (_, index) => ({
    id: index,
    name: "",
    image: "",
    quantity: 1,
    completedQuantity: 0,
    status: "open",
    completedBy: "",
    completedTeam: "",
    proofId: ""
  }));
}

function defaultTeam(key, name) {
  return {
    key,
    name,
    captain: "",
    ships: SHIP_TEMPLATES.map(ship => ({ ...ship, cells: [], sunk: false })),
    attacks: [],
    fleetConfirmed: false
  };
}

function defaultState() {
  return {
    version: 2,
    size: BINGO_SIZE,
    phase: "setup",
    locked: false,
    updatedAt: new Date().toISOString(),
    tiles: emptyTiles(),
    teams: {
      ember: defaultTeam("ember", "Ember Fleet"),
      ash: defaultTeam("ash", "Ash Fleet")
    },
    proofs: [],
    attacks: [],
    log: [{ at: new Date().toISOString(), text: "Battleship Bingo room created." }]
  };
}

function clampString(value, max = 500) {
  return String(value || "").slice(0, max);
}

function cleanShips(ships) {
  return SHIP_TEMPLATES.map(template => {
    const existing = Array.isArray(ships) ? ships.find(ship => ship.key === template.key) : null;
    const cells = Array.isArray(existing?.cells)
      ? existing.cells.map(Number).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < MAX_TILES).slice(0, template.size)
      : [];
    return { ...template, cells, sunk: Boolean(existing?.sunk) };
  });
}

function sanitiseState(body) {
  const base = defaultState();
  const tiles = Array.isArray(body.tiles) ? body.tiles : [];
  const cleanTiles = emptyTiles().map((baseTile, index) => {
    const tile = tiles[index] || {};
    return {
      ...baseTile,
      name: clampString(tile.name, 120),
      image: clampString(tile.image, 700),
      quantity: Math.max(1, Number.parseInt(tile.quantity ?? tile.qty ?? tile.quantityNeeded ?? 1, 10) || 1),
      completedQuantity: Math.max(0, Number.parseInt(tile.completedQuantity ?? tile.completedQty ?? tile.progress ?? 0, 10) || 0),
      status: ["open", "submitted", "partial", "approved", "rejected"].includes(tile.status) ? tile.status : "open",
      completedBy: clampString(tile.completedBy, 100),
      completedTeam: ["ember", "ash"].includes(tile.completedTeam) ? tile.completedTeam : "",
      proofId: clampString(tile.proofId, 80)
    };
  });

  return {
    ...base,
    version: 2,
    size: BINGO_SIZE,
    phase: ["setup", "captains", "ships", "active", "complete"].includes(body.phase) ? body.phase : "setup",
    locked: Boolean(body.locked),
    updatedAt: clampString(body.updatedAt, 80) || new Date().toISOString(),
    tiles: cleanTiles,
    teams: {
      ember: {
        ...base.teams.ember,
        ...(body.teams?.ember || {}),
        key: "ember",
        name: clampString(body.teams?.ember?.name || "Ember Fleet", 80),
        captain: clampString(body.teams?.ember?.captain, 80),
        ships: cleanShips(body.teams?.ember?.ships),
        attacks: Array.isArray(body.teams?.ember?.attacks) ? body.teams.ember.attacks.slice(0, 200) : [],
        fleetConfirmed: Boolean(body.teams?.ember?.fleetConfirmed)
      },
      ash: {
        ...base.teams.ash,
        ...(body.teams?.ash || {}),
        key: "ash",
        name: clampString(body.teams?.ash?.name || "Ash Fleet", 80),
        captain: clampString(body.teams?.ash?.captain, 80),
        ships: cleanShips(body.teams?.ash?.ships),
        attacks: Array.isArray(body.teams?.ash?.attacks) ? body.teams.ash.attacks.slice(0, 200) : [],
        fleetConfirmed: Boolean(body.teams?.ash?.fleetConfirmed)
      }
    },
    proofs: Array.isArray(body.proofs) ? body.proofs.slice(0, 300).map(proof => ({
      id: clampString(proof.id, 80),
      tileIndex: Number.isInteger(Number(proof.tileIndex)) ? Number(proof.tileIndex) : 0,
      team: ["ember", "ash"].includes(proof.team) ? proof.team : "ember",
      player: clampString(proof.player, 100),
      url: clampString(proof.url, 700),
      note: clampString(proof.note, 300),
      quantity: Math.max(1, Number.parseInt(proof.quantity ?? proof.qty ?? 1, 10) || 1),
      status: ["pending", "approved", "rejected"].includes(proof.status) ? proof.status : "pending",
      createdAt: clampString(proof.createdAt, 80) || new Date().toISOString()
    })) : [],
    attacks: Array.isArray(body.attacks) ? body.attacks.slice(0, 300).map(attack => ({
      id: clampString(attack.id, 80),
      attackingTeam: ["ember", "ash"].includes(attack.attackingTeam) ? attack.attackingTeam : "ember",
      defendingTeam: ["ember", "ash"].includes(attack.defendingTeam) ? attack.defendingTeam : "ash",
      targetIndex: Number.isInteger(Number(attack.targetIndex)) ? Number(attack.targetIndex) : 0,
      result: attack.result === "hit" ? "hit" : "miss",
      shipKey: clampString(attack.shipKey, 80),
      at: clampString(attack.at, 80) || new Date().toISOString()
    })) : [],
    log: Array.isArray(body.log) ? body.log.slice(0, 120).map(entry => ({
      at: clampString(entry.at, 80) || new Date().toISOString(),
      text: clampString(entry.text, 300)
    })) : base.log
  };
}

export async function onRequestGet({ env }) {
  const saved = await env.DROPS_KV.get("bingo:state:v2");
  if (saved) return Response.json(JSON.parse(saved));

  const oldSaved = await env.DROPS_KV.get("bingo:board");
  if (oldSaved) {
    const old = JSON.parse(oldSaved);
    const migrated = defaultState();
    if (Array.isArray(old.tiles)) {
      migrated.tiles = emptyTiles().map((tile, index) => ({ ...tile, ...(old.tiles[index] || {}), id: index }));
    }
    migrated.locked = Boolean(old.locked);
    migrated.updatedAt = old.updatedAt || new Date().toISOString();
    return Response.json(migrated);
  }

  return Response.json(defaultState());
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json();
  const state = sanitiseState(body || {});
  await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
  return Response.json(state);
}
