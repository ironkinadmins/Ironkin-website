import { getSession, isStaffSession, isGamesAdminSession } from "../_auth.js";
import { loadGames } from "../ironkin-games/_store.js";
import { supabaseRest } from "../_supabase.js";

const noStore = { "Cache-Control": "no-store" };
const pending = row => String(row?.status || "").toLowerCase() === "pending";

async function countTable(env, table) {
  // Count without downloading proof images or private submission details.
  const response = await supabaseRest(env, `${table}?select=id&status=eq.pending&limit=10000`, {
    headers: { Prefer: "count=exact" }
  });
  const range = response.headers.get("content-range") || "";
  const total = range.split("/").pop();
  if (/^\d+$/.test(total)) return Number(total);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw Error(`Invalid ${table} response`);
  if (rows.length >= 10000) throw Error(`${table} count exceeded query limit`);
  return rows.length;
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return Response.json({ error: "Staff only." }, { status: 403, headers: noStore });
  const sources = [
    { id: "hall-of-flame", label: "Hall of Flame", load: () => countTable(env, "hall_of_flame_submissions") },
    { id: "event-drops", label: "Event drop submissions", load: () => countTable(env, "ironkin_event_submissions") },
  ];
  if (isGamesAdminSession(session)) {
    sources.push(
      { id: "ironkin-games", label: "Ironkin Games", load: async () => {
        const state = await loadGames(env);
        return (Array.isArray(state.submissions) ? state.submissions : []).filter(pending).length;
      }},
      { id: "games-location", label: "Games location and trivia proofs", load: () => countTable(env, "ironkin_games_location_submissions") }
    );
  } else {
    sources.push({ id: "ironkin-games", label: "Ironkin Games", restricted: true },
                 { id: "games-location", label: "Games location and trivia proofs", restricted: true });
  }
  const settled = await Promise.all(sources.map(async source => {
    if (source.restricted) return { id: source.id, label: source.label, status: "restricted", count: null };
    try { return { id: source.id, label: source.label, status: "ok", count: await source.load() }; }
    catch (error) { console.warn(`Pending count unavailable: ${source.id}`, error); return { id: source.id, label: source.label, status: "unavailable", count: null }; }
  }));
  const complete = settled.every(item => item.status === "ok");
  return Response.json({ complete, total: complete ? settled.reduce((n,item) => n + item.count,0) : null,
    knownCount: settled.reduce((n,item) => n + (item.count || 0),0), sources: settled }, { headers: noStore });
}
