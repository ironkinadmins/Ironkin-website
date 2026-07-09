import { getSession, isStaffSession } from "../_auth.js";

const COUNCIL_ROLE_ID = "1515576495844757524";

function cleanWebhookBase(url) {
  return String(url || "").split("?")[0].replace(/\/+$/, "");
}

function clampString(value, max = 500) {
  return String(value || "").slice(0, max);
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

function getTileName(state, proof) {
  if (proof?.tileName) return proof.tileName;
  const tileIndex = Number(proof?.tileIndex);
  if (Number.isInteger(tileIndex) && tileIndex >= 0) {
    return state?.tiles?.[tileIndex]?.name || `Tile ${tileIndex + 1}`;
  }
  return isPluginTestProof(proof) ? "Plugin Test - Bones" : "Unknown tile";
}

function getItemName(state, proof) {
  if (isPluginTestProof(proof)) return "Bones";
  const tileIndex = Number(proof?.tileIndex);
  if (Number.isInteger(tileIndex) && tileIndex >= 0 && state?.tiles?.[tileIndex]?.name) return state.tiles[tileIndex].name;
  return proof?.itemid ? `Item ID ${proof.itemid}` : "Unknown item";
}

function statusTitle(proof, action) {
  const isTest = isPluginTestProof(proof);
  if (action === "approved") return isTest ? "Plugin Test Proof Approved" : "Bingo Proof Approved";
  if (action === "rejected") return isTest ? "Plugin Test Proof Rejected" : "Bingo Proof Rejected";
  if (action === "deleted") return isTest ? "Plugin Test Proof Deleted" : "Bingo Proof Deleted";
  return isTest ? "Plugin Test Proof Updated" : "Bingo Proof Updated";
}

function buildUpdatedContent(state, proof, action) {
  return [
    `**${statusTitle(proof, action)}**`,
    "",
    `Player: ${proof?.player || "Unknown"}`,
    `Tile: ${getTileName(state, proof)}`,
    `Item: ${getItemName(state, proof)}`,
    `Status: ${action.charAt(0).toUpperCase()}${action.slice(1)}`,
    "",
    `Review: https://ironkinclan.com/battleship-bingo.html`
  ].join("\n");
}

async function getState(env) {
  const saved = await env.DROPS_KV.get("bingo:state:v2");
  return saved ? JSON.parse(saved) : null;
}

async function saveState(env, state) {
  await env.DROPS_KV.put("bingo:state:v2", JSON.stringify(state));
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const webhookUrl = cleanWebhookBase(env.DISCORD_PROOF_WEBHOOK_URL);
  if (!webhookUrl) {
    return Response.json({ ok: true, skipped: true, reason: "DISCORD_PROOF_WEBHOOK_URL is not configured." });
  }

  const body = await request.json().catch(() => ({}));
  const proofId = clampString(body.proofId, 80);
  const action = clampString(body.action, 30).toLowerCase();
  if (!proofId || !["approved", "rejected", "deleted"].includes(action)) {
    return Response.json({ error: "proofId and valid action are required." }, { status: 400 });
  }

  const state = await getState(env);
  const proof = Array.isArray(state?.proofs) ? state.proofs.find(p => p.id === proofId) : null;
  if (!proof) return Response.json({ ok: true, skipped: true, reason: "Proof not found." });
  if (!proof.discordMessageId) return Response.json({ ok: true, skipped: true, reason: "Proof has no Discord message ID." });

  const response = await fetch(`${webhookUrl}/messages/${encodeURIComponent(proof.discordMessageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: buildUpdatedContent(state, proof, action),
      allowed_mentions: { parse: [] }
    })
  });

  if (!response.ok) {
    return Response.json({ error: "Discord message update failed.", status: response.status, body: await response.text() }, { status: 502 });
  }

  proof.discordMessageUpdatedAt = new Date().toISOString();
  await saveState(env, state);
  return Response.json({ ok: true });
}
