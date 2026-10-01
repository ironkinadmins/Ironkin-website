import { getSession, isStaffSession } from "./_auth.js";
import { hasSupabase, supabaseRest } from "./_supabase.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return json({ error: "Staff access required." }, 403);
  if (!hasSupabase(env)) return json({ handbook: null });

  try {
    const response = await supabaseRest(
      env,
      "ironkin_staff_handbook?id=eq.main&select=id,title,document,updated_at,updated_by&limit=1"
    );
    const rows = await response.json();
    return json({ handbook: rows?.[0] || null });
  } catch (error) {
    return json({ error: error.message || "Could not load handbook." }, 500);
  }
}
