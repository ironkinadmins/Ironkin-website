import { hybridKv } from "./_hybridKv.js";
const parse=(v,d)=>{try{return v?JSON.parse(v):d;}catch{return d;}};
const tz="America/Toronto";
function localTime(date=new Date()) {const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);const f=k=>p.find(x=>x.type===k)?.value;return `${f("year")}-${f("month")}-${f("day")}T${f("hour")}:${f("minute")}`;}
const shift=(d,n)=>new Date(Date.parse(`${d}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
export function nextNominationWindow(config,type,now=new Date()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config?.startDate||"")||!["botw","sotw"].includes(type))return null;
  const today=localTime(now).slice(0,10);
  for(let i=0;i<208;i+=2){const date=shift(config.startDate,i*7);const kind=i%4===0?config.firstEvent:config.firstEvent==="botw"?"sotw":"botw";
    if(kind!==type||date<today)continue;
    const lead=date==="2026-11-13"&&type==="botw"?4:7;
    const deadline=`${shift(date,-lead)}T${config.startTime||"15:00"}`;
    return {date,deadline,open:localTime(now)<deadline,reminderDue:localTime(now)>=`${shift(date,-lead-2)}T${config.startTime||"15:00"}`&&localTime(now)<deadline};
  }return null;
}
export async function sendNominationDm(env,discordId,type,deadline,kind){
  if(!env.DISCORD_BOT_TOKEN)throw Error("Discord bot token not configured");
  const headers={Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,"Content-Type":"application/json"};
  const dm=await fetch("https://discord.com/api/v10/users/@me/channels",{method:"POST",headers,body:JSON.stringify({recipient_id:discordId})});
  if(!dm.ok)throw Error(`Discord DM channel HTTP ${dm.status}`);
  const channel=await dm.json();
  const site=String(env.SITE_URL||"https://ironkinclan.com").replace(/\/+$/,"");
  const pretty=deadline?`${deadline.replace("T"," ")} Eastern`:"the published deadline";
  const description=kind==="reminder"?`Your two ${type.toUpperCase()} nominations are still missing. Please submit them before **${pretty}**. If you do not submit, eligible random options will fill the remaining slots.`:`Congratulations! You can choose **two** options for the next ${type.toUpperCase()} poll. The third option is selected randomly.\n\n**Nomination deadline:** ${pretty}.`;
  const sent=await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`,{method:"POST",headers,body:JSON.stringify({embeds:[{title:kind==="reminder"?`Reminder: ${type.toUpperCase()} nominations`:`Your next ${type.toUpperCase()} picks`,description:`${description}\n\n[Submit your nominations](${site}/events.html#ikNominationPanel)`,color:15891968}],allowed_mentions:{parse:[]}})});
  if(!sent.ok)throw Error(`Discord DM message HTTP ${sent.status}`);
  const result=await sent.json().catch(()=>({}));return {messageId:String(result.id||""),channelId:String(channel.id)};
}
export async function nominationNoticeStatus(env,type){
  const kv=hybridKv(env,"drops");const statuses=parse(await kv.get("events:sotw-botw-winner-status:v1"),{});
  const status=statuses[type];const config=parse(await kv.get("events:sotw-botw-cycle:v1"),{});
  const window=nextNominationWindow(config,type);
  const noticeKey=status?.eventId?`events:sotw-botw-winner-notice:${type}:${status.eventId}`:null;
  const notice=noticeKey?parse(await kv.get(noticeKey),null):null;
  const nominations=parse(await kv.get("events:sotw-botw-nominations:v1"),{});
  const complete=status?.discordId&&nominations[type]?.discordId===status.discordId&&Array.isArray(nominations[type]?.options)&&nominations[type].options.length===2;
  return {type,status,window,notice,noticeKey,complete:!!complete,kv};
}
export async function processNominationReminder(env,type){
  const info=await nominationNoticeStatus(env,type);const {status,window,notice,noticeKey,complete,kv}=info;
  if(status?.state!=="resolved"||!status.discordId||!window?.reminderDue||complete||notice?.state!=="sent"||notice?.reminder?.state==="sent")return {action:"skipped"};
  // A reminder is claimed before the external call; uncertain outcomes are reviewed, never blindly resent.
  if(notice?.reminder?.state==="sending"||notice?.reminder?.state==="needs_review")return {action:"needs_review"};
  const claimed={...notice,reminder:{state:"sending",attemptedAt:new Date().toISOString()}};
  await kv.put(noticeKey,JSON.stringify(claimed));
  try {const receipt=await sendNominationDm(env,status.discordId,type,window.deadline,"reminder");await kv.put(noticeKey,JSON.stringify({...claimed,reminder:{state:"sent",sentAt:new Date().toISOString(),...receipt}}));return {action:"sent"};}
  catch(error){await kv.put(noticeKey,JSON.stringify({...claimed,reminder:{state:"needs_review",failedAt:new Date().toISOString(),error:String(error.message||error).slice(0,200)}}));return {action:"needs_review"};}
}
