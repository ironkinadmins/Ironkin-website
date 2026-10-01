import { hybridKv } from "../_hybridKv.js";
export async function onRequestGet({ request, env }) {
  const id = String(new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return new Response("Missing image id.", { status: 400 });
  const image = await hybridKv(env, "drops").get(`event-submission-image:${id}`);
  if (!image) return new Response("Image not found.", { status: 404 });
  try {
    const bytes = Uint8Array.from(atob(image), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=604800" } });
  } catch {
    return new Response("Invalid image.", { status: 500 });
  }
}
