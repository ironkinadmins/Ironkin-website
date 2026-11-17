import { hasSupabase, supabaseRest } from "./_supabase.js";
const reply = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function onRequestGet({request,env}) {
  const secret = String(env.INFO_HUB_SECRET||"");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) return reply({error:"Unauthorized"},401);
  if (!hasSupabase(env)) return reply({error:"Database unavailable"},503);
  const channel = new URL(request.url).searchParams.get("channel");
  if (!['clan-info','rank-info'].includes(channel)) return reply({error:"Invalid channel"},400);
  try {
    const path=`ironkin_discord_info_sections?channel_key=eq.${channel}&published_enabled=eq.true&published_at=not.is.null&select=id,published_title,published_description,published_images,published_sort_order&order=published_sort_order.asc,id.asc`;
    const result=await supabaseRest(env,path);
    if (!result.ok) {
      const details=(await result.text()).slice(0,500);
      console.error("info-hub Supabase failure",result.status,details);
      return reply({error:"Failed to load published topics",upstream_status:result.status},502);
    }
    const rows=await result.json();
    return reply({sections:rows.map(r=>({id:r.id,title:r.published_title,
      description:r.published_description,images:r.published_images||[],sort_order:r.published_sort_order}))});
  } catch (e) {console.error("info-hub API failure",String(e));return reply({error:"Information unavailable"},503);}
}
