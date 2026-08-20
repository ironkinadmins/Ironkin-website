import { hybridKv } from "../../_hybridKv.js";
import { getSession } from "../_auth.js";
import { loadGames, saveGames, balanceSignups } from "./_store.js";

const WOM_GROUP_ID = "12095";
const WOM_BASE = "https://api.wiseoldman.net/v2";
const GROUP_CACHE_KEY = "ironkin-games:wom-group-members:v1";

function normalizeRsn(value) {
  return String(value || "").trim().toLowerCase().replace(/[ _-]+/g, " ");
}

function validTimezone(value) {
  const timezone = String(value || "").trim();
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function womFetch(env, path) {
  const headers = { "User-Agent": "Ironkin Games signup" };
  if (env.WOM_API_KEY) headers["x-api-key"] = env.WOM_API_KEY;
  const response = await fetch(`${WOM_BASE}${path}`, { headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.error || `Wise Old Man returned ${response.status}`);
  return data;
}

async function groupMembers(env) {
  const cached = await hybridKv(env, "drops").get(GROUP_CACHE_KEY);
  if (cached) {
    try { return new Set(JSON.parse(cached)); } catch {}
  }
  const group = await womFetch(env, `/groups/${WOM_GROUP_ID}`);
  const memberships = Array.isArray(group?.memberships) ? group.memberships : [];
  const names = memberships
    .map(item => normalizeRsn(item?.player?.displayName || item?.player?.username))
    .filter(Boolean);
  await hybridKv(env, "drops").put(GROUP_CACHE_KEY, JSON.stringify(names), { expirationTtl: 600 });
  return new Set(names);
}

function statsFromPlayer(player) {
  const overall = player?.latestSnapshot?.data?.skills?.overall || {};
  const computed = player?.latestSnapshot?.data?.computed || {};
  return {
    ehp: Number(player?.ehp ?? computed?.ehp?.value ?? overall?.ehp) || 0,
    ehb: Number(player?.ehb ?? computed?.ehb?.value) || 0,
    totalLevel: Number(overall?.level) || 0,
    womUpdatedAt: player?.updatedAt || player?.latestSnapshot?.createdAt || new Date().toISOString()
  };
}

export async function onRequestGet({ request, env }) {
  const state = await loadGames(env);
  const session = await getSession(request, env);
  const mine = session ? (state.signups || []).find(s => String(s.discordId) === String(session.id)) : null;
  return Response.json({
    signupOpen: Boolean(state.signupOpen),
    rosterLocked: Boolean(state.rosterLocked),
    autoBalanceSignups: state.autoBalanceSignups !== false,
    signedIn: Boolean(session),
    mySignup: mine || null,
    signups: (state.signups || []).map(s => ({
      displayName: s.displayName,
      rsn: s.rsn,
      ehp: s.ehp,
      ehb: s.ehb,
      totalLevel: s.totalLevel,
      balanceScore: s.balanceScore,
      timezone: s.timezone || "",
      signedUpAt: s.signedUpAt
    })),
    teams: (state.teams || []).map(t => ({ id:t.id, name:t.name, members:(t.members || []).map(m => ({ name:m.name, rsn:m.rsn, ehp:m.ehp, ehb:m.ehb, totalLevel:m.totalLevel, balanceScore:m.balanceScore })) }))
  }, { headers:{"Cache-Control":"no-store"} });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in with Discord before registering." }, { status:401 });
  if (!session.inGuild) return Response.json({ error:"You must be in the Ironkin Discord to register." }, { status:403 });

  const state = await loadGames(env);
  if (state.rosterLocked) return Response.json({ error:"Ironkin Games teams are locked. Staff must unlock the roster before signup changes can be made." }, { status:403 });
  if (!state.signupOpen) return Response.json({ error:"Ironkin Games signup is currently closed." }, { status:403 });

  const body = await request.json().catch(() => ({}));
  const rsn = String(body.rsn || "").trim();
  if (!rsn || rsn.length > 12) return Response.json({ error:"Enter a valid OSRS username." }, { status:400 });

  const existingSignup = (state.signups || []).find(s => String(s.discordId) === String(session.id));
  const requestedTimezone = String(body.timezone || existingSignup?.timezone || "").trim();
  if (!validTimezone(requestedTimezone)) {
    return Response.json({ error:"Select a valid timezone before signing up." }, { status:400 });
  }

  let members;
  try { members = await groupMembers(env); }
  catch (error) { return Response.json({ error:`Could not verify the Ironkin WOM group: ${error.message}` }, { status:502 }); }
  if (!members.has(normalizeRsn(rsn))) {
    return Response.json({ error:"That RSN was not found in the Ironkin Wise Old Man group. Check the spelling or have staff sync the WOM group first." }, { status:400 });
  }

  let player;
  try { player = await womFetch(env, `/players/${encodeURIComponent(rsn)}`); }
  catch (error) { return Response.json({ error:`Could not load WOM stats for ${rsn}: ${error.message}` }, { status:502 }); }

  const stats = statsFromPlayer(player);
  const now = new Date().toISOString();
  const displayName = session.nick || session.global_name || session.username || rsn;
  const signup = {
    discordId: String(session.id),
    discordName: String(session.username || ""),
    displayName: String(displayName),
    rsn: String(player?.displayName || player?.username || rsn),
    timezone: requestedTimezone,
    ...stats,
    signedUpAt: (state.signups || []).find(s => String(s.discordId) === String(session.id))?.signedUpAt || now,
    updatedAt: now
  };

  const others = (state.signups || []).filter(s => String(s.discordId) !== String(session.id));
  state.signups = [...others, signup];
  if (state.autoBalanceSignups !== false) balanceSignups(state);
  await saveGames(env, state);
  return Response.json({ ok:true, signup, teams:state.teams }, { headers:{"Cache-Control":"no-store"} });
}

export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return Response.json({ error:"Sign in first." }, { status:401 });
  const state = await loadGames(env);
  if (state.rosterLocked) return Response.json({ error:"Ironkin Games teams are locked. Staff must unlock the roster before you can withdraw." }, { status:403 });
  const discordId = String(session.id);

  // Remove the player from the signup list.
  state.signups = (state.signups || []).filter(s => String(s.discordId) !== discordId);

  // Always remove the player from their assigned team, even when automatic
  // signup balancing is disabled. Otherwise the signup count and team roster
  // can become out of sync after a withdrawal.
  state.teams = (state.teams || []).map(team => ({
    ...team,
    members: (team.members || []).filter(member =>
      String(member.discordId || member.id || "") !== discordId
    )
  }));

  // Rebalance the remaining signups only when automatic balancing is enabled.
  if (state.autoBalanceSignups !== false) balanceSignups(state);

  await saveGames(env, state);
  return Response.json({ ok:true, teams:state.teams }, { headers:{"Cache-Control":"no-store"} });
}
