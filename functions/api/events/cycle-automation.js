import { archiveEventInternal } from "../admin/events/archive.js";
import { buildEventResultsSnapshot, buildEventResultsContent, getResultsChannelId } from "../../_eventResultsAnnouncement.js";
import { hybridKv } from "../../_hybridKv.js";
import { womFetch } from "../../_wom.js";

const PREFIX = "events:sotw-botw-automation:v1:";
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const pairs = [["Artio","Callisto"],["Calvar'ion","Vet'ion"],["Spindel","Venenatis"],["The Nightmare","Phosani's Nightmare"],["Gauntlet","Corrupted Gauntlet"],["Chambers of Xeric","Chambers of Xeric Challenge Mode"],["Theatre of Blood","Theatre of Blood Hard Mode"],["Tombs of Amascut","Tombs of Amascut Expert Mode"]];
const key = (value,type) => { const name=String(value||"").trim().toLowerCase(); const pair=type==="botw"?pairs.find(p=>p.some(x=>x.toLowerCase()===name)):null; return pair?pair[0].toLowerCase():name; };
const label = (value,type) => { const pair=type==="botw"?pairs.find(p=>p.some(x=>x.toLowerCase()===String(value).toLowerCase())):null; return pair?{label:pair.join(" + "),metrics:pair}:{label:value,metrics:[value]}; };
const tz="America/Toronto";
function localTime(instant) { const fields=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant); const get=x=>fields.find(p=>p.type===x)?.value; return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`; }
function shift(date,days){return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
function eventFor(config, now) { if(!config?.startDate || !config.enabled)return null; const today=localTime(now).slice(0,10); for(let i=0;i<208;i+=2){const date=shift(config.startDate,i*7);if(date<today && shift(date,14)<today)continue;const type=i%4===0?config.firstEvent:(config.firstEvent==="botw"?"sotw":"botw");return {date,type,id:`${type}:${date}`,start:`${date}T${config.startTime||"15:00"}`,open:`${shift(date,-4)}T${config.startTime||"15:00"}`,close:`${shift(date,-1)}T${config.startTime||"15:00"}`};}return null; }
function choose(pool,excluded,history,amount,type){let eligible=pool.filter(v=>!excluded.has(key(v,type))&&!history.includes(key(v,type)));let reset=false;if(eligible.length<amount){eligible=pool.filter(v=>!excluded.has(key(v,type)));reset=true;}if(eligible.length<amount)throw Error("At least three distinct eligible options are required.");const result=[];while(result.length<amount){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);const [pick]=eligible.splice(bytes[0]%eligible.length,1);result.push(label(pick,type));}return {result,reset};}

function torontoInstant(date, time) {
  const desired = `${date}T${time}`;
  const utc = Date.parse(`${date}T${time}:00Z`);
  for (const hours of [4, 5]) {
    const instant = new Date(utc + hours * 3600000);
    if (localTime(instant) === desired) return instant.toISOString();
  }
  throw new Error("Invalid local event time");
}
function metricName(value) {
  const special = {"The Nightmare":"nightmare","Phosani's Nightmare":"phosanis_nightmare"};
  return special[value] || String(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
}
async function createWom(env, kv, stateKey, event, state) {
  if ((state.womStatus && state.womStatus !== "awaiting_activation") || state.outcome !== "winner") return state;
  if (env.CYCLE_AUTO_WOM_CREATE_ENABLED !== "true") {
    const updated = {...state,womStatus:"awaiting_activation",womError:"Automatic WOM creation is disabled."};
    await kv.put(stateKey,JSON.stringify(updated));
    return updated;
  }
  if (!env.CYCLE_COORDINATOR || typeof env.CYCLE_COORDINATOR.fetch !== "function") {
    const updated = {...state,womStatus:"needs_review",womError:"Durable Object coordinator binding missing; WOM creation blocked."};
    await kv.put(stateKey,JSON.stringify(updated));
    return updated;
  }
  const option = state.options?.[state.winningIndex];
  // Paired boss competitions require two metrics and must not be silently reduced to one.
  if (!option?.metrics?.length || option.metrics.length > 2 || !env.WOM_GROUP_VERIFICATION_CODE || Number(env.WOM_GROUP_ID || 12095) !== 12095) {
    const updated = {...state,womStatus:"needs_review",womError:"Missing/invalid metrics or WOM group credentials require staff review"};
    await kv.put(stateKey, JSON.stringify(updated));
    return updated;
  }
  const title = `Ironkin ${event.type.toUpperCase()} - ${option.label} - ${event.date}`;
  const metrics=option.metrics.map(metricName);
  const startsAt=torontoInstant(event.date,event.start.slice(11));
  const endsAt=torontoInstant(shift(event.date,7),event.start.slice(11));
  const pending={...state,womStatus:"creating",womTitle:title,womMetric:metrics.join(" + "),womRequestedAt:new Date().toISOString(),womCompetitionIds:[]};
  await kv.put(stateKey,JSON.stringify(pending));
  const created=[];
  for(let index=0;index<metrics.length;index++) {
    const metric=metrics[index];
    const payload={title:metrics.length>1?`${title} (${option.metrics[index]})`:title,
      metric,startsAt,endsAt,groupId:12095,groupVerificationCode:String(env.WOM_GROUP_VERIFICATION_CODE)};
    // Each metric has a distinct Durable Object identity. An uncertain result
    // blocks automatic retry of the whole pair; staff must reconcile it.
    try {
      const response=await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:metrics.length>1?`${event.id}:${index}`:event.id,payload})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.status!=="created"||!/^\d+$/.test(String(data.competitionId||""))) {
        const flagged={...pending,womStatus:"needs_review",womCompetitionIds:created.map(c=>c.competitionId),
          womError:`Metric ${metric} requires reconciliation: ${String(data.error||data.status||`HTTP ${response.status}`).slice(0,220)}`};
        await kv.put(stateKey,JSON.stringify(flagged));return flagged;
      }
      created.push({competitionId:String(data.competitionId),metric,role:index===0?"primary":"paired"});
      await kv.put(stateKey,JSON.stringify({...pending,womCompetitionIds:created.map(c=>c.competitionId),womCompetitions:created}));
    }catch(error){
      const flagged={...pending,womStatus:"needs_review",womCompetitionIds:created.map(c=>c.competitionId),womCompetitions:created,
        womError:`Metric ${metric} outcome uncertain: ${String(error.message||error).slice(0,200)}`};
      await kv.put(stateKey,JSON.stringify(flagged));return flagged;
    }
  }
  const saved={...pending,womStatus:"created",womCompetitionId:created[0].competitionId,
    womCompetitionIds:created.map(c=>c.competitionId),womCompetitions:created,
    womUrl:`https://wiseoldman.net/competitions/${created[0].competitionId}`,womCreatedAt:new Date().toISOString()};
  await kv.put(stateKey,JSON.stringify(saved));return saved;
}

