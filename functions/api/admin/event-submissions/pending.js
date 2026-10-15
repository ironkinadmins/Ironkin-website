import { getSession, isStaffSession } from "../../_auth.js";
import { supabaseRest } from "../../_supabase.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return Response.json({ error: "Staff only." }, { status: 403 });
  try {
    const response = await supabaseRest(env,
      "ironkin_event_submissions?select=id,website_event_id,item_name,quantity,player_name,proof_url,created_at&status=eq.pending&order=created_at.asc&limit=200");
    const submissions = await response.json();
    return Response.json({ submissions: Array.isArray(submissions) ? submissions : [] },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Event submissions unavailable." }, { status: 503 });
  }
}
