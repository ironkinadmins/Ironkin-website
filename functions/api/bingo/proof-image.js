function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (!id) {
    return jsonError("Missing proof image id.", 400);
  }

  const imageData = await env.DROPS_KV.get(`bingo:proof-image:${id}`);
  if (!imageData) {
    return jsonError("Proof image not found.", 404);
  }

  const bytes = Uint8Array.from(atob(imageData), char => char.charCodeAt(0));

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=604800"
    }
  });
}
