import { getSession, isStaffSession } from "../_auth.js";
import { TEAM_ONE_NAME, TEAM_TWO_NAME } from "./_teams.js";
import { boardTeam as boardKeyForAccessTeam, getConfig as getAccessConfig, getTeamSession as getTeamAccess } from "./_teamAccess.js";
import { enforceStateIntegrity, prepareStateForWrite } from "./_stateIntegrity.js";
import { updateProofDiscordMessage } from "./_discordProofs.js";
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
    proofId: "",
    teamProgress: {
      ember: { completedQuantity: 0, status: "open", completedBy: "", proofId: "" },
      ash: { completedQuantity: 0, status: "open", completedBy: "", proofId: "" }
    }
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
    schemaVersion: 3,
    teamSlotVersion: 1,
    stateRevision: 0,
    size: BINGO_SIZE,
    phase: "setup",
    locked: false,
    updatedAt: new Date().toISOString(),
    tiles: emptyTiles(),
    teams: {
      ember: defaultTeam("ember", TEAM_ONE_NAME),
      ash: defaultTeam("ash", TEAM_TWO_NAME)
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

function cleanTeamProgress(tile) {
  const result = {};
  for (const team of ["ember", "ash"]) {
    const source = tile?.teamProgress?.[team] || {};
    result[team] = {
      completedQuantity: Math.max(0, Number.parseInt(source.completedQuantity ?? 0, 10) || 0),
      status: ["open", "submitted", "partial", "approved", "rejected"].includes(source.status) ? source.status : "open",
      completedBy: clampString(source.completedBy, 100),
      proofId: clampString(source.proofId, 80)
    };
  }

  // One-time migration from the former globally shared tile progress.
  const legacyTeam = tile?.completedTeam === "ash" ? "ash" : tile?.completedTeam === "ember" ? "ember" : null;
  const legacyCompleted = Math.max(0, Number.parseInt(tile?.completedQuantity ?? tile?.completedQty ?? tile?.progress ?? 0, 10) || 0);
  if (legacyTeam && legacyCompleted > 0 && !tile?.teamProgress?.[legacyTeam]) {
    result[legacyTeam] = {
      completedQuantity: legacyCompleted,
      status: ["open", "submitted", "partial", "approved", "rejected"].includes(tile.status) ? tile.status : "partial",
      completedBy: clampString(tile.completedBy, 100),
      proofId: clampString(tile.proofId, 80)
    };
  }
  return result;
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
      completedQuantity: 0,
      completedQty: 0,
      progress: 0,
      status: "open",
      completedBy: "",
      completedTeam: "",
      proofId: "",
      teamProgress: cleanTeamProgress(tile)
    };
  });

  return {
    ...base,
    version: 2,
    schemaVersion: 3,
    teamSlotVersion: Number(body.teamSlotVersion) === 1 ? 1 : 0,
    stateRevision: Math.max(0, Number.parseInt(body.stateRevision ?? 0, 10) || 0),
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
        name: clampString(body.teams?.ember?.name || TEAM_ONE_NAME, 80),
        captain: clampString(body.teams?.ember?.captain, 80),
        ships: cleanShips(body.teams?.ember?.ships),
        attacks: Array.isArray(body.teams?.ember?.attacks) ? body.teams.ember.attacks.slice(0, 200) : [],
        fleetConfirmed: Boolean(body.teams?.ember?.fleetConfirmed)
      },
      ash: {
        ...base.teams.ash,
        ...(body.teams?.ash || {}),
        key: "ash",
        name: clampString(body.teams?.ash?.name || TEAM_TWO_NAME, 80),
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
      createdAt: clampString(proof.createdAt, 80) || new Date().toISOString(),
      bingoId: clampString(proof.bingoId, 80),
      isTest: Boolean(proof.isTest),
      tileName: clampString(proof.tileName, 120),
      source: clampString(proof.source, 80),
      itemid: Number.isInteger(Number(proof.itemid)) ? Number(proof.itemid) : undefined,
      submittedByDiscordId: clampString(proof.submittedByDiscordId, 80),
      discordMessageId: clampString(proof.discordMessageId, 80),
      discordMessageUpdatedAt: clampString(proof.discordMessageUpdatedAt, 80)
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


function swapTeamKey(value) {
  return value === "ember" ? "ash" : value === "ash" ? "ember" : value;
}

function looksLikeApeys(name) {
  return /apey/i.test(String(name || ""));
}

function looksLikeHarambe(name) {
  return /harambe/i.test(String(name || ""));
}

// Older saves could have the two named teams stored in the opposite internal slots.
// This migrates the COMPLETE team state (fleets, captains, proofs and attacks), then
// permanently fixes ember = Apey's Apes and ash = The Harambe Hunters.
function canonicaliseTeamSlots(inputState) {
  const state = sanitiseState(inputState || {});
  const emberName = inputState?.teams?.ember?.name || state.teams.ember.name;
  const ashName = inputState?.teams?.ash?.name || state.teams.ash.name;
  const reversed = inputState?.teamSlotVersion !== 1 && (looksLikeHarambe(emberName) || looksLikeApeys(ashName));

  if (reversed) {
    const oldEmber = state.teams.ember;
    const oldAsh = state.teams.ash;
    state.teams.ember = { ...oldAsh, key: "ember", name: TEAM_ONE_NAME };
    state.teams.ash = { ...oldEmber, key: "ash", name: TEAM_TWO_NAME };

    state.proofs = state.proofs.map(proof => ({ ...proof, team: swapTeamKey(proof.team) }));
    state.attacks = state.attacks.map(attack => ({
      ...attack,
      attackingTeam: swapTeamKey(attack.attackingTeam),
      defendingTeam: swapTeamKey(attack.defendingTeam)
    }));
    state.tiles = state.tiles.map(tile => ({
      ...tile,
      completedTeam: swapTeamKey(tile.completedTeam),
      teamProgress: {
        ember: { ...(tile.teamProgress?.ash || {}) },
        ash: { ...(tile.teamProgress?.ember || {}) }
      }
    }));
  }

  state.teams.ember.name = clampString(state.teams.ember.name || TEAM_ONE_NAME, 80);
  state.teams.ash.name = clampString(state.teams.ash.name || TEAM_TWO_NAME, 80);
  state.teams.ember.key = "ember";
  state.teams.ash.key = "ash";
  state.teams.ember.attacks = state.attacks.filter(attack => attack.attackingTeam === "ember");
  state.teams.ash.attacks = state.attacks.filter(attack => attack.attackingTeam === "ash");
  state.teamSlotVersion = 1;
  return enforceStateIntegrity(state);
}

function isBoardFullyRevealed(state) {
  return ["active", "complete"].includes(state?.phase);
}

function publicWaitingState(state) {
  const base = defaultState();
  return {
    ...base,
    version: state?.version || 2,
    size: BINGO_SIZE,
    phase: state?.phase || "setup",
    locked: Boolean(state?.locked),
    updatedAt: state?.updatedAt || new Date().toISOString(),
    boardHidden: true,
    boardHiddenReason: "The Battleship Bingo board has not been revealed yet.",
    tiles: emptyTiles(),
    teams: {
      ember: { ...base.teams.ember, name: TEAM_ONE_NAME, captain: "", ships: cleanShips([]), attacks: [], fleetConfirmed: false },
      ash: { ...base.teams.ash, name: TEAM_TWO_NAME, captain: "", ships: cleanShips([]), attacks: [], fleetConfirmed: false }
    },
    proofs: [],
    attacks: [],
    log: []
  };
}

function redactOpponentFleet(state, memberTeam) {
  if (!memberTeam) return publicWaitingState(state);
  const ownKey = memberTeam === "team2" ? "ash" : "ember";
  const opponentKey = ownKey === "ember" ? "ash" : "ember";
  return {
    ...state,
    viewerTeam: ownKey,
    teams: {
      ...state.teams,
      [ownKey]: { ...state.teams[ownKey] },
      [opponentKey]: {
        ...state.teams[opponentKey],
        ships: cleanShips([])
      }
    },
    proofs: Array.isArray(state.proofs) ? state.proofs.filter(proof => proof.team === ownKey) : []
  };
}

function publicStateForRequest(state, isStaff, memberTeam = null) {
  const viewerTeam = memberTeam === "team2" ? "ash" : memberTeam === "team1" ? "ember" : null;
  if (isStaff) return { ...state, viewerTeam };
  if (!isBoardFullyRevealed(state)) return publicWaitingState(state);
  return redactOpponentFleet(state, memberTeam);
}


function cleanWebhookBase(url) {
  return String(url || "").split("?")[0].replace(/\/+$/, "");
}

function isPluginTestProof(proof) {
  const note = String(proof?.note || "").toLowerCase();
  const tileName = String(proof?.tileName || "").toLowerCase();
  const bingoId = String(proof?.bingoId || "").toLowerCase();
  return Boolean(
    proof?.isTest ||
    bingoId === "test-bingo" ||
    tileName.includes("plugin test") ||
    note.includes("plugin test") ||
    note.includes("test only") ||
    note.includes("runelite plugin proof upload")
  );
}

function discordProofColor(action) {
  if (action === "approved") return 0x2ecc71;
  if (action === "rejected") return 0xe74c3c;
  if (action === "deleted") return 0x95a5a6;
  return 0xf1c40f;
}

function getDiscordTileName(state, proof) {
  if (proof?.tileName) return proof.tileName;
  const tileIndex = Number(proof?.tileIndex);
  if (Number.isInteger(tileIndex) && tileIndex >= 0) {
    return state?.tiles?.[tileIndex]?.name || `Tile ${tileIndex + 1}`;
  }
  return isPluginTestProof(proof) ? "Plugin Test - Bones" : "Unknown tile";
}

function getDiscordItemName(state, proof) {
  if (isPluginTestProof(proof)) return "Bones";
  const tileIndex = Number(proof?.tileIndex);
  if (Number.isInteger(tileIndex) && tileIndex >= 0 && state?.tiles?.[tileIndex]?.name) return state.tiles[tileIndex].name;
  return proof?.itemid ? `Item ID ${proof.itemid}` : "Unknown item";
}

function buildDiscordProofEmbed(state, proof, action, request) {
  const status = action.charAt(0).toUpperCase() + action.slice(1);
  const titleBase = isPluginTestProof(proof) ? "Plugin Test Proof" : "Bingo Proof";
  const origin = request ? new URL(request.url).origin : "https://ironkinclan.com";
  return {
    title: `${titleBase} ${status}`,
    color: discordProofColor(action),
    fields: [
      { name: "Player", value: clampString(proof?.player || "Unknown", 100) || "Unknown", inline: true },
      { name: "Tile", value: clampString(getDiscordTileName(state, proof), 120) || "Unknown tile", inline: true },
      { name: "Item", value: clampString(getDiscordItemName(state, proof), 120) || "Unknown item", inline: true },
      { name: "Status", value: status, inline: true },
      { name: "Review", value: `${origin}/battleship-bingo.html`, inline: false }
    ],
    footer: { text: `Proof ID: ${proof?.id || "Unknown"}` },
    timestamp: new Date().toISOString()
  };
}

async function editDiscordProofMessage(env, request, state, proof, action) {
  if (!proof?.discordMessageId) return false;
  return updateProofDiscordMessage(env, state, proof, action, proof.reviewedBy || "", null);
}

async function updateDiscordMessagesForProofChanges(env, request, previousState, nextState) {
  const previousProofs = Array.isArray(previousState?.proofs) ? previousState.proofs : [];
  const nextProofs = Array.isArray(nextState?.proofs) ? nextState.proofs : [];
  const nextById = new Map(nextProofs.map(proof => [proof.id, proof]));
  let changed = false;

  for (const oldProof of previousProofs) {
    if (!oldProof?.id || !oldProof.discordMessageId) continue;
    const newProof = nextById.get(oldProof.id);

    if (!newProof) {
      const ok = await editDiscordProofMessage(env, request, previousState, oldProof, "deleted");
      if (ok) changed = true;
      continue;
    }

    const oldStatus = String(oldProof.status || "pending").toLowerCase();
    const newStatus = String(newProof.status || "pending").toLowerCase();
    if (oldStatus !== newStatus && ["approved", "rejected"].includes(newStatus)) {
      const ok = await editDiscordProofMessage(env, request, nextState, newProof, newStatus);
      if (ok) {
        newProof.discordMessageUpdatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }

  return changed;
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  const isStaff = isStaffSession(session);
  const accessTeam = await getTeamAccess(request, env);
  const viewerBoardKey = boardKeyForAccessTeam(accessTeam);
  const requestedTeamView = new URL(request.url).searchParams.get("teamView");
  const forceTeamView = requestedTeamView === "team1" || requestedTeamView === "team2";
  if ((forceTeamView && accessTeam !== requestedTeamView) || (!isStaff && !viewerBoardKey)) {
    return Response.json(
      { error: "Enter your team password to view Battleship Bingo." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const config = await getAccessConfig(env);
  const memberTeam = forceTeamView ? requestedTeamView : (viewerBoardKey === "ash" ? "team2" : viewerBoardKey === "ember" ? "team1" : null);
  const applyNames = state => {
    state.teams.ember.name = config.team1.name;
    state.teams.ash.name = config.team2.name;
    return state;
  };

  const saved = await env.DROPS_KV.get("bingo:state:v2");
  if (saved) {
    const rawState = JSON.parse(saved);
    const state = applyNames(canonicaliseTeamSlots(rawState));
    if (JSON.stringify(rawState) !== JSON.stringify(state)) {
      await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
    }
    return Response.json(publicStateForRequest(state, forceTeamView ? false : isStaff, memberTeam), {
      headers: { "Cache-Control": "no-store" }
    });
  }

  const oldSaved = await env.DROPS_KV.get("bingo:board");
  if (oldSaved) {
    const old = JSON.parse(oldSaved);
    const migrated = applyNames(defaultState());
    if (Array.isArray(old.tiles)) {
      migrated.tiles = emptyTiles().map((tile, index) => ({ ...tile, ...(old.tiles[index] || {}), id: index }));
    }
    migrated.locked = Boolean(old.locked);
    migrated.updatedAt = old.updatedAt || new Date().toISOString();
    return Response.json(publicStateForRequest(enforceStateIntegrity(migrated), isStaff, memberTeam), {
      headers: { "Cache-Control": "no-store" }
    });
  }

  return Response.json(publicStateForRequest(applyNames(defaultState()), isStaff, memberTeam), {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const previousRaw = await env.DROPS_KV.get("bingo:state:v2");
  const previousState = enforceStateIntegrity(previousRaw ? JSON.parse(previousRaw) : defaultState());
  const body = await request.json();
  const incomingRevision = Math.max(0, Number.parseInt(body?.stateRevision ?? 0, 10) || 0);
  if (incomingRevision !== previousState.stateRevision) {
    return Response.json({
      error: "The board changed after this page loaded. Refresh before saving again.",
      code: "STALE_BOARD_STATE",
      currentRevision: previousState.stateRevision
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const state = prepareStateForWrite(canonicaliseTeamSlots(body || {}), previousState.stateRevision);

  // Keep Discord proof notifications in sync from the same server-side save
  // that approves/rejects/deletes proofs. This avoids relying on a separate
  // browser follow-up request after the proof status changes.
  await updateDiscordMessagesForProofChanges(env, request, previousState, state).catch(error => {
    console.warn("Could not update Discord proof notification", error);
  });

  await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
  return Response.json(state);
}
