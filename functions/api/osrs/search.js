export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) return Response.json([]);

  try {
    const wikiUrl =
      "https://oldschool.runescape.wiki/api.php?" +
      new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
gsrsearch: `${q} "infobox item"`,
        gsrlimit: "12",
        prop: "pageimages|info",
        piprop: "thumbnail|original",
        pithumbsize: "64",
        inprop: "url",
        origin: "*"
      });

    const response = await fetch(wikiUrl, {
      headers: { "User-Agent": "Ironkin Clan Website - OSRS Wiki search" }
    });

    const data = await response.json();
    const pages = data?.query?.pages || {};

    const results = Object.values(pages)
      .map(page => ({
        name: page.title || "",
        image: page.thumbnail?.source || page.original?.source || "",
        url: page.fullurl || ""
      }))
      .filter(item => {
        if (!item.name || !item.image) return false;
        const name = item.name.toLowerCase();
        return !name.includes("category:") && !name.includes("template:") && !name.includes("module:") && !name.includes("user:");
      });

    return Response.json(results, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return Response.json({ error: "Could not search OSRS Wiki" }, { status: 500 });
  }
}
