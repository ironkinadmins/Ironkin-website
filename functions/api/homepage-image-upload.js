import { hybridKv } from "../_hybridKv.js";
import { getSession, isStaffSession } from "./_auth.js";

const SLOTS = new Set(["hero", "games", "flame", "events", "profiles"]);
const KEY = "homepage:images:v1";
const MAX_BYTES = 8 * 1024 * 1024;
function identify(bytes) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return {ext:"png", type:"image/png"};
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return {ext:"jpg", type:"image/jpeg"};
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return {ext:"webp", type:"image/webp"};
  return null;
}
export async function onRequestPost({request, env}) {
  if (!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only"},{status:403});
  if (!env.HOMEPAGE_IMAGES) return Response.json({error:"Cloudflare R2 binding HOMEPAGE_IMAGES is not configured"},{status:503});
  const length = Number(request.headers.get("content-length")||0);
  if (length > MAX_BYTES + 100000) return Response.json({error:"Maximum file size is 8 MB"},{status:413});
  let data;
  try { data = await request.formData(); } catch { return Response.json({error:"Expected multipart form data"},{status:400}); }
  const slot = data.get("slot");
  const file = data.get("image");
  if (!SLOTS.has(slot) || !file || typeof file.arrayBuffer!=="function") return Response.json({error:"Choose a valid homepage section and image"},{status:400});
  if (file.size<1 || file.size>MAX_BYTES) return Response.json({error:"Image must be between 1 byte and 8 MB"},{status:413});
  const buffer = await file.arrayBuffer();
  const kind = identify(new Uint8Array(buffer).slice(0,16));
  if (!kind) return Response.json({error:"Upload a PNG, JPG, or WebP image"},{status:415});
  const objectKey = `${slot}/${crypto.randomUUID()}.${kind.ext}`;
  const imageUrl = `/api/homepage-image-file/${objectKey}`;
  try {
    await env.HOMEPAGE_IMAGES.put(objectKey,buffer,{httpMetadata:{contentType:kind.type},customMetadata:{slot}});
    const store = hybridKv(env,"drops");
    const raw = await store.get(KEY);
    const images = raw ? JSON.parse(raw) : {};
    images[slot] = imageUrl;
    await store.put(KEY,JSON.stringify(images));
    return Response.json({success:true,url:imageUrl,images},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    await env.HOMEPAGE_IMAGES.delete(objectKey).catch(()=>{});
    console.error("Homepage image upload failed",error);
    return Response.json({error:"Could not store the image or update homepage settings"},{status:503});
  }
}
