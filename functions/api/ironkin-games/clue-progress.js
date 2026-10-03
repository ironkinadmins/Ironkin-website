import { getSession } from "../_auth.js";
import { loadGames, memberTeam, challengeFor } from "./_store.js";
import { hybridKv } from "../../_hybridKv.js";

const WOM_GROUP_ID = "12095";
const WOM_BASE = "https://api.wiseoldman.net/v2";
const REFRESH_MS = 60 * 60 * 1000;
const STALE_TTL_SECONDS = 7 * 24 * 60 * 60;
const TIERS = [
  ["beginner", "clue_scrolls_beginner", 0.5],
  ["easy", "clue_scrolls_easy", 1],
  ["medium", "clue_scrolls_medium", 2],
  ["hard", "clue_scrolls_hard", 4],
  ["elite", "clue_scrolls_elite", 7],
  ["master", "clue_scrolls_master", 10]
];

function idOf(p){ return String(p?.discordId || p?.id || ""); }
function rsnOf(p){ return String(p?.rsn || p?.name || "").trim(); }
function norm(v){ return String(v || "").trim().toLowerCase().replace(/[ _-]+/g, " "); }
function gainedValue(entry, metric){
  const data = entry?.data || entry?.gains || entry || {};
  if (Array.isArray(data)) {
    const row = data.find(x => String(x?.metric || "") === metric);
    return Math.max(0, Number(row?.gained ?? row?.score?.gained ?? row?.values?.gained) || 0);
  }
  const activity = data?.activities?.[metric] ?? data?.[metric];
  if (typeof activity === "number") return Math.max(0, activity);
  if (activity && typeof activity === "object") {
    if (typeof activity.gained === "number") return Math.max(0, activity.gained);
    if (typeof activity.score?.gained === "number") return Math.max(0, activity.score.gained);
    if (typeof activity.value?.gained === "number") return Math.max(0, activity.value.gained);
  }
  return 0;
}
function json(body, status=200){
  return Response.json(body, { status, headers:{ "Cache-Control":"no-store" } });
}
async function womBulkOnce(startIso, endIso, env){
  const qs = new URLSearchParams({ startDate:startIso, endDate:endIso });
  const url = `${WOM_BASE}/groups/${WOM_GROUP_ID}/bulk-gained?${qs}`;
  const headers = { "Accept":"application/json" };
  if (env?.WOM_API_KEY) headers["x-api-key"] = env.WOM_API_KEY;
  let response;
  try {
    response = await fetch(url, { headers, signal:AbortSignal.timeout(12000) });
  } catch (error) {
    throw new Error(`Could not connect to Wise Old Man: ${error?.message || "network request failed"}`);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const detail = body?.message || body?.error || (text && text.length < 180 ? text : "");
    throw new Error(`Wise Old Man returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  if (!Array.isArray(body) && !Array.isArray(body?.data)) {
    throw new Error("Wise Old Man returned an unexpected progress response.");
  }
  return Array.isArray(body) ? body : body.data;
}
async function womBulk(startIso,endIso,env){
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{return await womBulkOnce(startIso,endIso,env);}catch(error){last=error;if(attempt<2) await new Promise(r=>setTimeout(r,250*(attempt+1)));}
  }
  throw last;
}

export async function onRequestGet({ request, env }) {
  try {
    const session = await getSession(request, env);
    if (!session) return json({ error:"Sign in to view team progress." }, 401);

    const state = await loadGames(env);
    const team = memberTeam(state, session);
    if (!team) return json({ error:"You are not assigned to an Ironkin Games team." }, 403);

    const url = new URL(request.url);
    const weekId = url.searchParams.get("weekId") || "";
    const challengeId = url.searchParams.get("challengeId") || "";
    const { week, challenge } = challengeFor(state, weekId, challengeId);
    if (!week || !challenge) return json({ error:"Challenge not found." }, 404);
    if (!["wom-clues","clue-progress"].includes(String(challenge.trackerType || "")) && !(String(challenge.kind || "main") === "side" && /clue/i.test(`${challenge.name || ""} ${challenge.objective || ""}`))) {
      return json({ error:"Progress tracking is not available for this challenge." }, 400);
    }

    const cacheKey = `ironkin-games:clue-progress:${weekId}:${challengeId}:${team.id}`;
    const kv = hybridKv(env, "drops");
    const forceRefresh = url.searchParams.get("refresh") === "1";
    let cached = null;
    if (kv) {
      try {
        const cachedRaw = await kv.get(cacheKey);
        cached = cachedRaw ? JSON.parse(cachedRaw) : null;
      } catch (error) {
        console.warn("Clue progress cache read failed", error);
      }
    }
    const cachedAtMs = new Date(cached?.updatedAt || 0).getTime();
    const refreshAvailableAt = Number.isFinite(cachedAtMs) ? cachedAtMs + REFRESH_MS : 0;
    if (cached && (!forceRefresh || Date.now() < refreshAvailableAt)) {
      return json({ ...cached, refreshAvailableAt });
    }

    const startMs = new Date(challenge.opensAt || week.startDate || "").getTime();
    const closeMs = new Date(challenge.closesAt || week.endDate || "").getTime();
    if (!Number.isFinite(startMs)) return json({ error:"The challenge start time is not configured correctly." }, 500);
    if (Date.now() < startMs) return json({ error:"This challenge has not started yet." }, 400);
    const endMs = Math.min(Date.now(), Number.isFinite(closeMs) ? closeMs : Date.now());

    const roster = [...(team.members || [])];
    const captainId = String(team.captainDiscordId || "");
    if (captainId && !roster.some(p => idOf(p) === captainId)) {
      const captain = (state.signups || []).find(p => idOf(p) === captainId);
      if (captain) roster.unshift(captain);
    }
    const players = roster.filter(p => rsnOf(p));
    if (!players.length) return json({ error:"No OSRS names were found for your team roster." }, 400);

    let entries;
    try { entries = await womBulk(new Date(startMs).toISOString(), new Date(endMs).toISOString(), env); }
    catch (error) {
      console.error("Clue progress WOM refresh failed", error);
      if (cached) return json({ ...cached, stale:true, warning:"Wise Old Man is temporarily unavailable. Showing the last successful team progress.", refreshAvailableAt:Date.now()+60000 });
      throw error;
    }
    const byName = new Map(entries.map(entry => [norm(entry?.player?.displayName || entry?.player?.username || entry?.username), entry]));

    const rows = players.map(player => {
      const rsn = rsnOf(player);
      const entry = byName.get(norm(rsn));
      const tiers = {};
      let clues = 0, points = 0;
      for (const [key, metric, weight] of TIERS) {
        const count = Math.floor(gainedValue(entry, metric));
        tiers[key] = count;
        clues += count;
        points += count * weight;
      }
      return { rsn, name:String(player.name || player.displayName || rsn), tiers, clues, points, tracked:Boolean(entry) };
    }).sort((a,b) => b.points - a.points || b.clues - a.clues || a.rsn.localeCompare(b.rsn));

    const payload = {
      team:{ id:team.id, name:team.name },
      challenge:{ id:challenge.id, name:challenge.name },
      startsAt:new Date(startMs).toISOString(), endsAt:new Date(endMs).toISOString(),
      rows,
      totals:{ clues:rows.reduce((n,r)=>n+r.clues,0), points:rows.reduce((n,r)=>n+r.points,0) },
      updatedAt:new Date().toISOString()
    };
    if (kv) {
      try { await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl:STALE_TTL_SECONDS }); }
      catch (error) { console.warn("Clue progress cache write failed", error); }
    }
    return json({ ...payload, refreshAvailableAt:Date.now() + REFRESH_MS });
  } catch (error) {
    console.error("Clue progress failed", error);
    return json({ error:error?.message || "Could not load team progress." }, 502);
  }
}
