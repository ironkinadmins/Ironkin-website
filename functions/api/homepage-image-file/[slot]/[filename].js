const TYPES={png:"image/png",jpg:"image/jpeg",webp:"image/webp"};
const SLOTS=new Set(["hero","games","flame","events","profiles"]);
export async function onRequestGet({params,env,request}) {
  const {slot,filename}=params;
  if (!SLOTS.has(slot) || !/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(filename)) return new Response("Not found",{status:404});
  if (!env.HOMEPAGE_IMAGES) return new Response("Image storage unavailable",{status:503});
  const object=await env.HOMEPAGE_IMAGES.get(`${slot}/${filename}`);
  if (!object) return new Response("Not found",{status:404});
  const ext=filename.split(".").pop();
  return new Response(request.method==="HEAD"?null:object.body,{headers:{"Content-Type":TYPES[ext],"Cache-Control":"public, max-age=3600, immutable","X-Content-Type-Options":"nosniff"}});
}
export const onRequestHead=onRequestGet;
