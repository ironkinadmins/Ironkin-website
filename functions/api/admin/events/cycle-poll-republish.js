import {hybridKv} from "../../../_hybridKv.js";
import {getSession,isStaffSession} from "../../_auth.js";
import {nominationNoticeStatus} from "../../../_winnerNominationNotifications.js";
const parse=(v,d)=>{try{return v?JSON.parse(v):d}catch{return d}};
const prefix="events:sotw-botw-automation:v1:";
const cycleDate="2026-11-13";
const pairs=[["artio","callisto"],["calvar'ion","vet'ion"],["spindel","venenatis"],["the nightmare","phosani's nightmare"],["gauntlet","corrupted gauntlet"],["chambers of xeric","chambers of xeric challenge mode"],["theatre of blood","theatre of blood hard mode"],["tombs of amascut","tombs of amascut expert mode"]];
const key=v=>{const x=String(v||"").trim().replace(/\s+/g," ").toLowerCase();return (pairs.find(p=>p.includes(x))||[x])[0]};
export async function onRequest({request,env}){
 if(!isStaffSession(await getSession(request,env)))return Response.json({error:"Staff only"},{status:403});
 if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
 const origin=request.headers.get("Origin");if(!origin||new URL(origin).origin!==new URL(request.url).origin)return Response.json({error:"Invalid origin"},{status:403});
 const body=await request.json().catch(()=>null),type=body?.type;
 if(!["botw-standard","botw-elite"].includes(type)||body?.confirm!==`RESET ${type}`)return Response.json({error:"Explicit confirmation required"},{status:400});
 const kv=hybridKv(env,"drops"),id=`${type}:${cycleDate}`,stateKey=prefix+id;
 const [stateRaw,nomsRaw,winnersRaw,poolsRaw]=await Promise.all([kv.get(stateKey),kv.get("events:sotw-botw-nominations:v1"),kv.get("events:sotw-botw-nomination-winners:v1"),kv.get("events:sotw-botw-pools:v1")]);
 const state=parse(stateRaw,{}),noms=parse(nomsRaw,{}),winners=parse(winnersRaw,{}),pools=parse(poolsRaw,{});
 if(state.closedAt||state.womStatus||state.outcome)return Response.json({error:"Cycle has results or downstream activity; cannot reset"},{status:409});
 const now=new Date(),time=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);const part=n=>time.find(x=>x.type===n)?.value;const local=`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
 if(local>="2026-11-12T15:00")return Response.json({error:"Voting deadline has passed; cannot republish with original deadline"},{status:409});
 const nomination=noms[type];
 // Use the same resolved winner record as Nomination Management. The legacy winners map may lag behind.
 const winnerInfo=await nominationNoticeStatus(env,type);
 const winnerId=winnerInfo.status?.state==="resolved"?String(winnerInfo.status.discordId||""):"";
 const valid=!!(winnerId&&nomination&&String(nomination.discordId)===winnerId&&(!nomination.cycleId||nomination.cycleId===id)&&Array.isArray(nomination.options)&&nomination.options.length===2);
 const pool=Array.isArray(pools[type])?pools[type]:[];
 if(!valid||new Set((nomination?.options||[]).map(key)).size!==2||(nomination?.options||[]).some(x=>!pool.some(y=>key(y)===key(x))))return Response.json({error:"Two valid saved nominations matching previous winner are required",details:{winnerResolved:!!winnerId,nominationSaved:!!nomination,ownerMatches:!!(winnerId&&String(nomination?.discordId)===winnerId),cycleMatches:!!nomination&&(!nomination.cycleId||nomination.cycleId===id),eligibleOptions:(nomination?.options||[]).filter(x=>pool.some(y=>key(y)===key(x))).length}},{status:409});
 if(!state.messageId&&!state.pollOptions)return Response.json({error:"No published or reserved poll to reset"},{status:409});
 // Preserve original receipt and choices for audit, while allowing the automation to reserve a corrected poll.
 const archive={...state,recoveryHistory:[...(state.recoveryHistory||[]),{at:now.toISOString(),oldMessageId:state.messageId||null,oldChannelId:state.channelId||null,oldOptions:state.pollOptions||state.options||null,reason:"Discord poll manually deleted; staff-authorized republish"}]};
 for(const field of ["messageId","channelId","options","pollOptions","publishedAt","pollReservedAt","rotationReset"])delete archive[field];
 // A published legacy draft is another lock; clear it for this cycle only.
 const draftsKey="events:sotw-botw-poll-drafts:v1";const drafts=parse(await kv.get(draftsKey),{});
 if(drafts[type]?.cycleId===id){delete drafts[type];await kv.put(draftsKey,JSON.stringify(drafts));}
 await kv.put(stateKey,JSON.stringify(archive));
 return Response.json({success:true,type,cycleId:id,deadline:"2026-11-12 15:00 America/Toronto",message:"Poll reset. Forgewarden automation can publish the corrected poll on its next run. No Discord message was sent by this action."});
}