// Register a confirmed WOM competition in the same active-event store used by
// the public website. This operation is repeatable and never creates a WOM event.
async function linkActiveEvent(kv, event, state) {
  if (state.womStatus !== "created" || !/^\d+$/.test(String(state.womCompetitionId || ""))) return state;
  const activeKey = "events:active";
  const existing = parse(await kv.get(activeKey), []);
  if (!Array.isArray(existing)) throw new Error("Invalid active events registry");
  const id = event.type === "sotw" ? "sotw-current" : "botw-elite";
  const previous = existing.find(item => item.id === id);
  // Never silently replace a different, still-active manual competition.
  if (previous?.womCompetitionId && String(previous.womCompetitionId) !== String(state.womCompetitionId) &&
      previous.endDate && Date.parse(previous.endDate) > Date.now()) {
    throw new Error(`Active ${id} competition already exists; manual reconciliation required`);
  }
  const option = state.options?.[state.winningIndex];
  const startDate = torontoInstant(event.date, event.start.slice(11));
  const endDate = torontoInstant(shift(event.date, 7), event.start.slice(11));
  const record = {
    ...(previous || {}), id, type:event.type,
    // Retain the saved Event Rewards (02) settings on the canonical event record.
    // Never invent default Ember amounts or silently replace configured rewards.
    rewards: previous?.rewards || {placement:[],participation:[]},
    ...(event.type === "botw" ? {botwTier:"elite",botwRole:"primary",label:"BOTW Elite"} : {label:"SOTW"}),
    title:state.womTitle || `Ironkin ${event.type.toUpperCase()} - ${option?.label || "Competition"}`,
    description:"Automatically created from the Ironkin Discord voting cycle.",
    womCompetitionId:String(state.womCompetitionId),
    ...(event.type === "botw" ? {
      womCompetitionIds:state.womCompetitionIds || [String(state.womCompetitionId)],
      womCompetitions:state.womCompetitions || [{competitionId:String(state.womCompetitionId),metric:state.womMetric || metricName(option?.metrics?.[0]),role:"primary"}],
      combinedMetric:(state.womCompetitions?.length>1)?state.womMetric:null,
      pluginEventId:null
    } : {}),
    metric:state.womMetric || metricName(option?.metrics?.[0]),
    featured:false,active:true,dropsEnabled:event.type === "botw",
    startDate,endDate
  };
  const updated = [...existing.filter(item => item.id !== id),record];
  await kv.put(activeKey,JSON.stringify(updated));
  const linked = {...state,websiteStatus:"linked",websiteEventId:id,websiteLinkedAt:new Date().toISOString()};
  await kv.put(PREFIX + event.id,JSON.stringify(linked));
  return linked;
}
export async function linkOrFlag(kv,event,state) {
  if (state.womStatus !== "created") return state;
  try { return await linkActiveEvent(kv,event,state); }
  catch (error) {
    const flagged = {...state,websiteStatus:"needs_review",websiteError:String(error.message || error).slice(0,300)};
    await kv.put(PREFIX + event.id,JSON.stringify(flagged));
    return flagged;
  }
}

