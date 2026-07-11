import { getTeamSession, boardTeam } from "./_teamAccess.js";
import { requireBingoTeam } from "./_teamAuthorization.js";

const headers = { "Cache-Control": "no-store" };
function text(value, max) { return String(value || "").trim().slice(0, max); }

export async function onRequestPost({ request, env }) {
  const access = await getTeamSession(request, env);
  if (!access) return Response.json({ error: "Team password required." }, { status: 401, headers });

  const user = await requireBingoTeam(request, env, access);
  if (!user.ok) return Response.json({ error: user.error }, { status: user.status, headers });

  const body = await request.json().catch(() => ({}));
  const tileIndex = Number(body.tileIndex);
  const player = user.displayName;
  const url = text(body.url, 700);
  const note = text(body.note, 300);
  const quantity = Math.max(1, Math.min(100, Number.parseInt(body.quantity || 1, 10) || 1));

  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= 100 || !url) {
    return Response.json({ error: "A proof link and valid tile are required." }, { status: 400, headers });
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return Response.json({ error: "Enter a valid http or https proof link." }, { status: 400, headers });
  }

  const raw = await env.DROPS_KV.get("bingo:state:v2");
  if (!raw) return Response.json({ error: "Board not found." }, { status: 404, headers });
  const state = JSON.parse(raw);
  if (!["active", "complete"].includes(state.phase)) {
    return Response.json({ error: "Proof submissions are not open." }, { status: 409, headers });
  }

  const team = boardTeam(access);
  const tile = state.tiles?.[tileIndex];
  if (!tile?.name) return Response.json({ error: "That tile is not available." }, { status: 400, headers });

  const progress = tile.teamProgress?.[team] || { completedQuantity: 0, status: "open", completedBy: "", proofId: "" };
  const required = Math.max(1, Number(tile.quantity) || 1);
  const completed = Math.max(0, Number(progress.completedQuantity) || 0);
  const remaining = Math.max(0, required - completed);
  if (remaining <= 0) return Response.json({ error: "That tile is already complete for your team." }, { status: 409, headers });
  if ((state.proofs || []).some(proof => proof.team === team && Number(proof.tileIndex) === tileIndex && proof.status === "pending")) {
    return Response.json({ error: "A proof for this tile is already pending." }, { status: 409, headers });
  }

  const proof = {
    id: crypto.randomUUID(),
    tileIndex,
    team,
    player,
    discordId: String(user.session.id || ""),
    url,
    note,
    quantity: Math.min(quantity, remaining),
    status: "pending",
    createdAt: new Date().toISOString(),
    source: "team-board"
  };

  state.proofs = Array.isArray(state.proofs) ? state.proofs : [];
  state.proofs.unshift(proof);
  tile.teamProgress = tile.teamProgress || {};
  tile.teamProgress[team] = { ...progress, status: completed > 0 ? "partial" : "submitted", proofId: proof.id };
  state.log = Array.isArray(state.log) ? state.log : [];
  state.log.unshift({ at: new Date().toISOString(), text: `${player} submitted proof for ${tile.name} x${proof.quantity} (${team}).` });
  state.updatedAt = new Date().toISOString();
  await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
  return Response.json({ ok: true, proof }, { headers });
}
