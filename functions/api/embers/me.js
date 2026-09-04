import { requirePluginUser } from "../_pluginAuth.js";

function noStoreJson(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  return Response.json(body, { ...init, headers });
}

export async function onRequestGet({ request, env }) {
  const auth = await requirePluginUser(request, env);
  if (!auth.ok) return auth.response;

  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return noStoreJson({ error: "Missing Supabase credentials." }, { status: 500 });
  }

  const discordId = String(auth.pluginUser.discordId);
  const url =
    `${supabaseUrl}/rest/v1/balances` +
    `?select=balance,display_name,user_id` +
    `&user_id=eq.${encodeURIComponent(discordId)}` +
    `&limit=1`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json"
      }
    });
  } catch {
    return noStoreJson({ error: "Could not load Ember balance." }, { status: 502 });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return noStoreJson(
      { error: "Could not load Ember balance.", status: response.status },
      { status: 502 }
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  const balance = Number(row?.balance);

  return noStoreJson({
    version: 1,
    member: {
      discordId,
      displayName: row?.display_name || auth.pluginUser.displayName || "Unknown member",
      rsn: auth.pluginUser.rsn || auth.pluginUser.displayName || ""
    },
    balance: Number.isFinite(balance) ? balance : 0,
    found: Boolean(row),
    fetchedAt: new Date().toISOString()
  });
}
