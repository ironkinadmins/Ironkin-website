import { hybridKv } from "../../_hybridKv.js";
import { requirePluginUser } from "../../api/_pluginAuth.js";
import {
  getTrackedItem,
  insertEventSubmission,
  findActiveDuplicateSubmission,
  updateEventSubmission,
  isUniqueViolation
} from "../../api/_supabase.js";
import { makePluginEventId } from "../../api/_pluginEvents.js";
import { loadGames } from "../../api/ironkin-games/_store.js";
import { resolveShoppingEvent, shoppingObjectiveForItem } from "../../api/ironkin-games/_shoppingList.js";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function safeJson(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function asPositiveInt(value) { const n = Number.parseInt(value, 10); return Number.isInteger(n) && n > 0 ? n : null; }
function cleanBase64Image(value) {
  const input = String(value || "").trim();
  const cleaned = input.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!cleaned || !/^[A-Za-z0-9+/=\r\n]+$/.test(cleaned)) return "";
  return cleaned.replace(/[\r\n]/g, "");
}
function base64ByteLength(base64) { const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0; return Math.floor((base64.length * 3) / 4) - padding; }
function normalizePlayerKey(discordId, username) { return String(discordId || username || "").trim().toLowerCase(); }
function normalizeParticipants(value, primaryUsername) {
  if (!Array.isArray(value)) return [];
  const primary = String(primaryUsername || "").trim().toLowerCase();
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    const name = String(raw || "").trim().slice(0, 64);
    const key = name.toLowerCase();
    if (!name || key === primary || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= 20) break;
  }
  return result;
}
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function duplicateResponse({ duplicate, requestedEventId: effectiveEventId, itemId, participants }) {
  return Response.json({
    success: true,
    duplicate: true,
    duplicateReason: duplicate?.reason || "unique_constraint",
    submissionId: duplicate?.id || null,
    eventId: effectiveEventId,
    itemid: itemId,
    participants,
    status: duplicate?.status || "pending"
  }, { status: 200 });
}

function scheduleBackground(context, task) {
  const promise = Promise.resolve()
    .then(task)
    .catch(error => {
      console.warn("Plugin drop background work failed:", error?.message || error);
    });
  if (typeof context.waitUntil === "function") {
    context.waitUntil(promise);
    return null;
  }
  return promise;
}

async function attachProofImage(env, origin, submissionId, imageData) {
  const proofId = crypto.randomUUID();
  await hybridKv(env, "drops").put(`event-submission-image:${proofId}`, imageData, {
    metadata: { contentType: "image/png", createdAt: new Date().toISOString() }
  });
  const proofUrl = `${origin}/api/event-submission-image?id=${encodeURIComponent(proofId)}`;
  await updateEventSubmission(env, submissionId, { proof_url: proofUrl });
}

