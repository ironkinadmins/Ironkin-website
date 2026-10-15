import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }
  try {
    const raw = await hybridKv(env, "drops").get("admin:audit:v1");
    const parsed = raw ? JSON.parse(raw) : [];
    return Response.json({ entries: Array.isArray(parsed) ? parsed.slice(0, 100) : [] },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load activity history." }, { status: 500 });
  }
}
