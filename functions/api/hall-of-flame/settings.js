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
    let channels=[],roles=[];
    if(env.DISCORD_GUILD_ID&&env.DISCORD_BOT_TOKEN){
      const [channelRows,roleRows]=await Promise.all([discord(env,`/guilds/${env.DISCORD_GUILD_ID}/channels`),discord(env,`/guilds/${env.DISCORD_GUILD_ID}/roles`)]);
      channels=channelRows.filter(c=>[0,5].includes(Number(c.type))).sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)).map(c=>({id:c.id,name:c.name,type:c.type}));
      roles=roleRows.filter(r=>r.name!=="@everyone").sort((a,b)=>(Number(b.position)||0)-(Number(a.position)||0)).map(r=>({id:r.id,name:r.name}));
    }
    return json({settings,channels,roles,configured:Boolean(env.DISCORD_BOT_TOKEN&&settings.channelId)});
  }catch(e){return json({error:e.message||"Could not load Discord settings."},500);}
}
export async function onRequestPost({request,env}){
  if(!await staff(request,env)) return json({error:"Staff access required."},403);
  const body=await request.json().catch(()=>({}));
  try{
    if(body.action==="save"){
      const channelId=String(body.channelId||"").trim(),reviewChannelId=String(body.reviewChannelId||"").trim(),pingRoleId=String(body.pingRoleId||"").trim();
      if(!channelId) return json({error:"Choose a public Hall of Flame channel."},400);
      const channel=await discord(env,`/channels/${channelId}`);
      if(String(channel.guild_id||"")!==String(env.DISCORD_GUILD_ID||"")) return json({error:"That public channel is not in the configured Ironkin Discord server."},400);
      let reviewChannelName="",pingRoleName="";
      if(reviewChannelId){const review=await discord(env,`/channels/${reviewChannelId}`);if(String(review.guild_id||"")!==String(env.DISCORD_GUILD_ID||""))return json({error:"That review channel is not in the configured Ironkin Discord server."},400);reviewChannelName=review.name;}
      if(pingRoleId){const roles=await discord(env,`/guilds/${env.DISCORD_GUILD_ID}/roles`);const role=roles.find(r=>String(r.id)===pingRoleId);if(!role)return json({error:"That ping role was not found in the Ironkin Discord server."},400);pingRoleName=role.name;}
      const settings=await saveHallOfFlameDiscordSettings(env,{channelId,channelName:channel.name,reviewChannelId,reviewChannelName,pingRoleId,pingRoleName});
      return json({ok:true,settings});
    }
    if(body.action==="test"){
      const settings=await getHallOfFlameDiscordSettings(env);
      if(!settings.channelId) return json({error:"Choose and save a public Hall of Flame channel first."},400);
      await discord(env,`/channels/${settings.channelId}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({embeds:[{title:"🔥 Ironkin Hall of Flame",description:"Public record-board sync is connected.",color:16742144}]})});
      let reviewSent=false;
      if(settings.reviewChannelId){await discord(env,`/channels/${settings.reviewChannelId}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:settings.pingRoleId?`<@&${settings.pingRoleId}>`:"",allowed_mentions:{roles:settings.pingRoleId?[settings.pingRoleId]:[]},embeds:[{title:"Hall of Flame review notifications",description:"New PB review notifications will be posted here.",color:16742144}]})});reviewSent=true;}
      return json({ok:true,reviewSent});
    }
    return json({error:"Unknown action."},400);
  }catch(e){return json({error:e.message||"Discord settings update failed."},500);}
}
