import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({ error: "Staff only." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const settings = { showOnEventsPage: body.showOnEventsPage === true };
  await hybridKv(env, "drops").put("giveaways:settings", JSON.stringify(settings));
  return Response.json({ success: true, settings });
}
