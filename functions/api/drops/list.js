import { readDropsWithClanGoalFallback } from "./_dropKeys.js";
import { hasSupabase, supabaseRest } from "../_supabase.js";

async function resolveWebsiteEventId(env, requestedEventId) {
  const raw = await env.DROPS_KV.get("events:active");
  let events = [];
  try { events = raw ? JSON.parse(raw) : []; } catch { events = []; }
  const match = (Array.isArray(events) ? events : []).find(event =>
    String(event?.id || "") === requestedEventId || String(event?.pluginEventId || "") === requestedEventId
  );
  return String(match?.id || requestedEventId || "global");
}

async function approvedCounts(env, websiteEventId) {
  if (!hasSupabase(env)) return null;
  const response = await supabaseRest(
    env,
    `ironkin_event_submissions?select=item_id,item_name,quantity&website_event_id=eq.${encodeURIComponent(websiteEventId)}&status=eq.approved`
  );
  const rows = await response.json();
  const byId = new Map();
  const byName = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const quantity = Math.max(0, Number(row?.quantity || 0));
    const id = Number(row?.item_id || 0);
    const name = String(row?.item_name || "").trim().toLowerCase();
    if (Number.isInteger(id) && id > 0) byId.set(id, (byId.get(id) || 0) + quantity);
    if (name) byName.set(name, (byName.get(name) || 0) + quantity);
  }
  return { byId, byName };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") || "global";
  const result = await readDropsWithClanGoalFallback(env, eventId);

  let drops = Array.isArray(result.drops) ? result.drops : [];
  let countSource = "legacy-kv";
  try {
    const websiteEventId = await resolveWebsiteEventId(env, eventId);
    const counts = await approvedCounts(env, websiteEventId);
    if (counts) {
      drops = drops.map(drop => {
        const itemId = Number(drop?.itemId || 0);
        const byId = Number.isInteger(itemId) && itemId > 0 ? counts.byId.get(itemId) : undefined;
        const byName = counts.byName.get(String(drop?.name || "").trim().toLowerCase());
        return { ...drop, count: Number(byId ?? byName ?? 0) };
      });
      countSource = "supabase-approved";
    }
  } catch (error) {
    // Keep the existing KV count as a safe fallback if Supabase is unavailable.
    console.warn("Could not load approved Supabase drop counts:", error?.message || error);
  }

  return Response.json({
    eventId: result.eventId,
    drops,
    migratedFrom: result.migratedFrom || null,
    countSource
  });
}
