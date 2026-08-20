import { hybridKv } from "../../../_hybridKv.js";
const INDEX_KEY = "bingo:archive:index:v1";

export async function onRequestGet({ env }) {
  const raw = await hybridKv(env, "drops").get(INDEX_KEY);
  const archive = raw ? JSON.parse(raw) : [];
  archive.sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
  return Response.json({ archive }, { headers: { "Cache-Control": "no-store" } });
}
