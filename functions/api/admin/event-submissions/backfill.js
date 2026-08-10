import { getSession, isStaffSession } from "../../_auth.js";
import { listTrackedItems, supabaseRest, insertEventSubmission } from "../../_supabase.js";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function playerKey(value) {
  return normalize(value).replace(/\s+/g, "-");
}

async function getStoredEvent(env, websiteEventId) {
  const raw = await env.DROPS_KV.get("events:active");
  let events = [];
  try { events = raw ? JSON.parse(raw) : []; } catch { events = []; }
  return (Array.isArray(events) ? events : []).find(event =>
    String(event?.id || "") === websiteEventId || String(event?.type || "") === websiteEventId
  ) || null;
}

async function alreadyImported(env, key) {
  const response = await supabaseRest(
    env,
    `ironkin_event_submissions?select=id,status&client_submission_key=eq.${encodeURIComponent(key)}&limit=1`
  );
  const rows = await response.json();
  return rows?.[0] || null;
}

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const websiteEventId = String(body?.websiteEventId || "").trim();
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!websiteEventId || !rows.length) {
    return Response.json({ error: "Target event and at least one row are required." }, { status: 400 });
  }

  const event = await getStoredEvent(env, websiteEventId);
  if (!event) return Response.json({ error: "Target event was not found." }, { status: 404 });
  if (!event.pluginEventId) {
    return Response.json({ error: "Target event has no Plugin Event ID. Activate and save the event first." }, { status: 400 });
  }

  const tracked = (await listTrackedItems(env)).filter(item => String(item.website_event_id) === websiteEventId);
  const trackedById = new Map(tracked.map(item => [Number(item.item_id), item]));

  const result = { imported: 0, skipped: 0, failed: 0, details: [] };

  for (const raw of rows) {
    const submissionId = String(raw?.submissionId || "").trim();
    const itemId = Number(raw?.itemId || 0);
    const playerName = String(raw?.playerName || "").trim();
    const item = trackedById.get(itemId);

    if (!submissionId || !playerName || !Number.isInteger(itemId) || itemId <= 0 || !item) {
      result.failed += 1;
      result.details.push({ submissionId, status: "failed", reason: "Missing/invalid submission ID, player, or tracked item mapping." });
      continue;
    }

    const dedupeKey = `discord-backfill:${submissionId}`;
    try {
      if (await alreadyImported(env, dedupeKey)) {
        result.skipped += 1;
        result.details.push({ submissionId, status: "skipped", reason: "Already imported." });
        continue;
      }

      const clientTimestamp = raw?.submittedAt ? new Date(raw.submittedAt) : null;
      const safeTimestamp = clientTimestamp && Number.isFinite(clientTimestamp.getTime()) ? clientTimestamp.toISOString() : null;

      await insertEventSubmission(env, {
        id: crypto.randomUUID(),
        plugin_event_id: String(event.pluginEventId),
        website_event_id: websiteEventId,
        event_type: String(event.type || websiteEventId),
        event_name: String(event.title || event.label || websiteEventId),
        player_name: playerName,
        discord_id: String(raw?.discordId || ""),
        player_key: playerKey(playerName),
        item_id: itemId,
        item_name: String(item.item_name || raw?.itemName || ""),
        quantity: Math.max(1, Number(raw?.quantity || 1)),
        // Historical staff-approved rows are preserved as-is. Current duplicate rules
        // apply prospectively to new submissions rather than deleting approved history.
        tracking_rule: "repeatable",
        client_submission_key: dedupeKey,
        source: "discord-backfill",
        status: "approved",
        proof_url: "",
        client_timestamp: safeTimestamp,
        discord_message_id: String(raw?.discordMessageId || ""),
        discord_channel_id: "",
        processed_at: safeTimestamp || new Date().toISOString(),
        processed_by: String(raw?.approvedBy || "Historical Discord approval"),
        claimed_at: null,
        error_message: "",
        created_at: safeTimestamp || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      result.imported += 1;
      result.details.push({ submissionId, status: "imported" });
    } catch (error) {
      result.failed += 1;
      result.details.push({ submissionId, status: "failed", reason: error.message || "Import failed." });
    }
  }

  return Response.json({ success: result.failed === 0, ...result });
}
