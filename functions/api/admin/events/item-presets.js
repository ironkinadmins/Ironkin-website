import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

// Archived results already contain their tracked-drop snapshots.
// This endpoint only reads that history; it never modifies archived records.
export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }
  try {
    const raw = await hybridKv(env, "drops").get("events:archive");
    const archive = raw ? JSON.parse(raw) : [];
    const presets = (Array.isArray(archive) ? archive : [])
      .map((entry, index) => ({
        key: String(entry.id || entry.archiveRequestId || index),
        title: String(entry.title || entry.label || entry.type || "Previous event"),
        date: String(entry.endDate || entry.endedAt || "").slice(0, 10),
        drops: (Array.isArray(entry.drops) ? entry.drops : (Array.isArray(entry.snapshot?.drops) ? entry.snapshot.drops : []))
          .filter(item => item && item.name)
          .map(item => ({
            name: String(item.name),
            itemId: Number(item.itemId),
            image: String(item.image || ""),
            wikiUrl: String(item.wikiUrl || ""),
            rewardEmbers: Math.max(0, Number(item.rewardEmbers) || 0),
            trackingRule: String(item.trackingRule || "repeatable"),
            boss: String(item.boss || "")
          }))
      }))
      .filter(entry => entry.drops.length)
      .reverse()
      .map(entry => ({ ...entry, count: entry.drops.length }));
    return Response.json({ presets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Could not load archived item lists." }, { status: 500 });
  }
}
