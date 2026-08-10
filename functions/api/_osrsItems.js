const WIKI_MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const RUNELITE_ITEM_IDS_URL = "https://raw.githubusercontent.com/runelite/runelite/master/runelite-api/src/main/java/net/runelite/api/ItemID.java";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function titleFromConstant(constantName) {
  const cleaned = String(constantName || "")
    .replace(/_\d+$/g, "")
    .replace(/_/g, " ")
    .toLowerCase();

  return cleaned.replace(/\b\w/g, ch => ch.toUpperCase());
}

async function getWikiMapping() {
  const response = await fetch(WIKI_MAPPING_URL, {
    headers: { "User-Agent": "Ironkin Clan Website - event item lookup" },
    cf: { cacheTtl: 900, cacheEverything: true }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function getRuneLiteItemIds() {
  const response = await fetch(RUNELITE_ITEM_IDS_URL, {
    headers: { "User-Agent": "Ironkin Clan Website - RuneLite item ID lookup" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error("Could not load the current RuneLite item ID list.");

  const text = await response.text();
  const items = [];
  const re = /public\s+static\s+final\s+int\s+([A-Z0-9_]+)\s*=\s*(\d+)\s*;/g;
  let match;
  while ((match = re.exec(text))) {
    const id = Number(match[2]);
    if (!Number.isInteger(id) || id <= 0) continue;
    items.push({
      id,
      constant: match[1],
      name: titleFromConstant(match[1]),
      source: "runelite"
    });
  }
  if (!items.length) throw new Error("RuneLite item ID list was empty or could not be parsed.");
  return items;
}

export async function getOsrsItemMapping() {
  // RuneLite's generated ItemID.java is updated from the live game cache and is
  // the authoritative ID set for the plugin. The Wiki mapping is only used to
  // improve display names for IDs it knows about (mainly tradeable items).
  const [runelite, wiki] = await Promise.all([
    getRuneLiteItemIds(),
    getWikiMapping().catch(() => [])
  ]);

  const wikiById = new Map();
  for (const item of wiki) {
    const id = Number(item?.id);
    const name = String(item?.name || "").trim();
    if (Number.isInteger(id) && id > 0 && name) wikiById.set(id, name);
  }

  return runelite.map(item => ({
    id: item.id,
    name: wikiById.get(item.id) || item.name,
    constant: item.constant,
    source: wikiById.has(item.id) ? "runelite+wiki" : "runelite"
  }));
}

export async function resolveOsrsItemIdByName(name) {
  const target = normalize(name);
  if (!target) return null;
  const mapping = await getOsrsItemMapping();

  const exact = mapping.find(item => normalize(item?.name) === target);
  if (exact) return Number(exact.id) || null;

  // Also accept an exact RuneLite constant-name equivalent, e.g.
  // "Mr mcgroot" -> MR_MCGROOT. This does not allow fuzzy substitution.
  const targetConstant = target.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const byConstant = mapping.find(item => String(item?.constant || "").replace(/_\d+$/g, "") === targetConstant);
  const id = Number(byConstant?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
