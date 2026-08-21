import { getSession, isStaffSession } from "./_auth.js";
import { getSupabaseKey, hasSupabase } from "./_supabase.js";

const BUCKET = "ironkin-handbook";

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function storageHeaders(env) {
  const key = getSupabaseKey(env);
  const headers = new Headers({ apikey: key });
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return new Response("Staff access required.", { status: 403 });
  if (!hasSupabase(env)) return new Response("Supabase is not configured.", { status: 500 });

  const url = new URL(request.url);
  const path = String(url.searchParams.get("path") || "");
  if (!path.startsWith("staff-handbook/")) return new Response("Invalid image path.", { status: 400 });

  const base = cleanBaseUrl(env.SUPABASE_URL);
  const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    headers: storageHeaders(env)
  });
  if (!response.ok) return new Response("Image not found.", { status: response.status });

  const headers = new Headers();
  headers.set("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(response.body, { status: 200, headers });
}
