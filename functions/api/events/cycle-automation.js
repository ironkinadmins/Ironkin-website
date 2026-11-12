import { nominationNoticeStatus } from "../../_winnerNominationNotifications.js";
import { processNominationReminder } from "../../_winnerNominationNotifications.js";
import { archiveEventInternal } from "../admin/events/archive.js";
import { buildEventResultsSnapshot, buildEventResultsContent, getResultsChannelId } from "../../_eventResultsAnnouncement.js";
import { hybridKv } from "../../_hybridKv.js";
import { womFetch } from "../../_wom.js";
import { syncAutomatedDiscordCalendarEvent } from "../../_discordCalendar.js";

const PREFIX = "events:sotw-botw-automation:v1:";
const CONTROL_DEFAULTS = {polling:true,womCreation:true,finalization:true,nominationReminders:true,resultsAnnouncements:true};
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const pairs = [["Artio","Callisto"],["Calvar'ion","Vet'ion"],["Spindel","Venenatis"],["The Nightmare","Phosani's Nightmare"],["Gauntlet","Corrupted Gauntlet"],["Chambers of Xeric","Chambers of Xeric Challenge Mode"],["Theatre of Blood","Theatre of Blood Hard Mode"],["Tombs of Amascut","Tombs of Amascut Expert Mode"]];
const key = (value,type) => { const name=String(value||"").trim().toLowerCase(); const pair=type.startsWith("botw")?pairs.find(p=>p.some(x=>x.toLowerCase()===name)):null; return pair?pair[0].toLowerCase():name; };
const label = (value,type) => { const pair=type.startsWith("botw")?pairs.find(p=>p.some(x=>x.toLowerCase()===String(value).toLowerCase())):null; return pair?{label:pair.join(" + "),metrics:pair}:{label:value,metrics:[value]}; };
const tz="America/Toronto";
function localTime(instant) { const fields=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant); const get=x=>fields.find(p=>p.type===x)?.value; return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`; }
function shift(date,days){return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
function eventFor(config, now) {
  if (!config?.startDate || !config.enabled) return null;
  const today=localTime(now).slice(0,10);
  const rotation=config.rotationDays||14, duration=config.durationDays||7;
  for(let i=0;i<104;i++) {
    const date=shift(config.startDate,i*rotation);
    if (shift(date,rotation)<today) continue;
    const type=i%2===0?config.firstEvent:(config.firstEvent==="botw"?"sotw":"botw");
    return {date,type,id:`${type}:${date}`,start:`${date}T${config.startTime||"15:00"}`,
      durationDays:duration,rotationDays:rotation,
      open:`${shift(date,date==="2026-11-13"&&type==="botw"?-2:-7)}T${config.startTime||"15:00"}`,
      close:`${shift(date,-1)}T${config.startTime||"15:00"}`};
  }
  return null;
}
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
  const special = {"The Nightmare":"nightmare","Phosani's Nightmare":"phosanis_nightmare","Tombs of Amascut Expert Mode":"tombs_of_amascut_expert"};
  return special[value] || String(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
}
async function createWom(env, kv, stateKey, event, state, controls=CONTROL_DEFAULTS) {
  if ((state.womStatus && state.womStatus !== "awaiting_activation") || state.outcome !== "winner") return state;
  if (env.CYCLE_AUTO_WOM_CREATE_ENABLED !== "true" || !controls.womCreation) {
    const updated = {...state,womStatus:"awaiting_activation",womError:"Automatic WOM creation is disabled."};
    await kv.put(stateKey,JSON.stringify(updated));
    return updated;
  }
  if (!env.CYCLE_COORDINATOR || typeof env.CYCLE_COORDINATOR.fetch !== "function") {
    const updated = {...state,womStatus:"needs_review",womError:"Durable Object coordinator binding missing; WOM creation blocked."};
    await kv.put(stateKey,JSON.stringify(updated));
    return updated;
  }
  // A delayed activation must not silently create a competition whose start
  // time is already in the past. Staff can reconcile or explicitly reschedule.
  if (Date.now() >= Date.parse(torontoInstant(event.date, event.start.slice(11)))) {
    const flagged={...state,womStatus:"needs_review",womError:"Competition start has passed; creation requires staff review and rescheduling."};
    await kv.put(stateKey,JSON.stringify(flagged));
    return flagged;
  }
  const option = state.options?.[state.winningIndex];
  // Paired boss competitions require two metrics and must not be silently reduced to one.
  if (!option?.metrics?.length || option.metrics.length > 2 || !env.WOM_GROUP_VERIFICATION_CODE || Number(env.WOM_GROUP_ID || 12095) !== 12095) {
    const updated = {...state,womStatus:"needs_review",womError:"Missing/invalid metrics or WOM group credentials require staff review"};
    await kv.put(stateKey, JSON.stringify(updated));
    return updated;
  }
  // WOM limits titles to 50 characters. Use metric-specific short titles;
  // the public calendar retains the full winning option label.
  const tier = event.type === "botw-standard" ? "BOTW Standard" : event.type === "botw-elite" ? "BOTW Elite" : "SOTW";
  const title = `Ironkin ${tier} - ${event.date}`;
  const metrics=option.metrics.map(metricName);
  const startsAt=torontoInstant(event.date,event.start.slice(11));
  const endsAt=torontoInstant(shift(event.date,event.durationDays||7),event.start.slice(11));
  const pending={...state,womStatus:"creating",womTitle:title,womMetric:metrics.join(" + "),womRequestedAt:new Date().toISOString(),womCompetitionIds:[]};
  await kv.put(stateKey,JSON.stringify(pending));
  const created=[];
  for(let index=0;index<metrics.length;index++) {
    const metric=metrics[index];
    const payload={title:metrics.length>1?`${title} (${metric})`.slice(0,50):title.slice(0,50),
      metric,startsAt,endsAt,groupId:12095,groupVerificationCode:String(env.WOM_GROUP_VERIFICATION_CODE)};
    // Each metric has a distinct Durable Object identity. An uncertain result
    // blocks automatic retry of the whole pair; staff must reconcile it.
    try {
      const response=await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:state.titleRetryVersion ? `${event.id}:r${state.titleRetryVersion}${metrics.length>1?`-${index}`:""}` : (metrics.length>1?`${event.id}:${index}`:event.id),payload})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.status!=="created"||!/^\d+$/.test(String(data.competitionId||""))) {
        const flagged={...pending,womStatus:"needs_review",womCompetitionIds:[],womCompetitions:created,
          womError:`Metric ${metric} requires reconciliation: ${String(data.error||data.status||`HTTP ${response.status}`).slice(0,220)}`};
        await kv.put(stateKey,JSON.stringify(flagged));return flagged;
      }
      created.push({competitionId:String(data.competitionId),metric,role:index===0?"primary":"paired",metricIndex:index});
      await kv.put(stateKey,JSON.stringify({...pending,womCompetitionIds:[],womCompetitions:created}));
    }catch(error){
      const flagged={...pending,womStatus:"needs_review",womCompetitionIds:[],womCompetitions:created,
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
  const id = event.type === "sotw" ? "sotw-current" : event.type;
  const previous = existing.find(item => item.id === id);
  // Never silently replace a different, still-active manual competition.
  if (previous?.womCompetitionId && String(previous.womCompetitionId) !== String(state.womCompetitionId) &&
      previous.endDate && Date.parse(previous.endDate) > Date.now()) {
    throw new Error(`Active ${id} competition already exists; manual reconciliation required`);
  }
  const option = state.options?.[state.winningIndex];
  const startDate = torontoInstant(event.date, event.start.slice(11));
  const endDate = torontoInstant(shift(event.date,event.durationDays||7), event.start.slice(11));
  const record = {
    ...(previous || {}), id, type:event.type.startsWith("botw-") ? "botw" : "sotw",
    // Retain the saved Event Rewards (02) settings on the canonical event record.
    // Never invent default Ember amounts or silently replace configured rewards.
    rewards: previous?.rewards || {placement:[],participation:[]},
    ...(event.type.startsWith("botw-") ? {botwTier:event.type.slice(5),botwRole:"primary",label:`BOTW ${event.type.slice(5) === "elite" ? "Elite" : "Standard"}`} : {label:"SOTW"}),
    title:state.womTitle || `Ironkin ${event.type.toUpperCase()} - ${option?.label || "Competition"}`,
    description:"Automatically created from the Ironkin Discord voting cycle.",
    womCompetitionId:String(state.womCompetitionId),
    ...(event.type.startsWith("botw-") ? {
      womCompetitionIds:state.womCompetitionIds || [String(state.womCompetitionId)],
      womCompetitions:state.womCompetitions || [{competitionId:String(state.womCompetitionId),metric:state.womMetric || metricName(option?.metrics?.[0]),role:"primary"}],
      combinedMetric:(state.womCompetitions?.length>1)?state.womMetric:null,
      pluginEventId:null
    } : {}),
    metric:state.womMetric || metricName(option?.metrics?.[0]),
    featured:false,active:true,dropsEnabled:event.type.startsWith("botw-"),
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

// Mirror confirmed automated WOM competitions into the existing Community Calendar.
// Stable IDs make this safe on every bot poll and on a repeated close receipt.
export async function syncCycleCalendar(env, kv, event, state) {
  if (state.womStatus !== "created" || state.websiteStatus !== "linked") return state;
  const calendarKv = hybridKv(env, "calendar");
  if (!calendarKv) return state;
  const calendarKey = "calendar:custom-events";
  try {
    const raw = await calendarKv.get(calendarKey);
    const events = parse(raw, []);
    if (!Array.isArray(events)) throw new Error("Invalid Community Calendar event registry");
    const option = state.options?.[state.winningIndex];
    if (!option?.label) throw new Error("Winning poll option missing");
    const id = `cycle-calendar:${event.id}`;
    const now = new Date().toISOString();
    const start = torontoInstant(event.date, event.start.slice(11));
    const end = torontoInstant(shift(event.date, event.durationDays || 7), event.start.slice(11));
    const tier = event.type.startsWith("botw-") ? event.type.slice(5) : "";
    const title = `${tier ? `BOTW ${tier === "elite" ? "Elite" : "Standard"}` : "Skill of the Week"} - ${option.label}`;
    const existing = events.find(item => item.id === id);
    const record = {
      ...(existing || {}), id, source:"ironkin-cycle-automation",
      title, description:"Automatically selected by the Ironkin community vote.",
      start, end, eventType:tier ? "botw" : "sotw", category:tier ? "botw" : "sotw",
      ...(tier ? {botwTier:tier,botwRole:"primary"} : {}),
      activeEventId:state.websiteEventId || (tier ? event.type : "sotw-current"),
      womCompetitionId:String(state.womCompetitionId), womMetric:state.womMetric || "",
      womUrl:state.womUrl || `https://wiseoldman.net/competitions/${state.womCompetitionId}`,
      status:"scheduled", createdAt:existing?.createdAt || now, updatedAt:now
    };
    // Avoid unnecessary writes on every minute's reconciliation check.
    if (!existing || ["title","start","end","womCompetitionId","activeEventId"].some(k => existing[k] !== record[k])) {
      await calendarKv.put(calendarKey,JSON.stringify([...events.filter(item => item.id !== id),record]));
    }
    // Mirror automated calendar events through the same Discord scheduled-event
    // integration used by manually created calendar entries.
    const discordResult = await syncAutomatedDiscordCalendarEvent(env, record);
    const updated={...state,calendarStatus:"linked",calendarEventId:id,calendarLinkedAt:now,calendarError:null,
      discordCalendarStatus:discordResult.synced ? "linked" : "needs_review",
      discordCalendarError:discordResult.synced ? null : discordResult.reason};
    await kv.put(PREFIX + event.id,JSON.stringify(updated));
    return updated;
  } catch(error) {
    const flagged={...state,calendarStatus:"needs_review",calendarError:String(error.message || error).slice(0,300)};
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
  const end = torontoInstant(shift(event.date,event.durationDays||7), event.start.slice(11));
  if (now.getTime() < Date.parse(end) + 15 * 60 * 1000) return state;
  const active = parse(await kv.get("events:active"), []);
  const record = Array.isArray(active) ? active.find(item => item.id === state.websiteEventId) : null;
  const archiveRequestId = `cycle-${event.id}-${state.womCompetitionId}`;
  const archived = parse(await kv.get("events:archive"), []);
  const existing = Array.isArray(archived) && archived.find(item => item.archiveRequestId === archiveRequestId ||
    (String(item.womCompetitionId) === String(state.womCompetitionId) && item.eventId === state.websiteEventId));
  if (existing) {
    // Archiving resets the canonical active event. An archived snapshot with
    // a still-active matching event indicates a partial write and needs review.
    if (record?.active && String(record.womCompetitionId) === String(state.womCompetitionId)) {
      const flagged={...state,finalizationStatus:"needs_review",finalizationError:"Archive exists but the WOM event remains active; staff reconciliation required."};
      await kv.put(PREFIX + event.id,JSON.stringify(flagged));
      return flagged;
    }
    const done={...state,finalizationStatus:"completed",archiveId:existing.id,finalizedAt:new Date().toISOString(),announcementStatus:existing.resultsAnnouncement?.status};
    await kv.put(PREFIX + event.id,JSON.stringify(done));
    return done;
  }
  if (!record || String(record.womCompetitionId) !== String(state.womCompetitionId) ||
      record.startDate !== torontoInstant(event.date,event.start.slice(11)) ||
      record.endDate !== end ||
      (state.womCompetitionIds?.length>1 && JSON.stringify(record.womCompetitionIds)!==JSON.stringify(state.womCompetitionIds))) {
    const flagged={...state,finalizationStatus:"needs_review",finalizationError:"Active website event no longer matches this automation cycle."};
    await kv.put(PREFIX + event.id,JSON.stringify(flagged));
    return flagged;
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
  // Discord announcements are optional: an unavailable channel must not keep
  // a completed WOM competition active or open for submissions.
  const controls={...CONTROL_DEFAULTS,...parse(await kv.get("events:sotw-botw-controls:v1"),{})};
  const canPost=Boolean(controls.resultsAnnouncements && getResultsChannelId(env,record) && env.DISCORD_BOT_TOKEN);
  const content=canPost ? buildEventResultsContent(snapshot) : null;
  const postResults=Boolean(canPost && content && content.length<=1950);
  // Mark an irreversible operation before calling the shared archiver.
  // Unknown outcomes require manual reconciliation, never blind retry.
  const processing = {...state,finalizationStatus:"processing",finalizationStartedAt:new Date().toISOString()};
  await kv.put(PREFIX + event.id,JSON.stringify(processing));
  try {
    const result = await archiveEventInternal({env,body:{event:record,events:active,archiveRequestId,resultsContent:postResults?content:null,postResults}});
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


// Staff-triggered retry of a *confirmed pre-write* Invalid cycle rejection.
// Reuses the exact same coordinator ID: never allocates a new identity.
export async function retryExpertInvalidCycle(env, kv, cycleId) {
  if (cycleId !== "botw-elite:2026-11-13") throw Error("Only the known November 13 Elite recovery is supported.");
  const stateKey = PREFIX + cycleId;
  let state = parse(await kv.get(stateKey), {});
  if (state.womStatus === "created") return { status: "already_created", state };
  if (state.womStatus !== "needs_review" ||
      state.womError !== "Expert Mode recovery requires review: Invalid cycle" ||
      state.expertRecoveryAttempted !== true)
    throw Error("Recovery is not a confirmed pre-write Invalid cycle rejection. No WOM request sent.");
  if (state.options?.[state.winningIndex]?.metrics?.join("|") !== "Tombs of Amascut|Tombs of Amascut Expert Mode")
    throw Error("Unexpected winner metrics; no WOM request sent.");
  const primary = state.womCompetitions?.find(c => c.metricIndex === 0 && c.metric === "tombs_of_amascut");
  if (!primary || String(primary.competitionId) !== "165741" || state.womCompetitions.length !== 1)
    throw Error("Existing normal ToA competition does not match #165741; no WOM request sent.");
  if (!env.CYCLE_COORDINATOR || !env.WOM_GROUP_VERIFICATION_CODE || env.CYCLE_AUTO_WOM_CREATE_ENABLED !== "true")
    throw Error("Coordinator or WOM creation prerequisites are not configured.");
  const check = await womFetch(env, "/competitions/165741");
  if (!check.ok) throw Error(`Normal ToA verification failed (HTTP ${check.status}).`);
  const raw = await check.json();
  const normal = raw?.competition || raw;
  if (String(normal?.id) !== "165741" || String(normal?.groupId ?? normal?.group?.id) !== "12095" || normal?.metric !== "tombs_of_amascut")
    throw Error("Normal ToA identity verification failed.");
  const config = parse(await kv.get("events:sotw-botw-cycle:v1"), {});
  const date = "2026-11-13";
  const time = config.startTime || "15:00";
  const start = torontoInstant(date, time);
  if (Date.now() >= Date.parse(start)) throw Error("Event has already started. Staff must reschedule; no new competition was created.");
  const payload = {
    title: `Ironkin BOTW Elite - ${date} (ToA Expert)`,
    metric: "tombs_of_amascut_expert", startsAt: start,
    endsAt: torontoInstant(shift(date, config.durationDays || 7), time),
    groupId: 12095, groupVerificationCode: String(env.WOM_GROUP_VERIFICATION_CODE)
  };
  // The previously rejected request never reached a Durable Object or WOM.
  // Reuse its coordinator ID to make repeated admin clicks idempotent.
  const response = await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ id: `${cycleId}:r2-1`, payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== "created" || !/^\d+$/.test(String(result.competitionId || ""))) {
    const message = String(result.error || result.status || `HTTP ${response.status}`).slice(0,200);
    await kv.put(stateKey, JSON.stringify({...state, womError: `Expert Mode recovery requires review: ${message}`}));
    return { status: "needs_review", error: message, httpStatus: response.status };
  }
  if (String(result.competitionId) === "165741")
    throw Error("Coordinator returned normal ToA competition ID; manual investigation required.");
  const competitions = [primary, { competitionId: String(result.competitionId), metric: "tombs_of_amascut_expert", role: "paired", metricIndex: 1 }];
  state = {...state, womStatus:"created", womError:null, womCompetitionId:"165741",
    womCompetitionIds:competitions.map(c=>c.competitionId), womCompetitions:competitions,
    womMetric:"tombs_of_amascut + tombs_of_amascut_expert",
    womUrl:"https://wiseoldman.net/competitions/165741", womCreatedAt:new Date().toISOString()};
  await kv.put(stateKey, JSON.stringify(state));
  const event = {id:cycleId,type:"botw-elite",date,start:`${date}T${time}`,durationDays:config.durationDays||7};
  state = await linkOrFlag(kv, event, state);
  if (state.websiteStatus === "linked") state = await syncCycleCalendar(env,kv,event,state);
  return {status:"created", expertCompetitionId:String(result.competitionId), websiteStatus:state.websiteStatus,
    calendarStatus:state.calendarStatus || null};
}

export async function onRequest({request,env}) {
  if(!env.CYCLE_AUTOMATION_SECRET || request.headers.get("Authorization")!==`Bearer ${env.CYCLE_AUTOMATION_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
  const kv=hybridKv(env,"drops");const config=parse(await kv.get("events:sotw-botw-cycle:v1"),{});
  const controls={...CONTROL_DEFAULTS,...parse(await kv.get("events:sotw-botw-controls:v1"),{})};
  const now=new Date();const event=eventFor(config,now);
  if(!event)return Response.json({enabled:false,task:null},{headers:{"Cache-Control":"no-store"}});
  const variants = base => base.type === "botw" ? ["botw-standard","botw-elite"].map(type=>({...base,type,id:`${type}:${base.date}`})) : [base];
  const currentEvents=variants(event);
  // Never publish two replacement BOTW polls while a legacy shared poll is active.
  if (event.type === "botw") {
    const legacy=parse(await kv.get(PREFIX+event.id),{});
    if (legacy.messageId || legacy.pollReservedAt || legacy.closedAt || legacy.womStatus) {
      return Response.json({enabled:true,task:null,error:"Legacy shared BOTW cycle exists. Staff must reconcile it before activating Standard/Elite polls."},{headers:{"Cache-Control":"no-store"},status:409});
    }
  }
  
  // Reconcile recent completed cycles independently of the current poll. A
  // competition can finish after the next poll has opened, and WOM can take
  // time to publish final standings. Never let maintenance block poll tasks.
  if (request.method === "GET") {
    try { if (controls.nominationReminders) await Promise.all(["botw-standard","botw-elite","sotw"].map(type=>processNominationReminder(env,type))); }
    catch(error) { console.warn("Nomination reminder check failed",error); }
    // Examine recent scheduled cycles, not fixed 14-day offsets. This remains
    // correct when the staff changes the interval before the first official poll.
    const rotation=config.rotationDays||14;
    const first=Date.parse(`${config.startDate}T12:00:00Z`);
    const today=Date.parse(`${localTime(now).slice(0,10)}T12:00:00Z`);
    const latest=Math.max(0,Math.floor((today-first)/(rotation*86400000)));
    for (let index=Math.max(0,latest-4);index<=latest;index++) {
      const date=shift(config.startDate,index*rotation);
      const type=index%2===0?config.firstEvent:(config.firstEvent==="botw"?"sotw":"botw");
      const basePast={date,type,id:`${type}:${date}`,start:`${date}T${config.startTime||"15:00"}`,durationDays:config.durationDays||7};
      for (const past of variants(basePast)) {
      const pastKey=PREFIX+past.id;
      let pastState=parse(await kv.get(pastKey),{});
      if (!pastState.closedAt || pastState.outcome!=="winner") continue;
      try {
        // The old coordinator rejected botw-standard/botw-elite IDs before any
        // Durable Object lookup or WOM POST. Only this exact pre-write rejection
        // is safe to retry; every other needs_review remains staff-only.
        if (pastState.womStatus === "needs_review" &&
            /^Metric [a-z0-9_]+ requires reconciliation: Invalid cycle$/.test(String(pastState.womError || "")) &&
            !pastState.womCompetitionId &&
            (!Array.isArray(pastState.womCompetitionIds) || pastState.womCompetitionIds.length === 0) &&
            (!Array.isArray(pastState.womCompetitions) || pastState.womCompetitions.length === 0)) {
          pastState={...pastState,womStatus:"awaiting_activation",womError:null};
          await kv.put(pastKey,JSON.stringify(pastState));
        }
        // A confirmed WOM title validation rejection is safe to retry using a
        // fresh coordinator identity; no competition was created by WOM.
        // Never retry uncertain outcomes or a partially created paired event.
        if (pastState.womStatus === "needs_review" &&
            /^Metric [a-z0-9_]+ requires reconciliation: Parameter ['\"]title['\"] must have a maximum of 50 character\(s\)\.$/.test(String(pastState.womError || "")) &&
            !pastState.womCompetitionId &&
            (!pastState.womCompetitions || pastState.womCompetitions.length === 0) &&
            !pastState.titleRetryVersion) {
          pastState={...pastState,womStatus:"awaiting_activation",womError:null,titleRetryVersion:1};
          await kv.put(pastKey,JSON.stringify(pastState));
        }
        // Recover only the rejected ToA Expert metric, never the already-created normal ToA.
        // The precise enum rejection means WOM rejected the second POST before creation.
        if (past.type === "botw-elite" && pastState.womStatus === "needs_review" &&
            /^Metric tombs_of_amascut_expert_mode requires reconciliation: Invalid enum value for ['"]metric['"]\.?$/.test(String(pastState.womError || "")) &&
            pastState.options?.[pastState.winningIndex]?.metrics?.join("|") === "Tombs of Amascut|Tombs of Amascut Expert Mode" &&
            pastState.womCompetitions?.length === 1 &&
            pastState.womCompetitions[0].metricIndex === 0 &&
            pastState.womCompetitions[0].metric === "tombs_of_amascut" &&
            /^\d+$/.test(String(pastState.womCompetitions[0].competitionId || "")) &&
            !pastState.expertRecoveryAttempted &&
            env.CYCLE_AUTO_WOM_CREATE_ENABLED === "true" && controls.womCreation) {
          const primary = pastState.womCompetitions[0];
          const primaryResponse = await womFetch(env, `/competitions/${primary.competitionId}`);
          if (!primaryResponse.ok) throw Error("Cannot verify existing ToA WOM competition");
          const primaryData = await primaryResponse.json();
          const primaryWom = primaryData?.competition || primaryData;
          if (String(primaryWom?.id) !== String(primary.competitionId) ||
              String(primaryWom?.groupId ?? primaryWom?.group?.id) !== "12095" ||
              primaryWom?.metric !== "tombs_of_amascut")
            throw Error("Existing ToA competition identity mismatch; manual review required");
          const startAt = torontoInstant(past.date, past.start.slice(11));
          if (Date.now() >= Date.parse(startAt)) throw Error("Competition start passed; staff rescheduling required");
          const title = `Ironkin BOTW Elite - ${past.date} (ToA Expert)`;
          const payload = {title, metric:"tombs_of_amascut_expert",startsAt:startAt,
            endsAt:torontoInstant(shift(past.date,past.durationDays||7),past.start.slice(11)),
            groupId:12095,groupVerificationCode:String(env.WOM_GROUP_VERIFICATION_CODE)};
          // Persist the intent before external POST. Do not retry an uncertain result.
          pastState = {...pastState,expertRecoveryAttempted:true,expertRecoveryAt:new Date().toISOString()};
          await kv.put(pastKey,JSON.stringify(pastState));
          const response = await env.CYCLE_COORDINATOR.fetch("https://cycle-coordinator.internal/create",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({id:`${past.id}:r2-1`,payload})});
          const result = await response.json().catch(()=>({}));
          if (!response.ok || result.status !== "created" || !/^\d+$/.test(String(result.competitionId || ""))) {
            pastState = {...pastState,womError:`Expert Mode recovery requires review: ${String(result.error||result.status||`HTTP ${response.status}`).slice(0,200)}`};
            await kv.put(pastKey,JSON.stringify(pastState));
          } else if (String(result.competitionId) === String(primary.competitionId)) {
            pastState = {...pastState,womError:"Expert Mode returned the primary competition ID; manual review required"};
            await kv.put(pastKey,JSON.stringify(pastState));
          } else {
            const competitions=[primary,{competitionId:String(result.competitionId),metric:"tombs_of_amascut_expert",role:"paired",metricIndex:1}];
            pastState={...pastState,womStatus:"created",womError:null,
              womCompetitionId:String(primary.competitionId),
              womCompetitionIds:competitions.map(c=>c.competitionId),womCompetitions:competitions,
              womMetric:"tombs_of_amascut + tombs_of_amascut_expert",
              womUrl:`https://wiseoldman.net/competitions/${primary.competitionId}`,
              womCreatedAt:new Date().toISOString()};
            await kv.put(pastKey,JSON.stringify(pastState));
          }
        }
        if (pastState.womStatus==="awaiting_activation" && env.CYCLE_AUTO_WOM_CREATE_ENABLED==="true" && controls.womCreation)
          pastState=await createWom(env,kv,pastKey,past,pastState,controls);
        if (pastState.womStatus==="created" && pastState.websiteStatus!=="linked")
          pastState=await linkOrFlag(kv,past,pastState);
        if (pastState.womStatus==="created" && pastState.websiteStatus==="linked")
          pastState=await syncCycleCalendar(env,kv,past,pastState);
        if (env.CYCLE_AUTO_FINALIZE_ENABLED==="true" && controls.finalization && pastState.womStatus==="created" && pastState.websiteStatus==="linked")
          await finalizeCompetition(env,kv,past,pastState);
      } catch(error) { console.warn(`Cycle maintenance ${past.id} requires review:`,error); }
      }
    }
  }
  if(request.method==="GET") {
    for (const candidate of currentEvents) {
    const candidateKey=PREFIX+candidate.id;
    const current=parse(await kv.get(candidateKey),{});
    if(controls.polling && !current.messageId && localTime(now)>=candidate.open && localTime(now)<candidate.close){
      const pools=parse(await kv.get("events:sotw-botw-pools:v1"),{});const winners=parse(await kv.get("events:sotw-botw-nomination-winners:v1"),{});const nominations=parse(await kv.get("events:sotw-botw-nominations:v1"),{});const history=parse(await kv.get("events:sotw-botw-rotation:v1"),{});
      const pool=(pools[candidate.type]||[]).filter(x=>typeof x==="string");const unique=[...new Map(pool.map(x=>[key(x,candidate.type),x])).values()];
      // Winner nominations are the sole authority for the first two slots.
      // Legacy drafts and reservations must never replace them.
      const nomination=nominations[candidate.type];
      const winnerInfo=await nominationNoticeStatus(env,candidate.type);
      const resolvedId=winnerInfo.status?.state==="resolved"?String(winnerInfo.status.discordId||""):"";
      const picks=resolvedId && String(nomination?.discordId)===resolvedId && (!nomination.cycleId || nomination.cycleId===candidate.id) ? nomination.options : null;
      const distinct=Array.isArray(picks)?[...new Map(picks.filter(x=>unique.some(v=>key(v,candidate.type)===key(x,candidate.type))).map(x=>[key(x,candidate.type),x])).values()]:[];
      try {
        if(distinct.length!==2)throw Error("Two valid previous-winner nominations are required before publishing; no random fallback.");
        const nominated=distinct.map(x=>label(x,candidate.type));
        const reserved=Array.isArray(current.pollOptions)&&current.pollOptions.length===3?current.pollOptions:null;
        if(reserved && nominated.some((x,i)=>key(x.metrics[0],candidate.type)!==key(reserved[i]?.metrics?.[0]||reserved[i]?.label||reserved[i],candidate.type)))
          throw Error("Reserved poll conflicts with winner nominations. Use staff poll recovery to reset it.");
        const random=reserved?null:choose(unique,new Set(distinct.map(x=>key(x,candidate.type))),history[candidate.type]||[],1,candidate.type);
        const options=reserved||[...nominated,...random.result];
        if(!reserved)await kv.put(candidateKey,JSON.stringify({...current,pollOptions:options,rotationReset:random.reset,pollReservedAt:now.toISOString()}));
        return Response.json({enabled:true,task:{action:"publish",...candidate,options,rotationReset:current.rotationReset??random?.reset??false}},{headers:{"Cache-Control":"no-store"}});
      } catch(e){return Response.json({enabled:true,error:String(e.message),task:null},{headers:{"Cache-Control":"no-store"}});}
    }
    if(current.messageId&&!current.closedAt&&localTime(now)>=candidate.close)return Response.json({enabled:true,task:{action:"close",...candidate,messageId:current.messageId,channelId:current.channelId,options:current.options}},{headers:{"Cache-Control":"no-store"}});
    }
    return Response.json({enabled:true,paused:!controls.polling,task:null},{headers:{"Cache-Control":"no-store"}});
  }
  if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  const body=await request.json();const target=currentEvents.find(item=>item.id===body.id);
  if(!target)return Response.json({error:"Unexpected event"},{status:409});
  const targetKey=PREFIX+target.id;
  const targetState=parse(await kv.get(targetKey),{});
  if(body.action==="published"){
    if(!controls.polling && !targetState.pollReservedAt)return Response.json({error:"Polling is paused and no poll was reserved."},{status:409});
    if(targetState.messageId)return Response.json({success:true,state:targetState});
    if(!/^\d{17,20}$/.test(String(body.messageId))||!/^\d{17,20}$/.test(String(body.channelId))||!Array.isArray(body.options)||body.options.length!==3)return Response.json({error:"Invalid poll receipt"},{status:400});
    if (!Array.isArray(targetState.pollOptions) || JSON.stringify(targetState.pollOptions) !== JSON.stringify(body.options))
      return Response.json({error:"Poll options differ from reserved choices; staff review required"},{status:409});
    const record={...targetState,messageId:String(body.messageId),channelId:String(body.channelId),options:targetState.pollOptions,publishedAt:now.toISOString()};await kv.put(targetKey,JSON.stringify(record));return Response.json({success:true});
  }
  if(body.action==="closed"){
    if(targetState.closedAt){
      const linked=await linkOrFlag(kv,target,targetState);
      return Response.json({success:true,alreadyClosed:true,state:await syncCycleCalendar(env,kv,target,linked)});
    }
    if (localTime(now) < target.close) return Response.json({error:"Voting is still open"},{status:409});
    if(!targetState.messageId||String(body.messageId)!==targetState.messageId||!Array.isArray(body.counts)||body.counts.length!==3||body.counts.some(n=>!Number.isInteger(n)||n<0))return Response.json({error:"Invalid poll result"},{status:400});
    const top=Math.max(...body.counts);const winning=body.counts.map((n,i)=>n===top?i:-1).filter(i=>i>=0);const outcome=top===0?"no_votes":winning.length>1?"tie":"winner";
    const record={...targetState,closedAt:now.toISOString(),counts:body.counts,outcome,winningIndex:outcome==="winner"?winning[0]:null};await kv.put(targetKey,JSON.stringify(record));
    const updated = await createWom(env,kv,targetKey,target,record,controls);
    const linked=await linkOrFlag(kv,target,updated);
    return Response.json({success:true,alreadyClosed:false,state:await syncCycleCalendar(env,kv,target,linked)});
  }
  return Response.json({error:"Unknown action"},{status:400});
}
