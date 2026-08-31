import { getSession, isStaffSession } from "../../../_auth.js";
import { buildEventResultsContent, buildEventResultsSnapshot, getResultsChannelId } from "../../../../_eventResultsAnnouncement.js";

export async function onRequestPost({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({ error: "Staff only." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body?.event?.id) return Response.json({ error: "Missing event." }, { status: 400 });
  try {
    const snapshot = await buildEventResultsSnapshot(env, body.event);
    return Response.json({ success: true, content: buildEventResultsContent(snapshot), channelId: getResultsChannelId(env, body.event) || null, snapshot });
  } catch (error) {
    return Response.json({ error: "Could not build the results preview.", details: error?.message || "Unknown error." }, { status: 503 });
  }
}
