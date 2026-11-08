import { hybridKv } from "../../../_hybridKv.js";
import { getSession, isStaffSession } from "../../_auth.js";
const parse=(raw,fallback)=>{try{return raw?JSON.parse(raw):fallback;}catch{return fallback;}};
const pairs=[["Artio","Callisto"],["Calvar'ion","Vet'ion"],["Spindel","Venenatis"],["The Nightmare","Phosani's Nightmare"],["Gauntlet","Corrupted Gauntlet"],["Chambers of Xeric","Chambers of Xeric Challenge Mode"],["Theatre of Blood","Theatre of Blood Hard Mode"],["Tombs of Amascut","Tombs of Amascut Expert Mode"]];
const key=(v)=>{const name=String(v||"").trim().toLowerCase();return (pairs.find(p=>p.some(x=>x.toLowerCase()===name))?.[0]||name).toLowerCase();};
const label=v=>pairs.find(p=>p.some(x=>x.toLowerCase()===String(v).toLowerCase()))?.join(" + ")||v;
export async function onRequest({request,env}){
 if(request.method!=="GET")return Response.json({error:"Method not allowed"},{status:405});
 if(!isStaffSession(await getSession(request,env)))return Response.json({error:"Staff only"},{status:403});
 const kv=hybridKv(env,"drops");
 const [config,pools,winners,nominations,history,state]=await Promise.all([
  "events:sotw-botw-cycle:v1","events:sotw-botw-pools:v1","events:sotw-botw-nomination-winners:v1","events:sotw-botw-nominations:v1","events:sotw-botw-rotation:v1","events:sotw-botw-automation:v1:botw:2026-11-13"
 ].map(async k=>parse(await kv.get(k),{})));
 const pool=Array.isArray(pools.botw)?pools.botw.filter(x=>typeof x==="string"&&x.trim()):[];
 const unique=[...new Map(pool.map(x=>[key(x),x])).values()];
 const nominationValid=!!winners.botw && nominations.botw?.discordId===winners.botw;
 const nominated=nominationValid&&Array.isArray(nominations.botw.options)?nominations.botw.options:[];
 const chosen=[...new Map(nominated.filter(x=>unique.some(v=>key(v)===key(x))).slice(0,2).map(x=>[key(x),x])).values()];
 const reserved=Array.isArray(state.pollOptions)&&state.pollOptions.length===3?state.pollOptions:null;
 const options=reserved?reserved.map((o,i)=>({name:o.label||String(o),source:i<chosen.length?"winner nomination":"reserved option"})):chosen.map(x=>({name:label(x),source:"winner nomination"}));
 const eligible=unique.filter(x=>!chosen.some(v=>key(v)===key(x)));
 const recent=Array.isArray(history.botw)?history.botw:[];
 const rotated=eligible.filter(x=>!recent.includes(key(x)));
 const randomPool=rotated.length>=3-chosen.length?rotated:eligible;
 const remaining=Math.max(0,3-options.length);
 const warnings=[];
 if(!nominationValid)warnings.push("No valid previous-winner nomination record for BOTW.");
 if(chosen.length!==2)warnings.push(`Only ${chosen.length} valid distinct winner nominations; production may fill missing slots randomly.`);
 if(!reserved)warnings.push("Random option has NOT been selected. Candidate pool shown below; actual choice occurs when the live poll is reserved.");
 if(randomPool.length<remaining)warnings.push("Insufficient eligible options to build a three-option poll.");
 if(state.messageId)warnings.push("A Discord poll receipt is already recorded for this cycle.");
 const message=["**Ironkin BOTW Voting — November 13**","Vote for the next Boss of the Week.",...options.map((o,i)=>`${i+1}. ${o.name}`),...(reserved?[]:["[Remaining option(s) selected randomly at live poll reservation]"]),"Voting closes November 12, 2026 at 3:00 PM Eastern.","BOTW starts November 13, 2026 at 3:00 PM Eastern."].join("\n");
 return Response.json({readOnly:true,cycle:"botw:2026-11-13",configuredStart:config.startDate,options,candidatePool:reserved?[]:randomPool.map(label),reserved:!!reserved,published:!!state.messageId,closeAt:"2026-11-12 15:00 ET",startAt:"2026-11-13 15:00 ET",messageDraft:message,warnings,disclaimer:"Illustrative draft, not the exact Discord bot template. No options reserved and no Discord request sent."},{headers:{"Cache-Control":"no-store"}});
}
