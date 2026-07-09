import { lookupTileItemIds } from "./itemLookup.js";

const BOARD_KEY = "bingo:state:v2";
const SIGNUPS_KEY = "bingo:signups";
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

const TEST_BINGO_ID = "test-bingo";
// Permanent RuneLite plugin connectivity/proof-flow test.
// Bones = Item ID 526. Members set Bingo ID to test-bingo, pick up Bones,
// and staff should see a pending test proof without affecting the live board.
const TEST_BINGO_ITEMS = [{ id: 526 }];
const TEST_BINGO_ITEM_IDS = new Set(TEST_BINGO_ITEMS.map(item => item.id));

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .trim();
}

function asPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function uniqueIds(values) {
  return [...new Set(values.map(asPositiveInt).filter(Boolean))];
}

async function idsFromTile(env, tile) {
  return lookupTileItemIds(env, tile);
}

async function getBoard(env) {
  const raw = await env.DROPS_KV.get(BOARD_KEY);
  return safeJsonParse(raw, null);
}

async function saveBoard(env, board) {
  board.updatedAt = new Date().toISOString();
  await env.DROPS_KV.put(BOARD_KEY, JSON.stringify(board));
}

async function getSignups(env) {
  const raw = await env.DROPS_KV.get(SIGNUPS_KEY);
  const signups = safeJsonParse(raw, []);
  return Array.isArray(signups) ? signups : [];
}

function pluginUserFromContext(context) {
  return context.data?.pluginUser || null;
}

function boardTeamFromSignupTeam(team) {
  if (team === "team1" || team === "ember") return "ember";
  if (team === "team2" || team === "ash") return "ash";
  return "ember";
}

async function getPluginMemberContext(env, pluginUser, reportedUsername) {
  const signups = await getSignups(env);
  const byDiscord = pluginUser?.discordId
    ? signups.find(item => item.discordId === pluginUser.discordId)
    : null;
  const byName = reportedUsername
    ? signups.find(item => normalizeName(item.displayName || item.username) === normalizeName(reportedUsername))
    : null;
  const signup = byDiscord || byName || null;

  return {
    signup,
    player: signup?.displayName || pluginUser?.displayName || reportedUsername || "Unknown",
    team: boardTeamFromSignupTeam(signup?.team)
  };
}

async function findTileForItem(env, board, itemId) {
  const id = asPositiveInt(itemId);
  if (!id || !Array.isArray(board?.tiles)) return null;

  for (const [index, tile] of board.tiles.entries()) {
    const ids = await idsFromTile(env, tile);
    if (ids.includes(id)) {
      return { tile, tileIndex: index };
    }
  }

  return null;
}

async function getTrackedItems(env, board) {
  const ids = [];
  if (Array.isArray(board?.tiles)) {
    for (const tile of board.tiles) {
      ids.push(...await idsFromTile(env, tile));
    }
  }
  return uniqueIds(ids).map(id => ({ id }));
}

function cleanBase64Image(value) {
  const input = String(value || "").trim();
  const cleaned = input.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!cleaned) return "";
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(cleaned)) return "";
  return cleaned.replace(/[\r\n]/g, "");
}

