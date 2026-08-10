import { getOsrsItemMapping } from "../_osrsItems.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = normalize(url.searchParams.get("q"));
  if (!q) return Response.json([]);

  try {
    const mapping = await getOsrsItemMapping();
    const scored = mapping
      .map(item => {
        const name = String(item?.name || "").trim();
        const id = Number(item?.id);
        if (!name || !Number.isInteger(id) || id <= 0) return null;
        const n = normalize(name);
        let score = 99;
        if (n === q) score = 0;
        else if (n.startsWith(q)) score = 1;
        else if (n.includes(q)) score = 2;
        else return null;
        return { id, name, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .slice(0, 30)
      .map(({ id, name }) => ({ id, name }));

    return Response.json(scored, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return Response.json({ error: "Could not search OSRS item IDs." }, { status: 500 });
  }
}
