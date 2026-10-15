import { hybridKv } from "../_hybridKv.js";

export async function appendAdminAudit(env, session, action, summary, reference) {
  try {
    const kv = hybridKv(env, "drops");
    const raw = await kv.get("admin:audit:v1");
    const records = raw ? JSON.parse(raw) : [];
    const history = Array.isArray(records) ? records : [];
    history.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: String(session?.id || ""),
      actorName: String(session?.nick || session?.global_name || session?.username || "Staff").slice(0, 80),
      action: String(action).slice(0, 80),
      summary: String(summary).slice(0, 200),
      reference: String(reference || "").slice(0, 120)
    });
    await kv.put("admin:audit:v1", JSON.stringify(history.slice(0, 250)));
  } catch (error) {
    console.warn("Admin audit unavailable:", error?.message || error);
  }
}
