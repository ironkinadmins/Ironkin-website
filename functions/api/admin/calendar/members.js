import {getSession,canManageCalendarSession} from "../../_auth.js";
export async function onRequestGet({request,env}) {
  if (!canManageCalendarSession(await getSession(request,env))) return Response.json({error:"Staff only"},{status:403});
  const q=(new URL(request.url).searchParams.get("q")||"").trim();
  if(q.length<2)return Response.json({members:[]});
  if(!env.DISCORD_BOT_TOKEN||!env.DISCORD_GUILD_ID)return Response.json({members:[]});
  const response=await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(q)}&limit=25`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
  if(!response.ok)return Response.json({error:"Discord member search unavailable"},{status:502});
  const rows=await response.json();
  return Response.json({members:rows.filter(m=>m.user?.id).map(m=>({id:m.user.id,name:m.nick||m.user.global_name||m.user.username}))},{headers:{"Cache-Control":"no-store"}});
}
