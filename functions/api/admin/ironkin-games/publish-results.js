import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!isStaffSession(session)) return Response.json({ error: "Staff only." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const weekId = String(body.weekId || "");
  const action = body.action === "hide" ? "hide" : "publish";
  const state = await loadGames(env);
  if (state.gamesCompleted) return Response.json({ error: "The Ironkin Games are complete. Published results are locked." }, { status: 409 });
  const week = (state.weeks || []).find(w => String(w.id) === weekId);
  if (!week) return Response.json({ error: "Week not found." }, { status: 404 });

  const published = new Set((state.publishedResultWeeks || []).map(String));
  if (action === "publish") published.add(weekId);
  else published.delete(weekId);

  state.publishedResultWeeks = [...published];
  state.resultsUnlocked = false; // retire the old global reveal toggle
  await saveGames(env, state);

  return Response.json({ ok: true, weekId, published: action === "publish", publishedResultWeeks: state.publishedResultWeeks });
}
