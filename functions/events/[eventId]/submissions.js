import { requirePluginUser } from "../../api/_pluginAuth.js";
import { listTrackedItems, insertEventSubmission, findActiveDuplicateSubmission } from "../../api/_supabase.js";
import { makePluginEventId } from "../../api/_pluginEvents.js";

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
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

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const auth = await requirePluginUser(request, env);
  if (!auth.ok) return auth.response;
  const pluginUser = auth.pluginUser;
  const requestedEventId = String(params.eventId || "").trim();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const username = String(body.username || pluginUser?.displayName || "").trim();
  const itemId = asPositiveInt(body.itemid ?? body.itemId);
  const quantity = Math.max(1, asPositiveInt(body.quantity) || 1);
  const participants = normalizeParticipants(body.participants, username);
  const timestamp = Number(body.timestamp || Date.now());
  if (!username) return Response.json({ error: "Missing username." }, { status: 400 });
  if (!itemId) return Response.json({ error: "Missing or invalid itemid." }, { status: 400 });

  const events = safeJson(await env.DROPS_KV.get("events:active"), []);
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
  if (!event) return Response.json({ error: "Event is not active or does not accept plugin drops." }, { status: 404 });

  const websiteEventId = String(event.id || "");
  const rows = await listTrackedItems(env);
  const tracked = rows.find(row => String(row.website_event_id) === websiteEventId && Number(row.item_id) === itemId);
  if (!tracked) return Response.json({ error: "That item is not tracked for this event." }, { status: 404 });

  const trackingRule = ["repeatable", "once_per_player", "once_per_event"].includes(String(tracked.tracking_rule || "")) ? String(tracked.tracking_rule) : "repeatable";
  const discordId = String(pluginUser?.discordId || "");
  const playerKey = normalizePlayerKey(discordId, username);
  const clientTimestamp = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
  // Protect against HTTP retries/double firing even for repeatable items.
  const clientSubmissionKey = await sha256Hex(`${requestedEventId}|${playerKey}|${itemId}|${quantity}|${clientTimestamp}`);
  const duplicate = await findActiveDuplicateSubmission(env, { pluginEventId: requestedEventId, itemId, trackingRule, playerKey, clientSubmissionKey });
  if (duplicate) {
    return Response.json({
      success: true,
      duplicate: true,
      duplicateReason: duplicate.reason,
      submissionId: duplicate.id,
      eventId: requestedEventId,
      itemid: itemId,
      status: duplicate.status
    }, { status: 200 });
  }

  let proofUrl = "";
  const imageData = cleanBase64Image(body.imageData);
  if (imageData) {
    if (base64ByteLength(imageData) > MAX_IMAGE_BYTES) return Response.json({ error: "imageData is too large." }, { status: 413 });
    const proofId = crypto.randomUUID();
    await env.DROPS_KV.put(`event-submission-image:${proofId}`, imageData, { metadata: { contentType: "image/png", createdAt: new Date().toISOString() } });
    proofUrl = `${new URL(request.url).origin}/api/event-submission-image?id=${encodeURIComponent(proofId)}`;
  }

  const submissionId = crypto.randomUUID();
  const record = await insertEventSubmission(env, {
    id: submissionId,
    plugin_event_id: requestedEventId,
    website_event_id: websiteEventId,
    event_type: String(event.type || ""),
    event_name: String(event.title || event.label || requestedEventId),
    player_name: username,
    discord_id: discordId,
    player_key: playerKey,
    item_id: itemId,
    item_name: String(tracked.item_name || body.itemName || `Item ${itemId}`),
    quantity,
    participants,
    tracking_rule: trackingRule,
    client_submission_key: clientSubmissionKey,
    source: "runelite",
    status: "pending",
    proof_url: proofUrl,
    client_timestamp: clientTimestamp
  });

  return Response.json({ success: true, submissionId: record?.id || submissionId, eventId: requestedEventId, itemid: itemId, participants, status: "pending" }, { status: 201 });
}
