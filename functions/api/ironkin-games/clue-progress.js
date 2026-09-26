import { getSession } from "../_auth.js";
import { loadGames, memberTeam, challengeFor } from "./_store.js";

const WOM_GROUP_ID = "12095";
const WOM_BASE = "https://api.wiseoldman.net/v2";
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
  const activity = data?.activities?.[metric] ?? data?.[metric];
  if (typeof activity === "number") return Math.max(0, activity);
  if (activity && typeof activity === "object") {
    if (typeof activity.gained === "number") return Math.max(0, activity.gained);
    if (typeof activity.score?.gained === "number") return Math.max(0, activity.score.gained);
    if (typeof activity.value?.gained === "number") return Math.max(0, activity.value.gained);
  }
  const metricRow = Array.isArray(data) ? data.find(x => x?.metric === metric) : null;
  return Math.max(0, Number(metricRow?.gained ?? metricRow?.score?.gained ?? metricRow?.values?.gained) || 0);
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in to view team progress." }, { status:401 });
  const state = await loadGames(env);
  const team = memberTeam(state, session);
  if (!team) return Response.json({ error:"You are not assigned to an Ironkin Games team." }, { status:403 });

  const url = new URL(request.url);
  const weekId = url.searchParams.get("weekId") || "";
  const challengeId = url.searchParams.get("challengeId") || "";
  const { week, challenge } = challengeFor(state, weekId, challengeId);
  if (!week || !challenge) return Response.json({ error:"Challenge not found." }, { status:404 });
  if (String(challenge.kind || "main") !== "side" || !/clue/i.test(`${challenge.name || ""} ${challenge.objective || ""}`)) {
    return Response.json({ error:"Progress tracking is not available for this challenge." }, { status:400 });
  }

  const opensAt = challenge.opensAt || week.startDate;
  const closesAt = challenge.closesAt || week.endDate;
  const startMs = new Date(opensAt || 0).getTime();
  const closeMs = new Date(closesAt || Date.now()).getTime();
  const endMs = Math.min(Date.now(), Number.isFinite(closeMs) ? closeMs : Date.now());
  if (Number.isFinite(startMs) && Date.now() < startMs) return Response.json({ error:"This challenge has not started yet." }, { status:400 });

  const roster = [...(team.members || [])];
  const captainId = String(team.captainDiscordId || "");
  if (captainId && !roster.some(p => idOf(p) === captainId)) {
    const captain = (state.signups || []).find(p => idOf(p) === captainId);
    if (captain) roster.unshift(captain);
  }
  const players = roster.filter(p => rsnOf(p));

  const headers = { "Accept":"application/json" };
  if (env.WOM_API_KEY) headers["x-api-key"] = env.WOM_API_KEY;
  const qs = new URLSearchParams({ startDate:new Date(startMs).toISOString(), endDate:new Date(endMs).toISOString() });
  const response = await fetch(`${WOM_BASE}/groups/${WOM_GROUP_ID}/bulk-gained?${qs}`, { headers });
  if (!response.ok) return Response.json({ error:`Wise Old Man progress could not be loaded (${response.status}).` }, { status:502 });
  const bulk = await response.json();
  const entries = Array.isArray(bulk) ? bulk : (Array.isArray(bulk?.data) ? bulk.data : []);
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
    return { rsn, name:String(player.name || player.displayName || rsn), tiers, clues, points };
  }).sort((a,b) => b.points - a.points || b.clues - a.clues || a.rsn.localeCompare(b.rsn));

  return Response.json({
    team:{ id:team.id, name:team.name },
    challenge:{ id:challenge.id, name:challenge.name },
    startsAt:new Date(startMs).toISOString(), endsAt:new Date(endMs).toISOString(),
    rows,
    totals:{ clues:rows.reduce((n,r)=>n+r.clues,0), points:rows.reduce((n,r)=>n+r.points,0) }
  }, { headers:{ "Cache-Control":"no-store" } });
}
