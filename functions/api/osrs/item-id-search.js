import { getOsrsItemMapping, getCanonicalOsrsItemMapping, canonicalItemForId } from "../_osrsItems.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function compact(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = normalize(url.searchParams.get("q"));
  if (!q) return Response.json([]);

  try {
    const mapping = await getOsrsItemMapping();

    if (/^\d+$/.test(q)) {
      const lookup = canonicalItemForId(mapping, Number(q));
      if (!lookup.selected) return Response.json([]);
      if (!lookup.isCanonical && lookup.canonical) {
        return Response.json([{
          id: Number(lookup.selected.id),
          name: String(lookup.selected.name || ""),
          source: lookup.selected.source || "runelite",
          excluded: true,
          canonicalId: Number(lookup.canonical.id),
          canonicalName: String(lookup.canonical.name || "")
        }], { headers: { "Cache-Control": "public, max-age=300" } });
      }
      return Response.json([{ id: Number(lookup.selected.id), name: String(lookup.selected.name || ""), source: lookup.selected.source || "runelite" }], { headers: { "Cache-Control": "public, max-age=300" } });
    }

    const canonicalMapping = getCanonicalOsrsItemMapping(mapping);
    const qCompact = compact(q);

    const scored = canonicalMapping
      .map(item => {
        const name = String(item?.name || "").trim();
        const constant = String(item?.constant || "");
        const id = Number(item?.id);
        if (!name || !Number.isInteger(id) || id <= 0) return null;

        const n = normalize(name);
        const nCompact = compact(name);
        const constantReadable = normalize(constant.replace(/_\d+$/g, "").replace(/_/g, " "));
        let score = 99;

        // Exact canonical matches always win. RuneLite constant equivalence is
        // also exact enough to support newly-added/untradeable items whose Wiki
        // mapping has not caught up yet.
        if (n === q || nCompact === qCompact || constantReadable === q) score = 0;
        else if (n.startsWith(q)) score = 10;
        else if (n.includes(q)) score = 20;
        else return null;

        return { id, name, score, source: item.source || "runelite" };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name) || a.id - b.id)
      .slice(0, 40)
      .map(({ id, name, source }) => ({ id, name, source }));

    return Response.json(scored, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error?.message || "Could not search the current RuneLite item ID list." }, { status: 500 });
  }
}
