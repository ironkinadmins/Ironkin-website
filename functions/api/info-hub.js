import { hasSupabase, supabaseRest } from "./_supabase.js";
const reply = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function onRequestGet({request,env}) {
  const secret = String(env.INFO_HUB_SECRET||"");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) return reply({error:"Unauthorized"},401);
  if (!hasSupabase(env)) return reply({error:"Database unavailable"},503);
  const channel = new URL(request.url).searchParams.get("channel");
  if (!['clan-info','rank-info'].includes(channel)) return reply({error:"Invalid channel"},400);
  try {
    const path=`ironkin_discord_info_sections?channel_key=eq.${channel}&enabled=eq.true&published_at=not.is.null&select=id,title,description,image_url,images,sort_order&order=sort_order.asc,id.asc`;
    const result=await supabaseRest(env,path);
    if (!result.ok) return reply({error:"Failed to load published topics"},502);
    return reply({sections:await result.json()});
  } catch (_) {return reply({error:"Information unavailable"},503);}
}
