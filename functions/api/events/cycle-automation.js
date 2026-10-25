import { hybridKv } from "../../_hybridKv.js";

const PREFIX = "events:sotw-botw-automation:v1:";
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const pairs = [["Artio","Callisto"],["Calvar'ion","Vet'ion"],["Spindel","Venenatis"],["The Nightmare","Phosani's Nightmare"],["Gauntlet","Corrupted Gauntlet"],["Chambers of Xeric","Chambers of Xeric Challenge Mode"],["Theatre of Blood","Theatre of Blood Hard Mode"],["Tombs of Amascut","Tombs of Amascut Expert Mode"]];
const key = (value,type) => { const name=String(value||"").trim().toLowerCase(); const pair=type==="botw"?pairs.find(p=>p.some(x=>x.toLowerCase()===name)):null; return pair?pair[0].toLowerCase():name; };
const label = (value,type) => { const pair=type==="botw"?pairs.find(p=>p.some(x=>x.toLowerCase()===String(value).toLowerCase())):null; return pair?{label:pair.join(" + "),metrics:pair}:{label:value,metrics:[value]}; };
const tz="America/Toronto";
function localTime(instant) { const fields=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant); const get=x=>fields.find(p=>p.type===x)?.value; return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`; }
function shift(date,days){return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
function eventFor(config, now) { if(!config?.startDate || !config.enabled)return null; const today=localTime(now).slice(0,10); for(let i=0;i<208;i+=2){const date=shift(config.startDate,i*7);if(date<today && shift(date,7)<today)continue;const type=i%4===0?config.firstEvent:(config.firstEvent==="botw"?"sotw":"botw");return {date,type,id:`${type}:${date}`,start:`${date}T${config.startTime||"15:00"}`,open:`${shift(date,-3)}T${config.startTime||"15:00"}`,close:`${shift(date,-1)}T${config.startTime||"15:00"}`};}return null; }
function choose(pool,excluded,history,amount,type){let eligible=pool.filter(v=>!excluded.has(key(v,type))&&!history.includes(key(v,type)));let reset=false;if(eligible.length<amount){eligible=pool.filter(v=>!excluded.has(key(v,type)));reset=true;}if(eligible.length<amount)throw Error("At least three distinct eligible options are required.");const result=[];while(result.length<amount){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);const [pick]=eligible.splice(bytes[0]%eligible.length,1);result.push(label(pick,type));}return {result,reset};}
export async function onRequest({request,env}) {
  if(!env.CYCLE_AUTOMATION_SECRET || request.headers.get("Authorization")!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
  const kv=hybridKv(env,"drops");const config=parse(await kv.get("events:sotw-botw-cycle:v1"),{});const now=new Date();const event=eventFor(config,now);
  if(!event)return Response.json({enabled:false,task:null},{headers:{"Cache-Control":"no-store"}});
  const stateKey=PREFIX+event.id;const state=parse(await kv.get(stateKey),{});
  if(request.method==="GET"){
    if(!state.messageId && localTime(now)>=event.open && localTime(now)<event.close){
      const pools=parse(await kv.get("events:sotw-botw-pools:v1"),{});const winners=parse(await kv.get("events:sotw-botw-nomination-winners:v1"),{});const nominations=parse(await kv.get("events:sotw-botw-nominations:v1"),{});const history=parse(await kv.get("events:sotw-botw-rotation:v1"),{});
      const pool=(pools[event.type]||[]).filter(x=>typeof x==="string");const unique=[...new Map(pool.map(x=>[key(x,event.type),x])).values()];
      const picks=nominations[event.type]?.discordId===winners[event.type]?nominations[event.type].options||[]:[];
      const selected=picks.filter(x=>unique.some(v=>key(v,event.type)===key(x,event.type))).slice(0,2);
      const distinct=[...new Map(selected.map(x=>[key(x,event.type),x])).values()];
      try{const random=choose(unique,new Set(distinct.map(x=>key(x,event.type))),history[event.type]||[],3-distinct.length,event.type);const options=[...distinct.map(x=>label(x,event.type)),...random.result];return Response.json({enabled:true,task:{action:"publish",...event,options,rotationReset:random.reset}},{headers:{"Cache-Control":"no-store"}});}catch(e){return Response.json({enabled:true,error:String(e.message),task:null},{headers:{"Cache-Control":"no-store"}});}
    }
    if(state.messageId&&!state.closedAt&&localTime(now)>=event.close)return Response.json({enabled:true,task:{action:"close",...event,messageId:state.messageId,channelId:state.channelId,options:state.options}},{headers:{"Cache-Control":"no-store"}});
    return Response.json({enabled:true,task:null},{headers:{"Cache-Control":"no-store"}});
  }
  if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  const body=await request.json();if(body.id!==event.id)return Response.json({error:"Unexpected event"},{status:409});
  if(body.action==="published"){
    if(state.messageId)return Response.json({success:true,state});
    if(!/^\d{17,20}$/.test(String(body.messageId))||!/^\d{17,20}$/.test(String(body.channelId))||!Array.isArray(body.options)||body.options.length!==3)return Response.json({error:"Invalid poll receipt"},{status:400});
    const expected=(await (async()=>{const r=new Request(request.url,{headers:{Authorization:`Bearer ${env.CYCLE_AUTOMATION_SECRET}`}});return onRequest({request:r,env});})()).json();
    const task=(await expected).task;if(!task||task.action!=="publish"||JSON.stringify(task.options)!==JSON.stringify(body.options))return Response.json({error:"Options changed; poll requires review"},{status:409});
    const record={messageId:String(body.messageId),channelId:String(body.channelId),options:body.options,publishedAt:now.toISOString()};await kv.put(stateKey,JSON.stringify(record));return Response.json({success:true});
  }
  if(body.action==="closed"){
    if(state.closedAt)return Response.json({success:true,state});
    if(!state.messageId||String(body.messageId)!==state.messageId||!Array.isArray(body.counts)||body.counts.length!==3||body.counts.some(n=>!Number.isInteger(n)||n<0))return Response.json({error:"Invalid poll result"},{status:400});
    const top=Math.max(...body.counts);const winning=body.counts.map((n,i)=>n===top?i:-1).filter(i=>i>=0);const outcome=top===0?"no_votes":winning.length>1?"tie":"winner";
    const record={...state,closedAt:now.toISOString(),counts:body.counts,outcome,winningIndex:outcome==="winner"?winning[0]:null};await kv.put(stateKey,JSON.stringify(record));
    // Do not create WOM competitions from a tie or unsupported metric; staff resolution is required.
    return Response.json({success:true,state:record});
  }
  return Response.json({error:"Unknown action"},{status:400});
}
