import { requirePluginUser } from "../_pluginAuth.js";
import { supabaseRest } from "../_supabase.js";

function noStoreJson(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  return Response.json(body, { ...init, headers });
}

export async function onRequestGet({ request, env }) {
  const auth = await requirePluginUser(request, env);
  if (!auth.ok) return auth.response;

  const discordId = String(auth.pluginUser.discordId);
  const path =
    `balances?select=balance,display_name,user_id` +
    `&user_id=eq.${encodeURIComponent(discordId)}` +
    `&limit=1`;

  let data;
  try {
    const response = await supabaseRest(env, path, {
      headers: { Accept: "application/json" }
    });
    data = await response.json();
  } catch (error) {
    console.error("Failed to load plugin Ember balance from Supabase:", error);
    return noStoreJson(
      { error: "Could not load Ember balance." },
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