function base64ByteLength(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function getOrigin(request) {
  return new URL(request.url).origin;
}

async function storeProofImage(env, proofId, imageData) {
  await env.DROPS_KV.put(`bingo:proof-image:${proofId}`, imageData, {
    metadata: { contentType: "image/png", createdAt: new Date().toISOString() }
  });
}

function appendLog(board, text) {
  const entry = { at: new Date().toISOString(), text: String(text || "").slice(0, 300) };
  board.log = Array.isArray(board.log) ? [entry, ...board.log].slice(0, 120) : [entry];
}

async function notifyPendingProofDiscord(env, request, proof, details = {}) {
  const webhookUrl = env.DISCORD_PROOF_WEBHOOK_URL;
  if (!webhookUrl) return "";

  const councilRoleId = env.COUNCIL_MEMBER_ROLE_ID || "1515576495844757524";
  const origin = getOrigin(request);
  const reviewUrl = `${origin}/battleship-bingo.html`;
  const isTest = Boolean(proof.isTest || proof.bingoId === TEST_BINGO_ID);

  const title = isTest ? "Plugin Test Proof Pending" : "New Bingo Proof Pending";
  const tileLine = details.tileName || proof.tileName || (Number.isInteger(proof.tileIndex) && proof.tileIndex >= 0 ? `Tile ${proof.tileIndex + 1}` : "Plugin Test");
  const itemLine = details.itemName || (proof.itemid ? `Item ID ${proof.itemid}` : "Unknown item");

  const content = [
    `<@&${councilRoleId}>`,
    "",
    `**${title}**`,
    "",
    `Player: ${proof.player || "Unknown"}`,
    `Tile: ${tileLine}`,
    `Item: ${itemLine}`,
    "",
    `Review: ${reviewUrl}`
  ].join("\n");

  try {
    const separator = webhookUrl.includes("?") ? "&" : "?";
    const response = await fetch(`${webhookUrl}${separator}wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        allowed_mentions: {
          parse: [],
          roles: [councilRoleId]
        }
      })
    });

    if (!response.ok) {
      console.warn("Failed to send pending proof Discord notification", response.status, await response.text());
      return "";
    }

    const message = await response.json().catch(() => null);
    return message?.id || "";
  } catch (error) {
    console.warn("Failed to send pending proof Discord notification", error);
    return "";
  }
}


export async function onRequestGet(context) {
  const { params, env } = context;
  const bingoId = String(params.bingoId || "").trim();

  if (bingoId === TEST_BINGO_ID) {
    return Response.json({ bingoId, items: TEST_BINGO_ITEMS });
  }
  const board = await getBoard(env);
  const items = await getTrackedItems(env, board);

  return Response.json({ bingoId, items });
}

export async function onRequestPost(context) {
  const { request, params, env } = context;
  const bingoId = String(params.bingoId || "").trim();
  const pluginUser = pluginUserFromContext(context);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonError("Invalid JSON body.", 400);
  }

  const username = String(body.username || "").trim();
  const itemId = asPositiveInt(body.itemid ?? body.itemId);
  const timestamp = Number(body.timestamp || Date.now());
  const imageData = cleanBase64Image(body.imageData);

  if (!username) return jsonError("Missing username.", 400);
  if (!itemId) return jsonError("Missing or invalid itemid.", 400);
  if (!imageData) return jsonError("Missing or invalid imageData.", 400);
  if (base64ByteLength(imageData) > MAX_IMAGE_BYTES) {
    return jsonError("imageData is too large.", 413);
  }

  if (bingoId === TEST_BINGO_ID) {
    if (!TEST_BINGO_ITEM_IDS.has(itemId)) {
      return jsonError("That item is not tracked for the plugin test bingo. Pick up Bones.", 404);
    }

    const board = await getBoard(env) || {
      version: 2,
      size: 10,
      phase: "setup",
      locked: false,
      tiles: [],
      teams: {},
      proofs: [],
      attacks: [],
      log: []
    };
    const proofId = crypto.randomUUID();
    const proofUrl = `${getOrigin(request)}/api/bingo/proof-image?id=${encodeURIComponent(proofId)}`;

    await storeProofImage(env, proofId, imageData);

    const proof = {
      id: proofId,
      bingoId,
      isTest: true,
      tileIndex: -1,
      tileName: "Plugin Test - Bones",
      team: "ember",
      player: pluginUser?.displayName || username || "Plugin Tester",
      url: proofUrl,
      note: `RuneLite plugin test proof. Item ID: ${itemId}. Loot username: ${username}.`,
      quantity: 1,
      status: "pending",
      createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
      source: "runelite-plugin-test",
      itemid: itemId,
      submittedByDiscordId: pluginUser.discordId
    };

    board.proofs = Array.isArray(board.proofs) ? board.proofs : [];
    board.proofs.unshift(proof);
    board.proofs = board.proofs.slice(0, 300);
    appendLog(board, `${proof.player} submitted a RuneLite plugin test proof.`);
    const discordMessageId = await notifyPendingProofDiscord(env, request, proof, { tileName: proof.tileName, itemName: "Bones" });
    if (discordMessageId) proof.discordMessageId = discordMessageId;
    await saveBoard(env, board);

    return Response.json({
      success: true,
      bingoId,
      test: true,
      proofId,
      itemid: itemId,
      status: "pending",
      message: "Plugin test proof created."
    });
  }

  const board = await getBoard(env);
  if (!board || !Array.isArray(board.tiles)) {
    return jsonError("Bingo board is not configured.", 404);
  }

  const match = await findTileForItem(env, board, itemId);
  if (!match) {
    return jsonError("That item is not tracked for this bingo.", 404);
  }

  const { signup, player, team } = await getPluginMemberContext(env, pluginUser, username);
  if (!signup) {
    return jsonError("This API key is valid, but the member is not signed up for this bingo.", 403);
  }

  const tile = board.tiles[match.tileIndex];
  const required = Math.max(1, Number.parseInt(tile.quantity ?? tile.qty ?? 1, 10) || 1);
  const completed = Math.max(0, Number.parseInt(tile.completedQuantity ?? 0, 10) || 0);
  const remaining = Math.max(1, required - completed);
  const proofId = crypto.randomUUID();
  const proofUrl = `${getOrigin(request)}/api/bingo/proof-image?id=${encodeURIComponent(proofId)}`;

  await storeProofImage(env, proofId, imageData);

  const proof = {
    id: proofId,
    bingoId,
    tileIndex: match.tileIndex,
    team,
    player,
    url: proofUrl,
    note: `Auto-submitted by RuneLite plugin. Item ID: ${itemId}. Loot username: ${username}.`,
    quantity: Math.min(1, remaining),
    status: "pending",
    createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
    source: "runelite-plugin",
    itemid: itemId,
    submittedByDiscordId: pluginUser.discordId
  };

  board.proofs = Array.isArray(board.proofs) ? board.proofs : [];
  board.proofs.unshift(proof);
  board.proofs = board.proofs.slice(0, 300);
  tile.status = tile.status === "approved" ? "approved" : "submitted";
  tile.proofId = proofId;
  appendLog(board, `${player} auto-submitted plugin proof for ${tile.name || `Tile ${match.tileIndex + 1}`}.`);

  const discordMessageId = await notifyPendingProofDiscord(env, request, proof, {
    tileName: tile.name || `Tile ${match.tileIndex + 1}`,
    itemName: tile.name || `Item ID ${itemId}`
  });
  if (discordMessageId) proof.discordMessageId = discordMessageId;
  await saveBoard(env, board);

  return Response.json({
    success: true,
    bingoId,
    proofId,
    tileIndex: match.tileIndex,
    itemid: itemId,
    status: "pending"
  });
}
