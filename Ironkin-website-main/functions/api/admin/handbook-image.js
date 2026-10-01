import { getSession, isStaffSession } from "../_auth.js";
import { getSupabaseKey, hasSupabase } from "../_supabase.js";

const BUCKET = "ironkin-handbook";
const MAX_BYTES = 6 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function storageHeaders(env, extra = {}) {
  const key = getSupabaseKey(env);
  const headers = new Headers(extra);
  headers.set("apikey", key);
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function safeExt(type) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  return map[type] || "";
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return json({ error: "Staff access required." }, 403);
  if (!hasSupabase(env)) return json({ error: "Supabase is not configured." }, 500);

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Choose an image to upload." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "Images must be 6 MB or smaller." }, 400);

    const ext = safeExt(file.type);
    if (!ext) return json({ error: "Only PNG, JPG, WEBP, and GIF images are supported." }, 400);

    const path = `staff-handbook/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const base = cleanBaseUrl(env.SUPABASE_URL);
    const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: storageHeaders(env, {
        "Content-Type": file.type,
        "x-upsert": "false"
      }),
      body: file
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Image upload failed (${response.status}): ${text || response.statusText}`);
    }

    return json({
      ok: true,
      path,
      url: `/api/handbook-image?path=${encodeURIComponent(path)}`
    });
  } catch (error) {
    return json({ error: error.message || "Could not upload image." }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return json({ error: "Staff access required." }, 403);
  if (!hasSupabase(env)) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await request.json().catch(() => ({}));
    const path = String(body?.path || "");
    if (!path.startsWith("staff-handbook/")) return json({ error: "Invalid image path." }, 400);

    const base = cleanBaseUrl(env.SUPABASE_URL);
    const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: storageHeaders(env)
    });
    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => "");
      throw new Error(`Image delete failed (${response.status}): ${text || response.statusText}`);
    }
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || "Could not delete image." }, 500);
  }
}
