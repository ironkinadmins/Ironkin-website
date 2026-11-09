import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

const KEY = "events:sotw-botw-cycle:v1";
const CONTROLS_KEY = "events:sotw-botw-controls:v1";
const CONTROL_DEFAULTS = {polling:true, womCreation:true, finalization:true, nominationReminders:true,resultsAnnouncements:true};
const controlKeys = Object.keys(CONTROL_DEFAULTS);
const DEFAULT = { enabled: false, startDate: "", startTime: "15:00", firstEvent: "botw", durationDays:7, rotationDays:14 };
const TZ = "America/Toronto";
// Canonical poll identities. Both WOM metrics are retained for later event creation.
const BOSS_PAIRS = [
  ["Artio", "Callisto"], ["Calvar'ion", "Vet'ion"],
  ["Spindel", "Venenatis"], ["The Nightmare", "Phosani's Nightmare"],
  ["Gauntlet", "Corrupted Gauntlet"],
  ["Chambers of Xeric", "Chambers of Xeric Challenge Mode"],
  ["Theatre of Blood", "Theatre of Blood Hard Mode"],
  ["Tombs of Amascut", "Tombs of Amascut Expert Mode"]
];
const pairLookup = new Map(BOSS_PAIRS.flatMap(pair => pair.map(name => [name.toLowerCase(), pair])));
const normalize = value => String(value || "").trim().replace(/\s+/g, " ");
const identity = (value, type) => {
  const label = normalize(value);
  const pair = type.startsWith("botw") ? pairLookup.get(label.toLowerCase()) : null;
  return pair ? pair[0].toLowerCase() : label.toLowerCase();
};
const canonical = (value, type) => {
  const label = normalize(value);
  const pair = type.startsWith("botw") ? pairLookup.get(label.toLowerCase()) : null;
  return pair ? { label: pair.join(" + "), metrics: pair } : { label, metrics: [label] };
};
function cleanPool(input, type) {
  if (!Array.isArray(input) || input.length > 200) throw Error("Provide up to 200 enabled options.");
  const seen = new Set();
  return input.map(value => {
    if (typeof value !== "string" || !normalize(value) || normalize(value).length > 100) throw Error("Invalid option name.");
    return normalize(value);
  }).filter(value => {
    const key = identity(value, type);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function randomIndex(length) {
  const values = new Uint32Array(1);
  const limit = Math.floor(4294967296 / length) * length;
  do { crypto.getRandomValues(values); } while (values[0] >= limit);
  return values[0] % length;
}
function draw(pool, excluded, count, type) {
  const candidates = pool.filter(item => !excluded.has(identity(item, type)));
  if (candidates.length < count) throw Error("Not enough distinct eligible options to fill the poll.");
  const chosen = [];
  while (chosen.length < count) {
    const index = randomIndex(candidates.length);
    const [item] = candidates.splice(index, 1);
    chosen.push(canonical(item, type));
  }
  return chosen;
}
const DRAFT_KEY = "events:sotw-botw-poll-drafts:v1";
const POOL_KEY = "events:sotw-botw-pools:v1";
const HISTORY_KEY = "events:sotw-botw-rotation:v1";
const WINNERS_KEY = "events:sotw-botw-nomination-winners:v1";
const NOMINATIONS_KEY = "events:sotw-botw-nominations:v1";
const WINNER_STATUS_KEY = "events:sotw-botw-winner-status:v1";
const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };

const pad = n => String(n).padStart(2, "0");
function validate(input) {
  const startDate = String(input?.startDate || "");
  const startTime = String(input?.startTime || "15:00");
  const firstEvent = String(input?.firstEvent || "botw");
  const enabled = input?.enabled === true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw Error("Choose a valid cycle start date.");
  const d = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== startDate) throw Error("Choose a valid calendar date.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw Error("Choose a valid 24-hour start time.");
  if (!["botw", "sotw"].includes(firstEvent)) throw Error("Choose BOTW or SOTW.");
  if (enabled && startDate < new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())) throw Error("Cannot activate a cycle starting in the past.");
  const durationDays=Number(input?.durationDays ?? 7), rotationDays=Number(input?.rotationDays ?? 14);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 28) throw Error("Duration must be 1–28 days.");
  if (!Number.isInteger(rotationDays) || rotationDays < 7 || rotationDays > 56 || rotationDays % 7) throw Error("Rotation must be 7–56 days in weekly increments.");
  if (durationDays > rotationDays) throw Error("Competition duration cannot exceed the rotation interval.");
  return { enabled, startDate, startTime, firstEvent, durationDays, rotationDays };
}
function votingWindow(startDate, startTime) {
  // Break-week voting is relative to the next competition, regardless of weekday.
  // All times are local America/Toronto wall times.
  const anchor = new Date(`${startDate}T12:00:00Z`);
  const before = days => new Date(anchor.getTime() - days * 86400000).toISOString().slice(0,10);
  return {
    nominationDeadline: {date: before(startDate === "2026-11-13" ? 2 : 7), time: startTime, timeZone: TZ},
    pollOpens: {date: before(startDate === "2026-11-13" ? 2 : 7), time: startTime, timeZone: TZ},
    pollCloses: {date: before(1), time: startTime, timeZone: TZ}
  };
}
function preview(config) {
  if (!config.startDate) return [];
  const date = new Date(`${config.startDate}T12:00:00Z`);
  return Array.from({length: 12}, (_, i) => {
    const d = new Date(date.getTime() + i * (config.rotationDays || 14) * 86400000);
    const week = d.toISOString().slice(0, 10);
    const type = i % 2 === 0 ? config.firstEvent : config.firstEvent === "botw" ? "sotw" : "botw";
    return { startDate: week, endDate: new Date(d.getTime() + (config.durationDays || 7) * 86400000).toISOString().slice(0, 10), startTime: config.startTime, timeZone: TZ, type, ...(type === "break" ? {} : {voting: votingWindow(week, config.startTime)}) };
  });
}
export async function onRequest({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({error:"Staff only."},{status:403});
  const kv = hybridKv(env, "drops");
  if (request.method === "GET") {
    const [poolRaw, draftRaw, historyRaw, winnersRaw, nominationsRaw, winnerStatusRaw, controlsRaw] = await Promise.all([kv.get(POOL_KEY), kv.get(DRAFT_KEY), kv.get(HISTORY_KEY), kv.get(WINNERS_KEY), kv.get(NOMINATIONS_KEY), kv.get(WINNER_STATUS_KEY), kv.get(CONTROLS_KEY)]);
    const pools = parse(poolRaw, { botw: [], sotw: [] });
    const drafts = parse(draftRaw, {});
    const rotation = parse(historyRaw, { botw: [], sotw: [] });
    const raw = await kv.get(KEY);
    let config = DEFAULT;
    try { if (raw) config = {...DEFAULT, ...JSON.parse(raw)}; } catch { /* invalid old data */ }
    return Response.json({config, controls:{...CONTROL_DEFAULTS,...parse(controlsRaw,{})}, gates:{womCreation:env.CYCLE_AUTO_WOM_CREATE_ENABLED === "true",finalization:env.CYCLE_AUTO_FINALIZE_ENABLED === "true"}, preview: preview(config), pools, drafts, rotation, pairedBosses: BOSS_PAIRS, winners:parse(winnersRaw, {}), winnerStatus:parse(winnerStatusRaw, {}), nominations:parse(nominationsRaw, {})});
  }
  if (request.method === "PUT") {
    try {
      const body = await request.json();
      if (body.action === "save-controls") {
        const origin = request.headers.get("Origin");
        if (!origin || new URL(origin).origin !== new URL(request.url).origin) return Response.json({error:"Invalid origin."},{status:403});
        if (!body.controls || typeof body.controls !== "object" || Array.isArray(body.controls) || Object.keys(body.controls).some(k=>!controlKeys.includes(k)) || Object.values(body.controls).some(v=>typeof v !== "boolean")) throw Error("Invalid automation controls.");
        const previous={...CONTROL_DEFAULTS,...parse(await kv.get(CONTROLS_KEY),{})};
        const next={...previous,...body.controls,updatedAt:new Date().toISOString()};
        if (next.womCreation && env.CYCLE_AUTO_WOM_CREATE_ENABLED !== "true") throw Error("Cloudflare WOM creation safety flag is disabled.");
        if (next.finalization && env.CYCLE_AUTO_FINALIZE_ENABLED !== "true") throw Error("Cloudflare finalization safety flag is disabled.");
        await kv.put(CONTROLS_KEY,JSON.stringify(next));
        try { await kv.put(`events:sotw-botw-controls-audit:${Date.now()}`,JSON.stringify({before:previous,after:next,at:next.updatedAt}),{expirationTtl:90*86400}); } catch(error) { console.warn("Cycle controls audit write failed",error); }
        return Response.json({success:true,controls:next});
      }
      if (body.action === "verify-category-winner") {
        const origin = request.headers.get("Origin");
        if (!origin || new URL(origin).origin !== new URL(request.url).origin) return Response.json({error:"Invalid origin."},{status:403});
        const type=String(body.type||"");
        if (!["botw-standard","botw-elite"].includes(type)) throw Error("Choose Standard or Elite.");
        const archiveId=String(body.archiveId||"").trim();
        if (!archiveId || archiveId.length>128) throw Error("A matching archived competition ID is required.");
        const archives=parse(await kv.get("events:archive"),[]);
        const entry=Array.isArray(archives)?archives.find(x=>String(x.id)===archiveId):null;
        if (!entry || entry.type!=="botw" || entry.botwTier!==type.slice(5)) throw Error("Archive does not match the selected BOTW category.");
        const rows=(Array.isArray(entry.leaderboard)?entry.leaderboard:[]).filter(x=>Number(x.gained)>0).sort((a,b)=>Number(b.gained)-Number(a.gained));
        if (!rows.length || (rows[1] && Number(rows[0].gained)===Number(rows[1].gained))) throw Error("Archived results have no unique positive first-place winner.");
        const normalized=value=>String(value||"").trim().toLowerCase().replace(/[ _-]+/g," ");
        const index=parse(await kv.get("member-profiles:index"),[]);
        const matches=[];
        for(const profile of Array.isArray(index)?index:[]){
          if(!/^\d{17,20}$/.test(String(profile.discordId||"")))continue;
          const record=parse(await kv.get(`member-profile:${profile.discordId}`),{});
          if([record.rsn,...(Array.isArray(record.previousRsns)?record.previousRsns:[])].map(normalized).includes(normalized(rows[0].name)))matches.push(String(profile.discordId));
        }
        if(matches.length!==1)throw Error("Winning RSN is not uniquely linked to a Discord member; manual investigation required.");
        const winners=parse(await kv.get(WINNERS_KEY),{}),nominations=parse(await kv.get(NOMINATIONS_KEY),{}),statuses=parse(await kv.get(WINNER_STATUS_KEY),{});
        if(winners[type]!==matches[0])delete nominations[type];
        winners[type]=matches[0];
        statuses[type]={state:"resolved",discordId:matches[0],rsn:rows[0].name,eventId:entry.eventId,archiveId,verifiedBy:"staff-archive-reconciliation",updatedAt:new Date().toISOString()};
        await kv.put(WINNERS_KEY,JSON.stringify(winners));
        await kv.put(NOMINATIONS_KEY,JSON.stringify(nominations));
        await kv.put(WINNER_STATUS_KEY,JSON.stringify(statuses));
        await kv.put(`${WINNER_STATUS_KEY}:${type}`,JSON.stringify(statuses[type]));
        // Hybrid storage may accept a legacy KV write while its preferred Supabase
        // copy is stale. Never claim verification succeeded until the same read
        // path used by the notification dashboard sees the exact winner.
        const savedStatuses=parse(await kv.get(WINNER_STATUS_KEY),{});
        const savedWinners=parse(await kv.get(WINNERS_KEY),{});
        if(savedStatuses[type]?.state!=="resolved" || savedStatuses[type]?.discordId!==matches[0] || savedStatuses[type]?.archiveId!==archiveId || savedWinners[type]!==matches[0]) {
          return Response.json({error:"Winner verification could not be confirmed in the shared storage. Please do not send invitations; check Supabase/Cloudflare KV synchronization.",code:"WINNER_STORAGE_MISMATCH"},{status:503,headers:{"Cache-Control":"no-store"}});
        }
        await kv.put(`events:sotw-botw-winner-verification-audit:${type}:${Date.now()}`,JSON.stringify({type,archiveId,discordId:matches[0],at:statuses[type].updatedAt}),{expirationTtl:365*86400});
        return Response.json({success:true,status:savedStatuses[type]},{headers:{"Cache-Control":"no-store"}});
      }
      if (body.action === "save-pools") {
        const pools = {"botw-standard":cleanPool(body["botw-standard"], "botw-standard"), "botw-elite":cleanPool(body["botw-elite"], "botw-elite"), sotw:cleanPool(body.sotw, "sotw")};
        await kv.put(POOL_KEY, JSON.stringify(pools));
        return Response.json({success:true,pools});
      }
      if (body.action === "clear-draft") {
        const type = body.type;
        if (!["botw-standard", "botw-elite", "sotw"].includes(type)) throw Error("Invalid competition type.");
        const drafts = parse(await kv.get(DRAFT_KEY), {});
        const draft = drafts[type];
        if (!draft) return Response.json({success:true,cleared:false});
        const cycleId = String(draft.cycleId || "");
        if (!/^(botw-standard|botw-elite|sotw):\d{4}-\d{2}-\d{2}$/.test(cycleId) || !cycleId.startsWith(type+":")) throw Error("Draft cycle is invalid; staff review required.");
        const state = parse(await kv.get(`events:sotw-botw-automation:v1:${cycleId}`), {});
        if (state.messageId || state.publishedAt || state.pollReservedAt || (Array.isArray(state.pollOptions) && state.pollOptions.length))
          return Response.json({error:"Official poll is already reserved or published. Draft cannot be cleared safely."},{status:409});
        delete drafts[type];
        await kv.put(DRAFT_KEY, JSON.stringify(drafts));
        return Response.json({success:true,cleared:true,cycleId});
      }
      if (body.action === "prepare-draft") {
        const type = body.type;
        if (!["botw-standard", "botw-elite", "sotw"].includes(type)) throw Error("Choose BOTW or SOTW.");
        const cycle = parse(await kv.get(KEY), DEFAULT);
        if (!cycle.startDate) throw Error("Save the cycle schedule before preparing a poll.");
        const pools = parse(await kv.get(POOL_KEY), {botw:[],sotw:[]});
        const pool = cleanPool(pools[type], type);
        if (pool.length < 3) throw Error("At least three distinct enabled options are required.");
        const winners = parse(await kv.get(WINNERS_KEY), {});
        const saved = parse(await kv.get(NOMINATIONS_KEY), {});
        const winnerPicks = winners[type] && saved[type]?.discordId === winners[type] ? saved[type].options : [];
        const nominations = cleanPool(winnerPicks || [], type);
        const maximum = 2;
        if (nominations.length > maximum) throw Error(`Only ${maximum} winner nominations are allowed.`);
        for (const nomination of nominations) {
          if (!pool.some(item => identity(item,type) === identity(nomination,type))) throw Error(`Nomination is not enabled: ${nomination}`);
        }
        const excluded = new Set(nominations.map(item => identity(item,type)));
        const history = parse(await kv.get(HISTORY_KEY), {botw:[],sotw:[]});
        let remaining = pool.filter(item => !excluded.has(identity(item,type)) && !(history[type] || []).includes(identity(item,type)));
        const needed = 3 - nominations.length;
        // Reset the random bag only when it cannot supply the required options.
        const reset = remaining.length < needed;
        if (reset) remaining = pool.filter(item => !excluded.has(identity(item,type)));
        const random = draw(remaining, excluded, needed, type);
        // Bind the draft to the next scheduled cycle of this competition type.
        // Prevents a stale draft from silently becoming a later live poll.
        const today = new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
        let cycleId = null;
        for (let i=0;i<208;i++) {
          const date=new Date(Date.parse(`${cycle.startDate}T12:00:00Z`)+i*(cycle.rotationDays||14)*86400000).toISOString().slice(0,10);
          const eventType=i%2===0?cycle.firstEvent:(cycle.firstEvent==="botw"?"sotw":"botw");
          if (eventType===(type.startsWith("botw-")?"botw":type) && date>=today) {cycleId=`${type}:${date}`;break;}
        }
        if (!cycleId) throw Error("No upcoming cycle found for this competition type.");
        const draft = {cycleId,type,authorizedWinnerId:winners[type] || null,options:[...nominations.map(item => canonical(item,type)),...random],winnerPicks:nominations.length,rotationResetSuggested:reset,createdAt:new Date().toISOString(),status:"draft"};
        const drafts = parse(await kv.get(DRAFT_KEY), {});
        drafts[type] = draft;
        await kv.put(DRAFT_KEY, JSON.stringify(drafts));
        return Response.json({success:true,draft});
      }
      throw Error("Unknown action.");
    } catch (error) { return Response.json({error:error.message || "Invalid request."},{status:400}); }
  }
  if (request.method !== "POST") return Response.json({error:"Method not allowed."},{status:405});
  try {
    const origin=request.headers.get("Origin");
    if (!origin || new URL(origin).origin!==new URL(request.url).origin) return Response.json({error:"Invalid origin."},{status:403});
    const config = validate(await request.json());
    const existing=parse(await kv.get(KEY),DEFAULT);
    if (existing.startDate && (existing.startDate!==config.startDate || existing.startTime!==config.startTime || existing.firstEvent!==config.firstEvent || (existing.durationDays||7)!==config.durationDays || (existing.rotationDays||14)!==config.rotationDays)) {
      const currentDay=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      for(let i=0;i<104;i++){
        const date=new Date(Date.parse(`${existing.startDate}T12:00:00Z`)+i*(existing.rotationDays||14)*86400000).toISOString().slice(0,10);
        if(date>new Date(Date.parse(`${currentDay}T12:00:00Z`)+4*(existing.rotationDays||14)*86400000).toISOString().slice(0,10))break;
        const type=i%2===0?existing.firstEvent:existing.firstEvent==="botw"?"sotw":"botw";
        for (const category of type === "botw" ? ["botw-standard","botw-elite","botw"] : ["sotw"]) {
          const record=parse(await kv.get(`events:sotw-botw-automation:v1:${category}:${date}`),{});
          if(record.messageId || record.pollReservedAt || record.closedAt || record.womStatus) return Response.json({error:"Schedule is locked by an existing official cycle. Do not change its dates without a migration."},{status:409});
        }
      }
    }
    // The schedule editor is not an activation switch. Preserve the deployed state.
    config.enabled = existing.enabled === true;
    await kv.put(KEY, JSON.stringify({...config, updatedAt:new Date().toISOString()}));
    return Response.json({success:true,config,preview:preview(config)});
  } catch (error) { return Response.json({error:error.message || "Invalid configuration."},{status:400}); }
}
