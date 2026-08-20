import { hasSupabase, supabaseRest } from "./api/_supabase.js";

// Hybrid Cloudflare KV -> Supabase migration adapter.
// During migration:
//   READ   Supabase first; if missing, fall back to the old KV binding and
//          opportunistically copy the value into Supabase.
//   WRITE  Supabase and the old KV binding.
//   DELETE Supabase and the old KV binding.
//
// This lets the site migrate gradually without requiring a perfect bulk export.

const TABLE = "website_store";
const cache = new WeakMap();

function oldBinding(env, namespace) {
  if (namespace === "calendar") return env?.CALENDAR_KV || null;
  return env?.DROPS_KV || null;
}

function cacheFor(env) {
  let map = cache.get(env);
  if (!map) {
    map = new Map();
    cache.set(env, map);
  }
  return map;
}

function isoExpiry(options = {}) {
  if (options?.expiration) {
    const seconds = Number(options.expiration);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  }
  if (options?.expirationTtl) {
    const seconds = Number(options.expirationTtl);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(Date.now() + seconds * 1000).toISOString();
  }
  return null;
}

function encodeText(value) {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  return String(value);
}

async function readSupabase(env, namespace, key) {
  const path = `${TABLE}?namespace=eq.${encodeURIComponent(namespace)}&key=eq.${encodeURIComponent(key)}&select=value,expires_at&limit=1`;
  const response = await supabaseRest(env, path);
  const rows = await response.json();
  const row = rows?.[0];
  if (!row) return { found: false, value: null };

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    // Preserve KV TTL semantics. Best-effort cleanup only.
    try {
      await deleteSupabase(env, namespace, key);
    } catch (error) {
      console.warn("Hybrid KV: failed to remove expired Supabase row", namespace, key, error);
    }
    return { found: true, value: null };
  }

  return { found: true, value: row.value ?? null };
}

async function writeSupabase(env, namespace, key, value, options = {}) {
  const row = {
    namespace,
    key: String(key),
    value: encodeText(value),
    metadata: options?.metadata ?? null,
    expires_at: isoExpiry(options),
    updated_at: new Date().toISOString()
  };

  await supabaseRest(env, `${TABLE}?on_conflict=namespace,key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row])
  });
}

async function deleteSupabase(env, namespace, key) {
  await supabaseRest(
    env,
    `${TABLE}?namespace=eq.${encodeURIComponent(namespace)}&key=eq.${encodeURIComponent(key)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}

function makeHybridKv(env, namespace) {
  const legacy = oldBinding(env, namespace);
  const supabaseEnabled = hasSupabase(env);
  if (!legacy && !supabaseEnabled) return null;

  return {
    async get(key) {
      key = String(key);

      if (supabaseEnabled) {
        try {
          const result = await readSupabase(env, namespace, key);
          if (result.found) return result.value;
        } catch (error) {
          // Important during cutover: a Supabase problem must not take the site down
          // while the legacy KV binding still exists.
          console.warn("Hybrid KV: Supabase read failed; using Cloudflare KV fallback", namespace, key, error);
        }
      }

      if (!legacy) return null;
      const legacyValue = await legacy.get(key);
      if (legacyValue === null || legacyValue === undefined) return null;

      // Lazy migration. A failure here does not block the current request.
      if (supabaseEnabled) {
        try {
          await writeSupabase(env, namespace, key, legacyValue);
        } catch (error) {
          console.warn("Hybrid KV: lazy migration write failed", namespace, key, error);
        }
      }

      return legacyValue;
    },

    async put(key, value, options = {}) {
      key = String(key);
      let supabaseOk = false;
      let legacyOk = false;
      let firstError = null;

      if (supabaseEnabled) {
        try {
          await writeSupabase(env, namespace, key, value, options);
          supabaseOk = true;
        } catch (error) {
          firstError ||= error;
          console.warn("Hybrid KV: Supabase write failed", namespace, key, error);
        }
      }

      if (legacy) {
        try {
          await legacy.put(key, value, options);
          legacyOk = true;
        } catch (error) {
          firstError ||= error;
          console.warn("Hybrid KV: Cloudflare KV write failed", namespace, key, error);
        }
      }

      if (!supabaseOk && !legacyOk) throw firstError || new Error(`No storage backend available for ${namespace}:${key}`);
    },

    async delete(key) {
      key = String(key);
      let supabaseOk = false;
      let legacyOk = false;
      let firstError = null;

      if (supabaseEnabled) {
        try {
          await deleteSupabase(env, namespace, key);
          supabaseOk = true;
        } catch (error) {
          firstError ||= error;
          console.warn("Hybrid KV: Supabase delete failed", namespace, key, error);
        }
      }

      if (legacy) {
        try {
          await legacy.delete(key);
          legacyOk = true;
        } catch (error) {
          firstError ||= error;
          console.warn("Hybrid KV: Cloudflare KV delete failed", namespace, key, error);
        }
      }

      if (!supabaseOk && !legacyOk) throw firstError || new Error(`No storage backend available for ${namespace}:${key}`);
    }
  };
}

export function hybridKv(env, namespace = "drops") {
  if (!env) return null;
  const normalized = namespace === "calendar" ? "calendar" : "drops";
  const map = cacheFor(env);
  if (!map.has(normalized)) map.set(normalized, makeHybridKv(env, normalized));
  return map.get(normalized);
}