async function handlePluginSubmission(context) {
  const { request, env, params } = context;
  const auth = await requirePluginUser(request, env);
  if (!auth.ok) return auth.response;
  const pluginUser = auth.pluginUser;
  const requestedEventId = String(params.eventId || "").trim();
  let effectiveEventId = requestedEventId;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const username = String(body.username || pluginUser?.displayName || "").trim();
  const itemId = asPositiveInt(body.itemid ?? body.itemId);
  const quantity = Math.max(1, asPositiveInt(body.quantity) || 1);
  const participants = normalizeParticipants(body.participants, username);
  const timestamp = Number(body.timestamp || Date.now());
  if (!username) return Response.json({ error: "Missing username." }, { status: 400 });
  if (!itemId) return Response.json({ error: "Missing or invalid itemid." }, { status: 400 });

  const imageData = cleanBase64Image(body.imageData);
  if (imageData && base64ByteLength(imageData) > MAX_IMAGE_BYTES) {
    return Response.json({ error: "imageData is too large." }, { status: 413 });
  }

  const events = safeJson(await hybridKv(env, "drops").get("events:active"), []);
  const configured = Array.isArray(events) ? events : [];
  let event = configured.find(entry => entry?.active === true && entry?.dropsEnabled === true && makePluginEventId(entry) === requestedEventId);
  if (requestedEventId === "pvm-entry") {
    const savedPvm = configured.find(entry => entry?.id === "pvm-entry" || entry?.type === "pvm-entry");
    event = {
      ...(savedPvm || {}),
      id: "pvm-entry",
      type: "pvm-entry",
      label: "PvM Entry",
      title: savedPvm?.title || "PvM Entry",
      active: true,
      dropsEnabled: true,
      pluginEventId: "pvm-entry",
      pluginOnly: true
    };
  }
  let shopping = null;
  if (!event && requestedEventId.startsWith("ig-shopping-")) {
    const games = await loadGames(env);
    shopping = await resolveShoppingEvent(games, env, requestedEventId, pluginUser?.discordId);
    if (shopping) event = { id: requestedEventId, type: "ironkin-games-shopping-list", title: shopping.challenge.name || "Ironkin Games Shopping List", active: true, dropsEnabled: true, pluginEventId: requestedEventId };
  }
  if (!event) return Response.json({ error: "Event is not active or does not accept plugin drops." }, { status: 404 });

  let websiteEventId = String(event.id || "");
  let shoppingObjective = shopping ? shoppingObjectiveForItem(shopping.challenge, itemId) : null;
  let tracked = shopping ? shopping.progress.find(entry => entry.id === shoppingObjective?.id) : await getTrackedItem(env, websiteEventId, itemId);

  // Discord manual /submit currently routes Shopping List proofs through the
  // existing Clan Goal/Event category. If the item is not a real Clan Goal
  // tracked item, transparently route it to this player's active team Shopping
  // List instead. Real Clan Goal items always keep their normal behavior.
  const isClanGoalRoute = websiteEventId === "clan-goal" || String(event.type || "").includes("clan-goal");
  if (!tracked && !shopping && isClanGoalRoute) {
    const games = await loadGames(env);
    const activeShopping = (games?.weeks || []).flatMap(week =>
      (week?.challenges || []).map(challenge => ({ week, challenge }))
    ).filter(({ week, challenge }) => {
      if (String(challenge?.trackerType || "") !== "shopping-list") return false;
      const now = Date.now();
      const start = new Date(challenge.opensAt || week.startDate || 0).getTime();
      const end = new Date(challenge.closesAt || week.endDate || 0).getTime();
      return (!Number.isFinite(start) || now >= start) && (!Number.isFinite(end) || now <= end);
    });

    for (const entry of activeShopping) {
      const team = (games.teams || []).find(t =>
        String(t.captainDiscordId || "") === String(pluginUser?.discordId || "") ||
        (t.members || []).some(m => String(m.discordId || m.id || "") === String(pluginUser?.discordId || ""))
      );
      if (!team) break;
      const candidateEventId = `ig-shopping-${String(entry.week.id || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}-${String(entry.challenge.id || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}-${String(team.id || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}`;
      const candidate = await resolveShoppingEvent(games, env, candidateEventId, pluginUser?.discordId);
      const objective = candidate ? shoppingObjectiveForItem(candidate.challenge, itemId) : null;
      const progressItem = candidate && objective ? candidate.progress.find(x => x.id === objective.id) : null;
      if (!progressItem) continue;
      shopping = candidate;
      shoppingObjective = objective;
      tracked = progressItem;
      effectiveEventId = candidate.eventId;
      websiteEventId = candidate.eventId;
      event = { id:candidate.eventId, type:"ironkin-games-shopping-list", title:candidate.challenge.name || "Ironkin Games Shopping List", active:true, dropsEnabled:true, pluginEventId:candidate.eventId };
      break;
    }
  }

  if (!tracked || (shopping && tracked.status !== "missing")) {
    if (shopping && tracked) return Response.json({ success:true, duplicate:true, duplicateReason:"team_already_submitted", eventId:effectiveEventId, itemid:itemId, shoppingObjectiveId:tracked.id, status:tracked.status }, { status:200 });
    return Response.json({ error: "That item is not tracked for this event." }, { status: 404 });
  }

  const trackingRule = shopping ? "once_per_event" : (["repeatable", "once_per_player", "once_per_event"].includes(String(tracked.tracking_rule || "")) ? String(tracked.tracking_rule) : "repeatable");
  const discordId = String(pluginUser?.discordId || "");
  const playerKey = normalizePlayerKey(discordId, username);
  const clientTimestamp = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
  // Protect against HTTP retries/double firing even for repeatable items.
  const clientSubmissionKey = await sha256Hex(`${effectiveEventId}|${playerKey}|${itemId}|${quantity}|${clientTimestamp}`);
  const duplicateLookup = { pluginEventId: effectiveEventId, itemId, trackingRule, playerKey, clientSubmissionKey };
  const duplicate = await findActiveDuplicateSubmission(env, duplicateLookup);
  if (duplicate) return duplicateResponse({ duplicate, requestedEventId: effectiveEventId, itemId, participants });

  const submissionId = crypto.randomUUID();
  let record;
  try {
    record = await insertEventSubmission(env, {
      id: submissionId,
      plugin_event_id: effectiveEventId,
      website_event_id: websiteEventId,
      event_type: String(event.type || ""),
      event_name: String(event.title || event.label || effectiveEventId),
      player_name: username,
      discord_id: discordId,
      player_key: playerKey,
      item_id: itemId,
      item_name: String(tracked.item_name || tracked.name || body.itemName || `Item ${itemId}`),
      shopping_objective_id: shopping ? String(tracked.id || "") : "",
      quantity,
      participants,
      tracking_rule: trackingRule,
      client_submission_key: clientSubmissionKey,
      source: "runelite",
      status: "pending",
      proof_url: "",
      client_timestamp: clientTimestamp
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findActiveDuplicateSubmission(env, duplicateLookup).catch(() => null);
    return duplicateResponse({
      duplicate: existing || { reason: "unique_constraint", status: "pending" },
      requestedEventId: effectiveEventId,
      itemId,
      participants
    });
  }

  const savedId = record?.id || submissionId;
  if (imageData) {
    const origin = new URL(request.url).origin;
    const background = scheduleBackground(context, () => attachProofImage(env, origin, savedId, imageData));
    if (background) await background;
  }

  return Response.json({
    success: true,
    submissionId: savedId,
    eventId: effectiveEventId,
    itemid: itemId,
    participants,
    status: "pending"
  }, { status: 201 });
}

export async function onRequestPost(context) {
  try {
    return await handlePluginSubmission(context);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({
        success: true,
        duplicate: true,
        duplicateReason: "unique_constraint",
        retryable: false
      }, { status: 200 });
    }
    console.error("Plugin drop ingest failed:", error);
    return Response.json({
      error: "Drop ingest failed. Retry with the same timestamp.",
      retryable: true
    }, { status: 503 });
  }
}
