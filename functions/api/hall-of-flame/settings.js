import { getSession, isStaffSession } from "../_auth.js";
import { getHallOfFlameDiscordSettings, saveHallOfFlameDiscordSettings } from "./_records.js";

const h={"Cache-Control":"no-store"};
const json=(body,status=200)=>Response.json(body,{status,headers:h});
async function staff(request,env){const s=await getSession(request,env);return isStaffSession(s)?s:null;}
async function discord(env,path,options={}){
  if(!env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  const r=await fetch(`https://discord.com/api/v10${path}`,{...options,headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data?.message||`Discord request failed (${r.status}).`);
  return data;
}
export async function onRequestGet({request,env}){
  if(!await staff(request,env)) return json({error:"Staff access required."},403);
  try{
    const settings=await getHallOfFlameDiscordSettings(env);
    let channels=[];
    if(env.DISCORD_GUILD_ID&&env.DISCORD_BOT_TOKEN){
      const rows=await discord(env,`/guilds/${env.DISCORD_GUILD_ID}/channels`);
      channels=rows.filter(c=>[0,5].includes(Number(c.type))).sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)).map(c=>({id:c.id,name:c.name,type:c.type}));
    }
    return json({settings,channels,configured:Boolean(env.DISCORD_BOT_TOKEN&&settings.channelId)});
  }catch(e){return json({error:e.message||"Could not load Discord settings."},500);}
}
export async function onRequestPost({request,env}){
  if(!await staff(request,env)) return json({error:"Staff access required."},403);
  const body=await request.json().catch(()=>({}));
  try{
    if(body.action==="save"){
      const channelId=String(body.channelId||"").trim();
      if(!channelId) return json({error:"Choose a Discord channel."},400);
      const channel=await discord(env,`/channels/${channelId}`);
      if(String(channel.guild_id||"")!==String(env.DISCORD_GUILD_ID||"")) return json({error:"That channel is not in the configured Ironkin Discord server."},400);
      const settings=await saveHallOfFlameDiscordSettings(env,{channelId,channelName:channel.name});
      return json({ok:true,settings});
    }
    if(body.action==="test"){
      const settings=await getHallOfFlameDiscordSettings(env);
      if(!settings.channelId) return json({error:"Choose and save a Hall of Flame channel first."},400);
      const sent=await discord(env,`/channels/${settings.channelId}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({embeds:[{title:"🔥 Ironkin Hall of Flame",description:"Discord integration test successful. This channel is ready for Hall of Flame record boards.",color:16742144}]})});
      return json({ok:true,messageId:sent.id});
    }
    return json({error:"Unknown action."},400);
  }catch(e){return json({error:e.message||"Discord settings update failed."},500);}
}