// Finalize only this automation's exact WOM competition, never a manually
// configured event. The shared archive pipeline preserves results, winner
// nomination mapping, record sync and Discord publishing behavior.
async function finalizeCompetition(env, kv, event, state) {
  if (state.websiteStatus !== "linked" || state.womStatus !== "created") return state;
  if (state.finalizationStatus === "completed" || state.finalizationStatus === "processing" || state.finalizationStatus === "needs_review") return state;
  const now = new Date();
  const end = torontoInstant(shift(event.date,7), event.start.slice(11));
  if (now.getTime() < Date.parse(end) + 15 * 60 * 1000) return state;
  const active = parse(await kv.get("events:active"), []);
  const record = Array.isArray(active) ? active.find(item => item.id === state.websiteEventId) : null;
  if (!record || String(record.womCompetitionId) !== String(state.womCompetitionId) ||
      (state.womCompetitionIds?.length>1 && JSON.stringify(record.womCompetitionIds)!==JSON.stringify(state.womCompetitionIds))) {
    const flagged = {...state, finalizationStatus:"needs_review", finalizationError:"Active website event no longer matches the automation competition."};
    await kv.put(PREFIX + event.id,JSON.stringify(flagged));
    return flagged;
  }
  const archiveRequestId = `cycle-${event.id}-${state.womCompetitionId}`;
  const archived = parse(await kv.get("events:archive"), []);
  const existing = Array.isArray(archived) && archived.find(item => item.archiveRequestId === archiveRequestId || (String(item.womCompetitionId) === String(state.womCompetitionId) && item.eventId === record.id));
  if (existing) {
    const done = {...state,finalizationStatus:"completed",archiveId:existing.id,finalizedAt:new Date().toISOString()};
    await kv.put(PREFIX + event.id,JSON.stringify(done));
    return done;
  }
  // Verify WOM has returned actual final standings before changing any records.
  let snapshot;
  try {
    snapshot = await buildEventResultsSnapshot(env,record);
    if (!Array.isArray(snapshot.leaderboard) || !snapshot.leaderboard.length || !snapshot.endDate || Date.parse(snapshot.endDate) > Date.now()) {
      throw new Error("Final WOM standings are not yet available.");
    }
  } catch (error) {
    const pending = {...state,finalizationStatus:"pending",finalizationError:String(error.message || error).slice(0,250)};
    await kv.put(PREFIX + event.id,JSON.stringify(pending));
    return pending;
  }
  if (!getResultsChannelId(env,record) || !env.DISCORD_BOT_TOKEN) {
    const pending = {...state,finalizationStatus:"needs_review",finalizationError:"Discord results channel or bot token is missing."};
    await kv.put(PREFIX + event.id,JSON.stringify(pending));
    return pending;
  }
  const content = buildEventResultsContent(snapshot);
  if (!content || content.length > 1950) {
    const pending = {...state,finalizationStatus:"needs_review",finalizationError:"Generated results content is missing or exceeds Discord limits."};
    await kv.put(PREFIX + event.id,JSON.stringify(pending));
    return pending;
  }
  // Mark an irreversible operation before calling the shared archiver.
  // Unknown outcomes require manual reconciliation, never blind retry.
  const processing = {...state,finalizationStatus:"processing",finalizationStartedAt:new Date().toISOString()};
  await kv.put(PREFIX + event.id,JSON.stringify(processing));
  try {
    const result = await archiveEventInternal({env,body:{event:record,events:active,archiveRequestId,resultsContent:content,postResults:true}});
    const response = await result.json();
    if (!result.ok || !response.success) throw new Error(response.details || response.error || `Archive HTTP ${result.status}`);
    const done = {...processing,finalizationStatus:"completed",archiveId:response.archiveEntry?.id,finalizedAt:new Date().toISOString(),announcementStatus:response.archiveEntry?.resultsAnnouncement?.status};
    await kv.put(PREFIX + event.id,JSON.stringify(done));
    return done;
  } catch (error) {
    const flagged = {...processing,finalizationStatus:"needs_review",finalizationError:String(error.message || error).slice(0,250)};
    await kv.put(PREFIX + event.id,JSON.stringify(flagged));
    return flagged;
  }
}

