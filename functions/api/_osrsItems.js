const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";

export async function getOsrsItemMapping() {
  const response = await fetch(MAPPING_URL, {
    headers: { "User-Agent": "Ironkin Clan Website - event item lookup" }
  });
  if (!response.ok) throw new Error("Could not load OSRS item mapping.");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function resolveOsrsItemIdByName(name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  const mapping = await getOsrsItemMapping();
  const exact = mapping.find(item => String(item?.name || "").trim().toLowerCase() === target);
  const id = Number(exact?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
