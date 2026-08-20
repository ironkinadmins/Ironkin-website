import { getSession, isStaffSession } from "../_auth.js";
import { hasSupabase, supabaseRest, getSupabaseKey } from "../_supabase.js";

export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ ok: false, error: "Staff only." }, { status: 403 });
  }

  const configured = hasSupabase(env);
  const key = getSupabaseKey(env);
  const keyType = key.startsWith("sb_secret_") ? "sb_secret" : key.startsWith("eyJ") ? "legacy_service_role_jwt_or_jwt" : key ? "other" : "missing";
  const result = {
    ok: false,
    configured,
    urlPresent: Boolean(String(env.SUPABASE_URL || "").trim()),
    keyPresent: Boolean(key),
    keyType,
    tests: {}
  };

  if (!configured) {
    result.error = "Supabase variables are not visible to this Cloudflare Function deployment.";
    return Response.json(result, { status: 500 });
  }

  const namespace = "diagnostic";
  const testKey = `cloudflare-test-${Date.now()}`;
  const testValue = `ok-${crypto.randomUUID()}`;

  try {
    const root = await supabaseRest(env, "website_store?select=namespace,key&limit=1");
    result.tests.readTable = { ok: root.ok, status: root.status };
  } catch (error) {
    result.tests.readTable = { ok: false, error: String(error?.message || error) };
  }

  try {
    const write = await supabaseRest(env, "website_store?on_conflict=namespace,key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ namespace, key: testKey, value: testValue, updated_at: new Date().toISOString() }])
    });
    result.tests.write = { ok: write.ok, status: write.status };
  } catch (error) {
    result.tests.write = { ok: false, error: String(error?.message || error) };
  }

  try {
    const read = await supabaseRest(env, `website_store?namespace=eq.${encodeURIComponent(namespace)}&key=eq.${encodeURIComponent(testKey)}&select=value&limit=1`);
    const rows = await read.json();
    result.tests.readBack = { ok: rows?.[0]?.value === testValue, rowsFound: Array.isArray(rows) ? rows.length : 0 };
  } catch (error) {
    result.tests.readBack = { ok: false, error: String(error?.message || error) };
  }

  result.ok = Boolean(result.tests.readTable?.ok && result.tests.write?.ok && result.tests.readBack?.ok);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
