const BOARD_KEY = "bingo:state:v2";
const SIGNUPS_KEY = "bingo:signups";
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

const TEST_BINGO_ID = "test-bingo";
const TEST_BINGO_ITEMS = [{ id: 526 }];

// Website-only compatibility layer for the current RuneLite plugin.
// Add board aliases here when a tile is not a direct item name or when it means several items.
// The endpoint will also read tile.itemId / tile.itemIds / tile.items if the board stores ids later.
const ITEM_GROUPS = {
  "any nex unique": [26382, 26384, 26386, 26390, 26392, 26394, 26370, 26372, 26374],
  "any dt2 unique": [28256, 28258, 28260, 28262, 28264, 28266, 28268, 28270, 28272, 28274],
  "any virtus/vestige": [26241, 26243, 26245, 28256, 28258, 28260, 28262],
  "any virtus/vestige/axe piece": [26241, 26243, 26245, 28256, 28258, 28260, 28262, 28264, 28266, 28268, 28270],
  "any barrows item": [4708, 4710, 4712, 4714, 4716, 4718, 4720, 4722, 4724, 4726, 4728, 4730, 4732, 4734, 4736, 4738, 4745, 4747, 4749, 4751, 4753, 4755, 4757, 4759],
  "barrows items": [4708, 4710, 4712, 4714, 4716, 4718, 4720, 4722, 4724, 4726, 4728, 4730, 4732, 4734, 4736, 4738, 4745, 4747, 4749, 4751, 4753, 4755, 4757, 4759],
  "any visage": [11286, 22006, 22007, 2425],
  "god d hide shield": [23191, 23194, 23197, 23200, 23203, 23206],
  "god d'hide shield": [23191, 23194, 23197, 23200, 23203, 23206]
};

// Common direct-name shortcuts. Add more exact tile names here as needed.
const ITEM_ALIASES = {
  "dragon pickaxe": [11920],
  "broken dragon hasta": [22963],
  "broken dragon pickaxe": [22963],
  "zenyte shard": [19529],
  "berserker ring": [6737],
  "archers ring": [6733],
  "seers ring": [6731],
  "warrior ring": [6735],
  "abyssal whip": [4151],
  "trident of the seas": [11907],
  "magic fang": [12932],
  "serpentine visage": [12927],
  "tanzanite fang": [12922]
};

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

function idsFromTile(tile) {
  if (!tile) return [];

  const direct = [];
  if (tile.itemId || tile.itemID || tile.itemid) direct.push(tile.itemId || tile.itemID || tile.itemid);
  if (Array.isArray(tile.itemIds)) direct.push(...tile.itemIds);
  if (Array.isArray(tile.itemIDs)) direct.push(...tile.itemIDs);
  if (Array.isArray(tile.items)) {
    tile.items.forEach(item => {
      if (typeof item === "number" || typeof item === "string") direct.push(item);
      else direct.push(item?.id || item?.itemId || item?.itemid);
    });
  }

  const directIds = uniqueIds(direct);
  if (directIds.length) return directIds;

  const name = normalizeName(tile.name || tile.title || tile.label);
  if (!name) return [];

  return uniqueIds(ITEM_GROUPS[name] || ITEM_ALIASES[name] || []);
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

function findTileForItem(board, itemId) {
  const id = asPositiveInt(itemId);
  if (!id || !Array.isArray(board?.tiles)) return null;

  for (const [index, tile] of board.tiles.entries()) {
    if (!tile?.name) continue;
    const ids = idsFromTile(tile);
    if (ids.includes(id)) {
      return { tile, tileIndex: index };
    }
  }

  return null;
}

function getTrackedItems(board) {
  const ids = [];
  if (Array.isArray(board?.tiles)) {
    board.tiles.forEach(tile => ids.push(...idsFromTile(tile)));
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

export async function onRequestGet(context) {
  const { params, env } = context;
  const bingoId = String(params.bingoId || "").trim();

  if (bingoId === TEST_BINGO_ID) {
    return Response.json({ bingoId, items: TEST_BINGO_ITEMS });
  }
  const board = await getBoard(env);
  const items = getTrackedItems(board);

  return Response.json({ bingoId, items });
}

export async function onRequestPost(context) {
  const { request, params, env } = context;
  const bingoId = String(params.bingoId || "").trim();
  const pluginUser = pluginUserFromContext(context);
  if (bingoId === TEST_BINGO_ID) {
    return Response.json({ success: true, message: "Plugin test successful" });
  }

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

  const board = await getBoard(env);
  if (!board || !Array.isArray(board.tiles)) {
    return jsonError("Bingo board is not configured.", 404);
  }

  const match = findTileForItem(board, itemId);
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
