function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

export function hasSupabase(env) {
  return Boolean(cleanBaseUrl(env.SUPABASE_URL) && String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "").trim());
}

export function getSupabaseKey(env) {
  return String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export async function supabaseRest(env, path, options = {}) {
  const base = cleanBaseUrl(env.SUPABASE_URL);
  const key = getSupabaseKey(env);
  if (!base || !key) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in Cloudflare.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("apikey", key);
  // New sb_secret_* keys are sent via apikey only. Legacy service_role JWTs
  // also need Authorization for PostgREST role authentication.
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${key}`);
  if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${base}/rest/v1/${path.replace(/^\//, "")}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase request failed (${response.status}): ${text || response.statusText}`);
  }
  return response;
}

export async function listTrackedItems(env) {
  if (!hasSupabase(env)) return [];
  const response = await supabaseRest(env, "ironkin_event_items?select=website_event_id,item_id,item_name,image_url,wiki_url,reward_embers,tracking_rule&order=website_event_id.asc,item_name.asc");
  return response.json();
}

export async function upsertTrackedItem(env, item) {
  if (!hasSupabase(env)) return { synced: false, reason: "missing-supabase" };
  const response = await supabaseRest(env, "ironkin_event_items?on_conflict=website_event_id,item_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      website_event_id: String(item.websiteEventId),
      item_id: Number(item.itemId),
      item_name: String(item.itemName || ""),
      image_url: String(item.imageUrl || ""),
      wiki_url: String(item.wikiUrl || ""),
      reward_embers: Math.max(0, Number(item.rewardEmbers || 0)),
      tracking_rule: ["repeatable", "once_per_player", "once_per_event"].includes(String(item.trackingRule || "")) ? String(item.trackingRule) : "repeatable",
      updated_at: new Date().toISOString()
    }])
  });
  return { synced: true, rows: await response.json().catch(() => []) };
}

export async function deleteTrackedItem(env, websiteEventId, itemId) {
  if (!hasSupabase(env) || !Number.isInteger(Number(itemId))) return { synced: false };
  await supabaseRest(env, `ironkin_event_items?website_event_id=eq.${encodeURIComponent(websiteEventId)}&item_id=eq.${encodeURIComponent(Number(itemId))}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  return { synced: true };
}

export async function findActiveDuplicateSubmission(env, { pluginEventId, itemId, trackingRule, playerKey, clientSubmissionKey }) {
  if (!hasSupabase(env)) return null;
  const fields = "id,status,player_name,item_name,created_at";
  if (clientSubmissionKey) {
    const r = await supabaseRest(env, `ironkin_event_submissions?select=${fields}&client_submission_key=eq.${encodeURIComponent(clientSubmissionKey)}&limit=1`);
    const rows = await r.json();
    if (rows?.[0]) return { ...rows[0], reason: "same_submission" };
  }
  if (trackingRule === "once_per_event") {
    const r = await supabaseRest(env, `ironkin_event_submissions?select=${fields}&plugin_event_id=eq.${encodeURIComponent(pluginEventId)}&item_id=eq.${encodeURIComponent(Number(itemId))}&tracking_rule=eq.once_per_event&status=neq.rejected&limit=1`);
    const rows = await r.json();
    if (rows?.[0]) return { ...rows[0], reason: "once_per_event" };
  }
  if (trackingRule === "once_per_player" && playerKey) {
    const r = await supabaseRest(env, `ironkin_event_submissions?select=${fields}&plugin_event_id=eq.${encodeURIComponent(pluginEventId)}&item_id=eq.${encodeURIComponent(Number(itemId))}&tracking_rule=eq.once_per_player&player_key=eq.${encodeURIComponent(playerKey)}&status=neq.rejected&limit=1`);
    const rows = await r.json();
    if (rows?.[0]) return { ...rows[0], reason: "once_per_player" };
  }
  return null;
}

export async function insertEventSubmission(env, submission) {
  const response = await supabaseRest(env, "ironkin_event_submissions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([submission])
  });
  const rows = await response.json();
  return rows?.[0] || null;
}