export async function onRequest({request,env}) {
  if(!env.CYCLE_AUTOMATION_SECRET || request.headers.get("Authorization")!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
  const kv=hybridKv(env,"drops");const config=parse(await kv.get("events:sotw-botw-cycle:v1"),{});const now=new Date();const event=eventFor(config,now);
  if(!event)return Response.json({enabled:false,task:null},{headers:{"Cache-Control":"no-store"}});
  const stateKey=PREFIX+event.id;const state=parse(await kv.get(stateKey),{});
  // A completed poll belongs to the prior cycle once the next cycle becomes current.
  // Reconcile it independently, without blocking the upcoming poll.
  if (request.method === "GET") {
    const previousDate = shift(event.date, -14);
    const previousType = event.type === "sotw" ? "botw" : "sotw";
    const previousEvent = { ...event, date: previousDate, id: `${previousType}:${previousDate}`, start: `${previousDate}T${config.startTime || "15:00"}` };
    const previousKey = PREFIX + previousEvent.id;
    const previousState = parse(await kv.get(previousKey), {});
    if (previousState.womStatus === "created" && previousState.websiteStatus !== "linked") {
      await linkOrFlag(kv, previousEvent, previousState);
    } else if (env.CYCLE_AUTO_FINALIZE_ENABLED === "true" && previousState.womStatus === "created" && previousState.websiteStatus === "linked") {
      await finalizeCompetition(env, kv, previousEvent, previousState);
    }
  }
  if(request.method==="GET") {
    if (env.CYCLE_AUTO_FINALIZE_ENABLED === "true" && state.womStatus === "created" && state.websiteStatus === "linked") {
      const final = await finalizeCompetition(env,kv,event,state);
      if (final.finalizationStatus) return Response.json({enabled:true,task:null,finalizationStatus:final.finalizationStatus,finalizationError:final.finalizationError || null},{headers:{"Cache-Control":"no-store"}});
    }
    if (state.womStatus === "created" && state.websiteStatus !== "linked") {
      const linked = await linkOrFlag(kv,event,state);
      return Response.json({enabled:true,task:null,websiteStatus:linked.websiteStatus},{headers:{"Cache-Control":"no-store"}});
    }
    if(!state.messageId && localTime(now)>=event.open && localTime(now)<event.close){
      const pools=parse(await kv.get("events:sotw-botw-pools:v1"),{});const winners=parse(await kv.get("events:sotw-botw-nomination-winners:v1"),{});const nominations=parse(await kv.get("events:sotw-botw-nominations:v1"),{});const history=parse(await kv.get("events:sotw-botw-rotation:v1"),{});
      const pool=(pools[event.type]||[]).filter(x=>typeof x==="string");const unique=[...new Map(pool.map(x=>[key(x,event.type),x])).values()];
      const picks=nominations[event.type]?.discordId===winners[event.type]?nominations[event.type].options||[]:[];
      const selected=picks.filter(x=>unique.some(v=>key(v,event.type)===key(x,event.type))).slice(0,2);
      const distinct=[...new Map(selected.map(x=>[key(x,event.type),x])).values()];
      try {
        const reserved = state.pollOptions;
        const random = reserved ? null : choose(unique,new Set(distinct.map(x=>key(x,event.type))),history[event.type]||[],3-distinct.length,event.type);
        const options = reserved || [...distinct.map(x=>label(x,event.type)),...random.result];
        if (!reserved) await kv.put(stateKey,JSON.stringify({...state,pollOptions:options,rotationReset:random.reset,pollReservedAt:now.toISOString()}));
        return Response.json({enabled:true,task:{action:"publish",...event,options,rotationReset:state.rotationReset ?? random?.reset ?? false}},{headers:{"Cache-Control":"no-store"}});
      } catch(e){return Response.json({enabled:true,error:String(e.message),task:null},{headers:{"Cache-Control":"no-store"}});}
    }
    if(state.messageId&&!state.closedAt&&localTime(now)>=event.close)return Response.json({enabled:true,task:{action:"close",...event,messageId:state.messageId,channelId:state.channelId,options:state.options}},{headers:{"Cache-Control":"no-store"}});
    return Response.json({enabled:true,task:null},{headers:{"Cache-Control":"no-store"}});
  }
  if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  const body=await request.json();if(body.id!==event.id)return Response.json({error:"Unexpected event"},{status:409});
  if(body.action==="published"){
    if(state.messageId)return Response.json({success:true,state});
    if(!/^\d{17,20}$/.test(String(body.messageId))||!/^\d{17,20}$/.test(String(body.channelId))||!Array.isArray(body.options)||body.options.length!==3)return Response.json({error:"Invalid poll receipt"},{status:400});
    if (!Array.isArray(state.pollOptions) || JSON.stringify(state.pollOptions) !== JSON.stringify(body.options))
      return Response.json({error:"Poll options differ from reserved choices; staff review required"},{status:409});
    const record={...state,messageId:String(body.messageId),channelId:String(body.channelId),options:state.pollOptions,publishedAt:now.toISOString()};await kv.put(stateKey,JSON.stringify(record));return Response.json({success:true});
  }
  if(body.action==="closed"){
    if(state.closedAt)return Response.json({success:true,alreadyClosed:true,state:await linkOrFlag(kv,event,state)});
    if (localTime(now) < event.close) return Response.json({error:"Voting is still open"},{status:409});
    if(!state.messageId||String(body.messageId)!==state.messageId||!Array.isArray(body.counts)||body.counts.length!==3||body.counts.some(n=>!Number.isInteger(n)||n<0))return Response.json({error:"Invalid poll result"},{status:400});
    const top=Math.max(...body.counts);const winning=body.counts.map((n,i)=>n===top?i:-1).filter(i=>i>=0);const outcome=top===0?"no_votes":winning.length>1?"tie":"winner";
    const record={...state,closedAt:now.toISOString(),counts:body.counts,outcome,winningIndex:outcome==="winner"?winning[0]:null};await kv.put(stateKey,JSON.stringify(record));
    const updated = await createWom(env,kv,stateKey,event,record);
    return Response.json({success:true,alreadyClosed:false,state:await linkOrFlag(kv,event,updated)});
  }
  return Response.json({error:"Unknown action"},{status:400});
}
