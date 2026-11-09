import { sendNominationDm } from "../../_winnerNominationNotifications.js";
import { hybridKv } from "../../_hybridKv.js";
import { getSession } from "../_auth.js";

const WINNERS_KEY = "events:sotw-botw-nomination-winners:v1";
const NOMINATIONS_KEY = "events:sotw-botw-nominations:v1";
const POOL_KEY = "events:sotw-botw-pools:v1";
const CYCLE_KEY = "events:sotw-botw-cycle:v1";
const DRAFT_KEY = "events:sotw-botw-poll-drafts:v1";
const AUTOMATION_PREFIX = "events:sotw-botw-automation:v1:";
const TZ = "America/Toronto";
function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(date);
  const part = type => parts.find(x => x.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function nextEvent(cycle, type) {
  if (!cycle?.startDate) return null;
  const anchor = new Date(`${cycle.startDate}T12:00:00Z`);
  const today = localParts().slice(0,10);
  for (let i=0;i<208;i+=2) {
    const date = new Date(anchor.getTime()+i*7*86400000).toISOString().slice(0,10);
    const kind = i%4===0 ? cycle.firstEvent : cycle.firstEvent === "botw" ? "sotw" : "botw";
    if (kind === type && date >= today) return date;
  }
  return null;
}

const PAIRS = [["artio","callisto"],["calvar'ion","vet'ion"],["spindel","venenatis"],["the nightmare","phosani's nightmare"],["gauntlet","corrupted gauntlet"],["chambers of xeric","chambers of xeric challenge mode"],["theatre of blood","theatre of blood hard mode"],["tombs of amascut","tombs of amascut expert mode"]];
const canonical = (name,type) => {
  const key=String(name||"").trim().replace(/\s+/g," ").toLowerCase();
  const pair=type==="botw"?PAIRS.find(p=>p.includes(key)):null;
  return pair ? pair[0] : key;
};
const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback;}catch{return fallback;}};
export async function onRequest({request,env}) {
  const session=await getSession(request,env);
  if (!session?.id) return Response.json({error:"Sign in with Discord to nominate."},{status:401});
  if (!["GET","POST"].includes(request.method)) return Response.json({error:"Method not allowed."},{status:405});
  const kv=hybridKv(env,"drops");
  const [winnersRaw,nominationsRaw,poolsRaw,cycleRaw,draftsRaw]=await Promise.all([kv.get(WINNERS_KEY),kv.get(NOMINATIONS_KEY),kv.get(POOL_KEY),kv.get(CYCLE_KEY),kv.get(DRAFT_KEY)]);
  const winners=parse(winnersRaw,{}), nominations=parse(nominationsRaw,{}), pools=parse(poolsRaw,{botw:[],sotw:[]});
  const cycle=parse(cycleRaw,{}), drafts=parse(draftsRaw,{});
  const eligible=["botw","sotw"].filter(type=>winners[type]===String(session.id));
  const windows=Object.fromEntries(eligible.map(type=>{
    const eventDate=nextEvent(cycle,type);
    if (!eventDate) return [type,{open:false,reason:"Cycle not configured"}];
    const anchor=new Date(`${eventDate}T12:00:00Z`);
    const leadDays=eventDate === "2026-11-13" && type === "botw" ? 4 : 7;
    const deadline=new Date(anchor.getTime()-leadDays*86400000).toISOString().slice(0,10)+"T"+(cycle.startTime||"15:00");
    const cycleId=`${type}:${eventDate}`;
    return [type,{open:localParts()<deadline && !(drafts[type]?.cycleId===cycleId && drafts[type]?.status==="published"),deadline,cycleId}];
  }));
  if (request.method==="GET") return Response.json({eligible, pools:Object.fromEntries(eligible.map(type=>[type,pools[type]||[]])), nominations:Object.fromEntries(eligible.map(type=>[type,nominations[type]?.options||[]])),windows},{headers:{"Cache-Control":"no-store"}});
  let body;
  try {body=await request.json();}catch{return Response.json({error:"Invalid JSON."},{status:400});}
  const type=body?.type;
  if (!eligible.includes(type)) return Response.json({error:"You are not the authorized previous winner for this event type."},{status:403});
  if (!windows[type]?.open) return Response.json({error:"Nominations are closed or the cycle has not been configured."},{status:409});
  // Never accept a change after this cycle has reserved or published poll choices.
  // This also protects manually prepared early polls and closes the deadline race.
  const reservedState=parse(await kv.get(AUTOMATION_PREFIX+windows[type].cycleId),{});
  if (Array.isArray(reservedState.pollOptions) || reservedState.messageId || reservedState.publishedAt) {
    return Response.json({error:"Poll choices have already been reserved for this event. Nominations can no longer be changed."},{status:409});
  }
  if (drafts[type]?.cycleId===windows[type].cycleId && drafts[type]?.status==="published") {
    return Response.json({error:"The poll is already published. Nominations are closed."},{status:409});
  }
  const options=body?.options;
  const max=2;
  if (!Array.isArray(options)||options.length!==max||options.some(x=>typeof x!=="string")) return Response.json({error:`Select exactly ${max} option(s).`},{status:400});
  const enabled=new Set((pools[type]||[]).map(x=>canonical(x,type)));
  const selected=options.map(x=>canonical(x,type));
  if (new Set(selected).size!==max||selected.some(x=>!enabled.has(x))) return Response.json({error:"Selections must be distinct, enabled options."},{status:400});
  // Resolve labels from the enabled catalog rather than trusting user-provided text.
  const labels=selected.map(key=>(pools[type]||[]).find(x=>canonical(x,type)===key));
  nominations[type]={discordId:String(session.id),options:labels,updatedAt:new Date().toISOString()};
  await kv.put(NOMINATIONS_KEY,JSON.stringify(nominations));
  // Poll drafts are regenerated from the authoritative saved nominations.
  // Live/published polls must never be mutated by a late submission.
  if (drafts[type]?.cycleId===windows[type].cycleId && drafts[type]?.status === "draft") {
    delete drafts[type];
    await kv.put(DRAFT_KEY,JSON.stringify(drafts));
  }
  // The nomination is authoritative even if Discord delivery fails. The receipt
  // is keyed to the upcoming event and exact picks, so repeated submissions do
  // not generate duplicate confirmations. Uncertain sends require review.
  const confirmationKey=`events:sotw-botw-nomination-confirmation:${type}:${nextEvent(cycle,type)}:${session.id}`;
  const fingerprint=JSON.stringify(labels.map(x=>canonical(x,type)));
  let confirmation="already_sent";
  try {
    const existing=parse(await kv.get(confirmationKey),null);
    if (existing?.fingerprint!==fingerprint) {
      const claim={fingerprint,state:"sending",attemptedAt:new Date().toISOString()};
      await kv.put(confirmationKey,JSON.stringify(claim));
      try {
        const receipt=await sendNominationDm(env,String(session.id),type,windows[type].deadline,"confirmation",labels);
        await kv.put(confirmationKey,JSON.stringify({...claim,state:"sent",sentAt:new Date().toISOString(),...receipt}));
        confirmation="sent";
      } catch(error) {
        await kv.put(confirmationKey,JSON.stringify({...claim,state:"needs_review",error:String(error?.message||error).slice(0,200)}));
        confirmation="needs_review";
      }
    } else confirmation=existing.state||"needs_review";
  } catch(error) {
    console.warn("Nomination saved but confirmation tracking failed",error);
    confirmation="needs_review";
  }
  return Response.json({success:true,options:labels,confirmation});
}
