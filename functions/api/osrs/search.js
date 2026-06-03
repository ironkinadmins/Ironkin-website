export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return Response.json([]);
  }

  try {
    const apiUrl =
      "https://oldschool.runescape.wiki/api.php?" +
      new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: q,
        gsrlimit: "10",
        prop: "pageimages|info",
        piprop: "thumbnail|original",
        pithumbsize: "64",
        inprop: "url",
        origin: "*",
      });

    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Ironkin Clan Website - OSRS Wiki item search",
      },
    });

    const data = await res.json();
    const pages = data?.query?.pages || {};

    const results = Object.values(pages).map((page) => ({
      name: page.title,
      image:
        page.thumbnail?.source ||
        page.original?.source ||
        "",
      url: page.fullurl || "",
    }));

    return Response.json(results, {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Could not search OSRS Wiki" },
      { status: 500 }
    );
  }
}
const results = (Array.isArray(data) ? data : data.results || [])
  .filter(item =>
    item.name &&
    item.image
  );
  