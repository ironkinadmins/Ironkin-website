import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

const KEY = "events:sotw-botw-cycle:v1";
const DEFAULT = { enabled: false, startDate: "", startTime: "15:00", firstEvent: "botw" };
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
  const pair = type === "botw" ? pairLookup.get(label.toLowerCase()) : null;
  return pair ? pair[0].toLowerCase() : label.toLowerCase();
};
const canonical = (value, type) => {
  const label = normalize(value);
  const pair = type === "botw" ? pairLookup.get(label.toLowerCase()) : null;
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
  return { enabled, startDate, startTime, firstEvent };
}
function votingWindow(startDate, startTime) {
  // Break-week voting is relative to the next competition, regardless of weekday.
  // All times are local America/Toronto wall times.
  const anchor = new Date(`${startDate}T12:00:00Z`);
  const before = days => new Date(anchor.getTime() - days * 86400000).toISOString().slice(0,10);
  return {
    nominationDeadline: {date: before(4), time: startTime, timeZone: TZ},
    pollOpens: {date: before(3), time: startTime, timeZone: TZ},
    pollCloses: {date: before(1), time: startTime, timeZone: TZ}
  };
}
function preview(config) {
  if (!config.startDate) return [];
  const date = new Date(`${config.startDate}T12:00:00Z`);
  return Array.from({length: 12}, (_, i) => {
    const d = new Date(date.getTime() + i * 7 * 86400000);
    const week = d.toISOString().slice(0, 10);
    const type = i % 2 ? "break" : i % 4 === 0 ? config.firstEvent : config.firstEvent === "botw" ? "sotw" : "botw";
    return { startDate: week, endDate: new Date(d.getTime() + 7 * 86400000).toISOString().slice(0, 10), startTime: config.startTime, timeZone: TZ, type, ...(type === "break" ? {} : {voting: votingWindow(week, config.startTime)}) };
  });
}
export async function onRequest({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({error:"Staff only."},{status:403});
  const kv = hybridKv(env, "drops");
  if (request.method === "GET") {
    const [poolRaw, draftRaw, historyRaw, winnersRaw, nominationsRaw, winnerStatusRaw] = await Promise.all([kv.get(POOL_KEY), kv.get(DRAFT_KEY), kv.get(HISTORY_KEY), kv.get(WINNERS_KEY), kv.get(NOMINATIONS_KEY), kv.get(WINNER_STATUS_KEY)]);
    const pools = parse(poolRaw, { botw: [], sotw: [] });
    const drafts = parse(draftRaw, {});
    const rotation = parse(historyRaw, { botw: [], sotw: [] });
    const raw = await kv.get(KEY);
    let config = DEFAULT;
    try { if (raw) config = {...DEFAULT, ...JSON.parse(raw)}; } catch { /* invalid old data */ }
    return Response.json({config, preview: preview(config), pools, drafts, rotation, pairedBosses: BOSS_PAIRS, winners:parse(winnersRaw, {}), winnerStatus:parse(winnerStatusRaw, {}), nominations:parse(nominationsRaw, {})});
  }
  if (request.method === "PUT") {
    try {
      const body = await request.json();
      if (body.action === "save-pools") {
        const pools = {botw:cleanPool(body.botw, "botw"), sotw:cleanPool(body.sotw, "sotw")};
        await kv.put(POOL_KEY, JSON.stringify(pools));
        return Response.json({success:true,pools});
      }
      if (body.action === "prepare-draft") {
        const type = body.type;
        if (!["botw", "sotw"].includes(type)) throw Error("Choose BOTW or SOTW.");
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
        const draft = {type,authorizedWinnerId:winners[type] || null,options:[...nominations.map(item => canonical(item,type)),...random],winnerPicks:nominations.length,rotationResetSuggested:reset,createdAt:new Date().toISOString(),status:"draft"};
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
    const config = validate(await request.json());
    await kv.put(KEY, JSON.stringify({...config, updatedAt:new Date().toISOString()}));
    return Response.json({success:true,config,preview:preview(config)});
  } catch (error) { return Response.json({error:error.message || "Invalid configuration."},{status:400}); }
}
