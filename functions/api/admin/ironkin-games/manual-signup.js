import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

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
  const headers = { "User-Agent": "Ironkin Games staff signup" };
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
  const names = (Array.isArray(group?.memberships) ? group.memberships : [])
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

export async function onRequestPost({ request, env }) {
  const staff = await getSession(request, env);
  if (!isStaffSession(staff)) return Response.json({ error: "Staff only." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const rsn = String(body.rsn || "").trim();
  const displayName = String(body.displayName || rsn).trim().slice(0, 80);
  const timezone = String(body.timezone || "").trim();
  const suppliedDiscordId = String(body.discordId || "").trim();

  if (!rsn || rsn.length > 12) return Response.json({ error: "Enter a valid OSRS username." }, { status: 400 });
  if (!validTimezone(timezone)) return Response.json({ error: "Enter a valid IANA timezone, such as America/Toronto." }, { status: 400 });
  if (suppliedDiscordId && !/^\d{15,22}$/.test(suppliedDiscordId)) return Response.json({ error: "Discord ID must be a numeric Discord user ID, or left blank." }, { status: 400 });

  const state = await loadGames(env);
  if (state.rosterLocked) return Response.json({ error: "Teams are locked. Unlock the roster before adding a signup." }, { status: 403 });
  if ((state.signups || []).some(signup => normalizeRsn(signup.rsn) === normalizeRsn(rsn))) {
    return Response.json({ error: "That RSN is already on the Ironkin Games signup list." }, { status: 409 });
  }
  if (suppliedDiscordId && (state.signups || []).some(signup => String(signup.discordId) === suppliedDiscordId)) {
    return Response.json({ error: "That Discord account is already on the signup list." }, { status: 409 });
  }

  let members;
  try { members = await groupMembers(env); }
  catch (error) { return Response.json({ error: `Could not verify the Ironkin WOM group: ${error.message}` }, { status: 502 }); }
  if (!members.has(normalizeRsn(rsn))) {
    return Response.json({ error: "That RSN was not found in the Ironkin Wise Old Man group." }, { status: 400 });
  }

  let player;
  try { player = await womFetch(env, `/players/${encodeURIComponent(rsn)}`); }
  catch (error) { return Response.json({ error: `Could not load WOM stats for ${rsn}: ${error.message}` }, { status: 502 }); }

  const now = new Date().toISOString();
  const resolvedRsn = String(player?.displayName || player?.username || rsn);
  const discordId = suppliedDiscordId || `manual:${normalizeRsn(resolvedRsn).replace(/\s+/g, "_")}`;
  const signup = {
    discordId,
    discordName: suppliedDiscordId ? displayName : "",
    displayName: displayName || resolvedRsn,
    rsn: resolvedRsn,
    timezone,
    ...statsFromPlayer(player),
    signedUpAt: now,
    updatedAt: now,
    manuallyAdded: true,
    manuallyAddedAt: now,
    manuallyAddedBy: String(staff.id || "")
  };

  state.signups = [...(state.signups || []), signup];
  await saveGames(env, state);
  return Response.json({ ok: true, signup, state }, { headers: { "Cache-Control": "no-store" } });
}
