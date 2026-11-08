import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0,10);
const check = (name, status, detail) => ({ name, status, detail });

// Strictly read-only: no WOM requests, no Discord requests, no KV writes.
export async function onRequest({ request, env }) {
  if (request.method !== "GET") return Response.json({error:"Method not allowed"},{status:405});
  if (!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only"},{status:403});
  const kv = hybridKv(env,"drops");
  const config = parse(await kv.get("events:sotw-botw-cycle:v1"),{});
  const results=[];
  const validDate=/^\d{4}-\d{2}-\d{2}$/.test(config.startDate||"") && Number.isFinite(Date.parse(config.startDate));
  const validType=["botw","sotw"].includes(config.firstEvent);
  const validTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(config.startTime||"15:00");
  results.push(check("Cycle configuration",validDate&&validType&&validTime?"pass":"fail",validDate&&validType&&validTime?`Starts ${config.firstEvent.toUpperCase()} ${config.startDate} at ${config.startTime||"15:00"} Eastern`:`Missing or invalid start date, first event, or time`));
  if(validDate&&validType&&validTime){
    const nov13=Date.parse("2026-11-13T12:00:00Z");
    const base=Date.parse(`${config.startDate}T12:00:00Z`);
    const intervals=(nov13-base)/1209600000;
    const expected=Number.isInteger(intervals)&&intervals>=0?(intervals%2===0?config.firstEvent:(config.firstEvent==="botw"?"sotw":"botw")):null;
    results.push(check("November 13 BOTW",expected==="botw"&&config.startTime==="15:00"?"pass":"fail",expected?`Configured cycle on Nov 13: ${expected.toUpperCase()} at ${config.startTime||"15:00"} ET`:`November 13 is not aligned with the saved 14-day cycle`));
    const open=shift("2026-11-13",-4),close=shift("2026-11-13",-1);
    results.push(check("Voting window", "warning",`Current production code opens polls ${open} at 3 PM ET and closes ${close} at 3 PM ET (3-day window). Agreed six-day window requires Nov 6 to Nov 12. Code change required before live poll scheduling.`));
    const id="botw:2026-11-13";
    const state=parse(await kv.get("events:sotw-botw-automation:v1:"+id),{});
    results.push(check("November 13 poll state",state.messageId?"pass":"warning",state.messageId?`Discord poll receipt recorded; ${state.closedAt?"poll closed":"poll not yet closed"}`:"No Discord poll receipt recorded. Do not assume the poll has been published."));
    results.push(check("Competition creation record",state.womStatus==="created"?"pass":"warning",`Cycle WOM status: ${state.womStatus||"not started"}; this check makes no WOM API request.`));
    results.push(check("Finalization record",state.finalizationStatus==="completed"?"pass":"warning",`Finalization status: ${state.finalizationStatus||"not started"}; no awards or announcements are issued.`));
  }
  const pools=parse(await kv.get("events:sotw-botw-pools:v1"),{});
  const botw=Array.isArray(pools.botw)?pools.botw.filter(x=>typeof x==="string"&&x.trim()):[];
  results.push(check("BOTW nomination pool",new Set(botw.map(x=>x.toLowerCase())).size>=3?"pass":"fail",`${new Set(botw.map(x=>x.toLowerCase())).size} distinct configured BOTW options; at least 3 needed.`));
  results.push(check("WOM creation prerequisites",env.CYCLE_COORDINATOR&&env.WOM_GROUP_VERIFICATION_CODE?"pass":"fail",`Coordinator binding: ${env.CYCLE_COORDINATOR?"present":"missing"}; group verification secret: ${env.WOM_GROUP_VERIFICATION_CODE?"present":"missing"}; auto-create: ${env.CYCLE_AUTO_WOM_CREATE_ENABLED==="true"?"enabled":"disabled"}. No external call made.`));
  results.push(check("Finalization gate",env.CYCLE_AUTO_FINALIZE_ENABLED==="true"?"warning":"pass",`Automatic finalization ${env.CYCLE_AUTO_FINALIZE_ENABLED==="true"?"enabled; avoid live testing until reviewed":"disabled for safe testing"}.`));
  results.push(check("Cycle execution gate",config.enabled?"warning":"pass",`Cycle schedule ${config.enabled?"enabled; live actions may occur if an external scheduler calls it":"disabled"}. Dry run itself does not trigger the scheduler.`));
  results.push(check("Submission and Ember isolation","warning","Not validated by this read-only simulation. Permanent PvM/bounty visibility, event expiry, and one-time Ember awards require separate integration tests."));
  return Response.json({generatedAt:new Date().toISOString(),readOnly:true,results},{headers:{"Cache-Control":"no-store"}});
}
