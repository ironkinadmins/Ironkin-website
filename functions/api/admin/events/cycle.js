import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

const KEY = "events:sotw-botw-cycle:v1";
const DEFAULT = { enabled: false, startDate: "", startTime: "15:00", firstEvent: "botw" };
const TZ = "America/Toronto";
const pad = n => String(n).padStart(2, "0");
function validate(input) {
  const startDate = String(input?.startDate || "");
  const startTime = String(input?.startTime || "15:00");
  const firstEvent = String(input?.firstEvent || "botw");
  const enabled = input?.enabled === true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw Error("Choose a valid Friday start date.");
  const d = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== startDate || d.getUTCDay() !== 5) throw Error("The cycle must start on a Friday.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw Error("Choose a valid 24-hour start time.");
  if (!["botw", "sotw"].includes(firstEvent)) throw Error("Choose BOTW or SOTW.");
  if (enabled && startDate < new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())) throw Error("Cannot activate a cycle starting in the past.");
  return { enabled, startDate, startTime, firstEvent };
}
function preview(config) {
  if (!config.startDate) return [];
  const date = new Date(`${config.startDate}T12:00:00Z`);
  return Array.from({length: 12}, (_, i) => {
    const d = new Date(date.getTime() + i * 7 * 86400000);
    const week = d.toISOString().slice(0, 10);
    const type = i % 2 ? "break" : i % 4 === 0 ? config.firstEvent : config.firstEvent === "botw" ? "sotw" : "botw";
    return { startDate: week, endDate: new Date(d.getTime() + 7 * 86400000).toISOString().slice(0, 10), startTime: config.startTime, timeZone: TZ, type };
  });
}
export async function onRequest({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({error:"Staff only."},{status:403});
  const kv = hybridKv(env, "drops");
  if (request.method === "GET") {
    const raw = await kv.get(KEY);
    let config = DEFAULT;
    try { if (raw) config = {...DEFAULT, ...JSON.parse(raw)}; } catch { /* invalid old data */ }
    return Response.json({config, preview: preview(config)});
  }
  if (request.method !== "POST") return Response.json({error:"Method not allowed."},{status:405});
  try {
    const config = validate(await request.json());
    await kv.put(KEY, JSON.stringify({...config, updatedAt:new Date().toISOString()}));
    return Response.json({success:true,config,preview:preview(config)});
  } catch (error) { return Response.json({error:error.message || "Invalid configuration."},{status:400}); }
}
