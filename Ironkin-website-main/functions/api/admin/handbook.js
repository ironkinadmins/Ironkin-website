import { getSession, isStaffSession } from "../_auth.js";
import { hasSupabase, supabaseRest } from "../_supabase.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function normalizeDocument(input) {
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  if (sections.length > 100) throw new Error("The handbook cannot contain more than 100 sections.");

  return {
    version: 1,
    sections: sections.map((section, index) => {
      const title = String(section?.title || `Section ${index + 1}`).trim().slice(0, 200);
      const bodyHtml = String(section?.bodyHtml || "").slice(0, 150000);
      const id = String(section?.id || `section-${index + 1}`)
        .trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
        .slice(0, 100) || `section-${index + 1}`;
      const images = Array.isArray(section?.images) ? section.images.slice(0, 20).map(image => ({
        path: String(image?.path || "").slice(0, 500),
        caption: String(image?.caption || "").slice(0, 500)
      })).filter(image => image.path) : [];
      return {
        id,
        eyebrow: String(section?.eyebrow || "").slice(0, 120),
        title,
        bodyHtml,
        images,
        visible: section?.visible !== false
      };
    })
  };
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return json({ error: "Staff access required." }, 403);
  if (!hasSupabase(env)) return json({ error: "Supabase is not configured." }, 500);

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

export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return json({ error: "Staff access required." }, 403);
  if (!hasSupabase(env)) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await request.json();
    const title = String(body?.title || "Staff Handbook").trim().slice(0, 200) || "Staff Handbook";
    const document = normalizeDocument(body?.document || {});
    const updatedBy = String(session?.global_name || session?.username || session?.id || "staff").slice(0, 200);

    const response = await supabaseRest(env, "ironkin_staff_handbook?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{
        id: "main",
        title,
        document,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy
      }])
    });

    const rows = await response.json().catch(() => []);
    return json({ ok: true, handbook: rows?.[0] || { id: "main", title, document, updated_by: updatedBy } });
  } catch (error) {
    return json({ error: error.message || "Could not save handbook." }, 400);
  }
}
