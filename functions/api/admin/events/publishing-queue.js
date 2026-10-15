import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";

const dateMs = value => value ? Date.parse(value) : NaN;
const excluded = event => ["pvm-entry", "bounties"].includes(String(event?.id || "")) || ["pvm-entry", "bounties"].includes(String(event?.type || ""));
export async function onRequestGet({ request, env }) {
  if (!isStaffSession(await getSession(request, env))) return Response.json({error:"Staff only."},{status:403});
  try {
    const kv=hybridKv(env,"drops");
    const [activeRaw,archiveRaw]=await Promise.all([kv.get("events:active"),kv.get("events:archive")]);
    const active=activeRaw?JSON.parse(activeRaw):[];
    const archive=archiveRaw?JSON.parse(archiveRaw):[];
    const archived=Array.isArray(archive)?archive:[];
    const now=Date.now();
    const queue=[];
    for(const event of Array.isArray(active)?active:[]){
      if(!event?.id||excluded(event)||event.resultsAnnouncement?.enabled===false)continue;
      const end=dateMs(event.endDate);
      if(!Number.isFinite(end)||end>now)continue;
      const wom=String(event.womCompetitionId||"").trim();
      // Don't queue a reset/reused slot when this exact WOM competition was already archived.
      const previous=archived.find(a=>String(a.eventId)===String(event.id) && wom && String(a.womCompetitionId||"").trim()===wom);
      if(previous)continue;
      queue.push({kind:"event",id:String(event.id),title:String(event.title||event.label||event.id),endDate:event.endDate,status:"awaiting-review"});
    }
    for(const entry of archived){
      const announcement=entry?.resultsAnnouncement||{};
      if(announcement.enabled!==true || announcement.status==="posted" || announcement.status==="skipped")continue;
      queue.push({kind:"archive",id:String(entry.id),title:String(entry.title||entry.label||entry.eventId||"Archived event"),endDate:entry.endDate||entry.endedAt||null,status:announcement.status||"pending",error:String(announcement.error||"").slice(0,180)});
    }
    queue.sort((a,b)=>(dateMs(a.endDate)||0)-(dateMs(b.endDate)||0));
    return Response.json({queue,count:queue.length},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return Response.json({error:"Could not load publishing queue."},{status:500});}
}
