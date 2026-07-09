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

function proofEmbedColor(action) {
  if (action === "approved") return 0x2ecc71;
  if (action === "rejected") return 0xe74c3c;
  if (action === "deleted") return 0x95a5a6;
  return 0xf1c40f;
}

function statusTitle(proof, action) {
  const isTest = isPluginTestProof(proof);
  const status = action.charAt(0).toUpperCase() + action.slice(1);
  return `${isTest ? "Plugin Test Proof" : "Bingo Proof"} ${status}`;
}

function buildStatusEmbed(state, proof, action) {
  const status = action.charAt(0).toUpperCase() + action.slice(1);
  return {
    title: statusTitle(proof, action),
    color: proofEmbedColor(action),
    fields: [
      { name: "Player", value: String(proof?.player || "Unknown"), inline: true },
      { name: "Tile", value: String(getTileName(state, proof)), inline: true },
      { name: "Item", value: String(getItemName(state, proof)), inline: true },
      { name: "Status", value: status, inline: true },
      { name: "Review", value: "https://ironkinclan.com/battleship-bingo.html", inline: false }
    ],
    footer: { text: `Proof ID: ${proof?.id || "Unknown"}` },
    timestamp: new Date().toISOString()
  };
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
      content: "",
      embeds: [buildStatusEmbed(state, proof, action)],
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
