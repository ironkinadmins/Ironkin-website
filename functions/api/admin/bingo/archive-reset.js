import { getSession, isStaffSession } from "../../_auth.js";
import { enforceStateIntegrity } from "../../bingo/_stateIntegrity.js";
import { TEAM_ONE_NAME, TEAM_TWO_NAME } from "../../bingo/_teams.js";

const STATE_KEY = "bingo:state:v2";
const ARCHIVE_INDEX_KEY = "bingo:archive:index:v1";
const ARCHIVE_PREFIX = "bingo:archive:v1:";
const SIZE = 10;
const SHIPS = [
  { key: "carrier", name: "Carrier", size: 5 },
  { key: "battleship", name: "Battleship", size: 4 },
  { key: "cruiser", name: "Cruiser", size: 3 },
  { key: "submarine", name: "Submarine", size: 3 },
  { key: "destroyer", name: "Destroyer", size: 3 },
  { key: "patrol", name: "Patrol Boat", size: 2 }
];

function emptyProgress() {
  return { completedQuantity: 0, status: "open", completedBy: "", proofId: "" };
}

function emptyTiles() {
  return Array.from({ length: SIZE * SIZE }, (_, id) => ({
    id,
    name: "",
    image: "",
    quantity: 1,
    completedQuantity: 0,
    completedQty: 0,
    progress: 0,
    status: "open",
    completedBy: "",
    completedTeam: "",
    proofId: "",
    teamProgress: { ember: emptyProgress(), ash: emptyProgress() }
  }));
}

function emptyTeam(key, name) {
  return {
    key,
    name,
    captain: "",
    ships: SHIPS.map(ship => ({ ...ship, cells: [], sunk: false })),
    attacks: [],
    fleetConfirmed: false
  };
}

function freshState(previousRevision = 0) {
  const now = new Date().toISOString();
  return {
    version: 2,
    schemaVersion: 3,
    teamSlotVersion: 1,
    stateRevision: previousRevision + 1,
    size: SIZE,
    phase: "setup",
    locked: false,
    updatedAt: now,
    tiles: emptyTiles(),
    teams: {
      ember: emptyTeam("ember", TEAM_ONE_NAME),
      ash: emptyTeam("ash", TEAM_TWO_NAME)
    },
    proofs: [],
    attacks: [],
    log: [{ at: now, text: "A new Battleship Bingo room was created after the previous game was archived." }]
  };
}

function completedTiles(state, team) {
  return (state.tiles || []).filter(tile => {
    const progress = tile?.teamProgress?.[team];
    return Number(progress?.completedQuantity || 0) >= Math.max(1, Number(tile?.quantity || 1));
  }).length;
}

function safeTitle(value) {
  return String(value || "Battleship Bingo").trim().slice(0, 120) || "Battleship Bingo";
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const raw = await env.DROPS_KV.get(STATE_KEY);
  if (!raw) {
    return Response.json({ error: "There is no Battleship Bingo game to archive." }, { status: 404 });
  }

  const state = enforceStateIntegrity(JSON.parse(raw));
  if (state.phase !== "complete") {
    return Response.json({ error: "End the Bingo game before archiving it." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const archivedAt = new Date().toISOString();
  const archiveId = `bingo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const title = safeTitle(body.title);
  const winner = ["ember", "ash", "tie"].includes(body.winner) ? body.winner : "";

  const snapshot = {
    id: archiveId,
    type: "battleship-bingo",
    title,
    archivedAt,
    endedAt: state.updatedAt || archivedAt,
    winner,
    notes: String(body.notes || "").trim().slice(0, 500),
    summary: {
      emberName: state.teams?.ember?.name || TEAM_ONE_NAME,
      ashName: state.teams?.ash?.name || TEAM_TWO_NAME,
      emberCompleted: completedTiles(state, "ember"),
      ashCompleted: completedTiles(state, "ash"),
      proofCount: Array.isArray(state.proofs) ? state.proofs.length : 0,
      attackCount: Array.isArray(state.attacks) ? state.attacks.length : 0
    },
    // Complete immutable final-state snapshot: all tiles, all four boards,
    // fleets/ship positions, proofs, attacks and the match log.
    state
  };

  const indexRaw = await env.DROPS_KV.get(ARCHIVE_INDEX_KEY);
  const index = indexRaw ? JSON.parse(indexRaw) : [];
  index.unshift({
    id: archiveId,
    type: snapshot.type,
    title,
    archivedAt,
    endedAt: snapshot.endedAt,
    winner,
    notes: snapshot.notes,
    summary: snapshot.summary
  });

  // Save the snapshot first. Only reset the live game after both archive writes succeed.
  await env.DROPS_KV.put(`${ARCHIVE_PREFIX}${archiveId}`, JSON.stringify(snapshot));
  await env.DROPS_KV.put(ARCHIVE_INDEX_KEY, JSON.stringify(index.slice(0, 100)));
  await env.DROPS_KV.put(STATE_KEY, JSON.stringify(freshState(Number(state.stateRevision || 0))));

  return Response.json({ ok: true, archiveId, archive: index[0] }, {
    headers: { "Cache-Control": "no-store" }
  });
}
