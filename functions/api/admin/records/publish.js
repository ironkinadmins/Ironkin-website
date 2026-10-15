import { getSession, isStaffSession } from "../../_auth.js";
import { getHallOfFlameDiscordSettings } from "../../hall-of-flame/_records.js";

const allowed = async (request, env) => isStaffSession(await getSession(request, env));
const headers = { "Cache-Control": "no-store" };
export async function onRequestGet({ request, env }) {
  return Response.json({ authorized: await allowed(request, env) }, { headers });
}
const clean = value => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
function validate(rows, type) {
  if (!Array.isArray(rows) || rows.length > 150) throw Error(`Invalid ${type} records.`);
  const seen = new Set();
  return rows.map(row => {
    const event = clean(row.eventName), winner = clean(row.winner), score = clean(row.score);
    if (!event || !winner || !score) throw Error(`Incomplete ${type} record.`);
    const url = String(row.url || "");
    if (url && !/^https:\/\/wiseoldman\.net\/(competitions\/\d+|groups\/\d+\/competitions)$/.test(url)) throw Error("Invalid Wise Old Man link.");
    const identity = `${event.toLowerCase()}|${winner.toLowerCase()}`;
    if (seen.has(identity)) return null;
    seen.add(identity);
    return { event, winner, score, url };
  }).filter(Boolean);
}
const escapeDiscord = text => text.replace(/([\\*_`~|>])/g, "\\$1").replace(/@/g, "＠");
function embeds(type, rows) {
  const title = type === "sotw" ? "Ironkin SOTW Records" : "Ironkin BOTW Records";
  const prefix = type.toUpperCase();
  const lines = rows.map((r, i) => `${i + 1}. **${escapeDiscord(r.event)}** — ${escapeDiscord(r.winner)} · ${escapeDiscord(r.score)}${r.url ? ` · [WOM](${r.url})` : ""}`);
  const chunks = []; let current = "";
  for (const line of lines) {
    if ((current + "\n" + line).length > 3900) { chunks.push(current); current = ""; }
    current += (current ? "\n" : "") + line;
  }
  if (current) chunks.push(current);
  if (!chunks.length) chunks.push("No recorded champions yet.");
  if (chunks.length > 10) throw Error(`${prefix} contains too many records for a Discord embed.`);
  return chunks.map((description, i) => ({
    title: i ? `${title} · Part ${i + 1}` : title,
    description,
    color: type === "sotw" ? 0xE7A445 : 0xE87432,
    footer: { text: `Ironkin ${prefix} historical records · ${rows.length} winners · Updated from Clan Records` }
  }));
}
async function discord(url, token, init={}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bot ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(`Discord returned ${response.status}: ${String(body.message || 'request failed').slice(0,150)}`);
  return body;
}
export async function onRequestPost({ request, env }) {
  if (!await allowed(request, env)) return Response.json({ error: "Staff only." }, { status: 403, headers });
  try {
    const { channelId } = await getHallOfFlameDiscordSettings(env);
    const token = env.DISCORD_BOT_TOKEN;
    if (!token || !channelId) return Response.json({ error: "Hall of Flame Discord bot/channel is not configured." }, { status: 503, headers });
    const input = await request.json();
    const sets = { sotw: validate(input.sotw, 'SOTW'), botw: validate(input.botw, 'BOTW') };
    if (!sets.sotw.length || !sets.botw.length) throw Error("Both SOTW and BOTW must contain records before publishing.");
    const base = `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`;
    const messages = await discord(`${base}?limit=100`, token);
    const botIdentity = await discord("https://discord.com/api/v10/users/@me", token);
    const results = [];
    for (const [type, rows] of Object.entries(sets)) {
      const title = type === 'sotw' ? 'Ironkin SOTW Records' : 'Ironkin BOTW Records';
      const own = messages.find(m => m.author?.bot && m.embeds?.some(e => e.title === title));
      const payload = { embeds: embeds(type, rows), allowed_mentions: { parse: [] } };
      // Only modify messages authored by this bot. Otherwise create a new record message.
      const isOurs = own && own.author?.id === botIdentity.id;
      const existing = isOurs ? own : null;
      const sent = await discord(existing ? `${base}/${existing.id}` : base, token, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      results.push({ type: type.toUpperCase(), action: existing ? 'updated' : 'created', messageId: sent.id });
    }
    return Response.json({ success: true, results }, { headers });
  } catch (error) {
    return Response.json({ error: String(error.message || error) }, { status: 400, headers });
  }
}
