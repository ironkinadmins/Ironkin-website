const INDEX_KEY = "bingo:archive:index:v1";

export async function onRequestGet({ env }) {
  const raw = await env.DROPS_KV.get(INDEX_KEY);
  const archive = raw ? JSON.parse(raw) : [];
  archive.sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
  return Response.json({ archive }, { headers: { "Cache-Control": "no-store" } });
}
