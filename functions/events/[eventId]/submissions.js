import { listTrackedItems, insertEventSubmission } from "../../api/_supabase.js";
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

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const pluginUser = context.data?.pluginUser || null;
  const requestedEventId = String(params.eventId || "").trim();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const username = String(body.username || pluginUser?.displayName || "").trim();
  const itemId = asPositiveInt(body.itemid ?? body.itemId);
  const quantity = Math.max(1, asPositiveInt(body.quantity) || 1);
  const timestamp = Number(body.timestamp || Date.now());
  if (!username) return Response.json({ error: "Missing username." }, { status: 400 });
  if (!itemId) return Response.json({ error: "Missing or invalid itemid." }, { status: 400 });

  const events = safeJson(await env.DROPS_KV.get("events:active"), []);
  const event = (Array.isArray(events) ? events : []).find(entry => entry?.active === true && entry?.dropsEnabled === true && makePluginEventId(entry) === requestedEventId);
  if (!event) return Response.json({ error: "Event is not active or does not accept plugin drops." }, { status: 404 });

  const websiteEventId = String(event.id || "");
  const rows = await listTrackedItems(env);
  const tracked = rows.find(row => String(row.website_event_id) === websiteEventId && Number(row.item_id) === itemId);
  if (!tracked) return Response.json({ error: "That item is not tracked for this event." }, { status: 404 });

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
    discord_id: String(pluginUser?.discordId || ""),
    item_id: itemId,
    item_name: String(tracked.item_name || body.itemName || `Item ${itemId}`),
    quantity,
    source: "runelite",
    status: "pending",
    proof_url: proofUrl,
    client_timestamp: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
  });

  return Response.json({ success: true, submissionId: record?.id || submissionId, eventId: requestedEventId, itemid: itemId, status: "pending" }, { status: 201 });
}
