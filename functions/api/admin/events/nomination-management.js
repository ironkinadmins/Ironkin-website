import {getSession,isStaffSession} from '../../_auth.js';
import {hybridKv} from '../../../_hybridKv.js';
import {nominationNoticeStatus} from '../../../_winnerNominationNotifications.js';
const TYPES=['botw-standard','botw-elite','sotw'];
const K={pools:'events:sotw-botw-pools:v1',nominations:'events:sotw-botw-nominations:v1',drafts:'events:sotw-botw-poll-drafts:v1'};
const PREFIX='events:sotw-botw-automation:v1:';
const parse=(v,d)=>{try{return v?JSON.parse(v):d;}catch{return d;}};
const PAIRS=[["artio","callisto"],["calvar'ion","vet'ion"],["spindel","venenatis"],["the nightmare","phosani's nightmare"],["gauntlet","corrupted gauntlet"],["chambers of xeric","chambers of xeric challenge mode"],["theatre of blood","theatre of blood hard mode"],["tombs of amascut","tombs of amascut expert mode"]];
const key=(name,type)=>{const x=String(name||'').trim().replace(/\s+/g,' ').toLowerCase();return type.startsWith('botw')?(PAIRS.find(p=>p.includes(x))||[x])[0]:x;};
export async function onRequest({request,env}){
 if(!isStaffSession(await getSession(request,env)))return Response.json({error:'Staff only'},{status:403});
 if(!['GET','POST'].includes(request.method))return Response.json({error:'Method not allowed'},{status:405});
 const kv=hybridKv(env,'drops');
 const [poolsRaw,nominationsRaw,draftsRaw]=await Promise.all([kv.get(K.pools),kv.get(K.nominations),kv.get(K.drafts)]);
 const pools=parse(poolsRaw,{}),nominations=parse(nominationsRaw,{}),drafts=parse(draftsRaw,{});
 const statuses=await Promise.all(TYPES.map(async type=>{const s=await nominationNoticeStatus(env,type);const cycleId=s.window?.date?`${type}:${s.window.date}`:null;const state=cycleId?parse(await kv.get(PREFIX+cycleId),{}):{};const draft=drafts[type];const locked=!!(Array.isArray(state.pollOptions)||state.messageId||state.publishedAt||(draft?.cycleId===cycleId&&draft?.status==='published'));
 return {type,winner:s.status?.state==='resolved'?{rsn:s.status.rsn,discordId:s.status.discordId}:null,window:s.window,cycleId,locked,picks:nominations[type]?.options||[],pool:pools[type]||[],draftStatus:draft?.cycleId===cycleId?draft.status:null};}));
 if(request.method==='GET')return Response.json({statuses},{headers:{'Cache-Control':'no-store'}});
 const origin=request.headers.get('Origin');if(!origin||new URL(origin).origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const body=await request.json().catch(()=>null);const type=body?.type;const info=statuses.find(s=>s.type===type);
 if(!info||body.action!=='save-picks')return Response.json({error:'Invalid action or competition'},{status:400});
 if(!info.winner?.discordId)return Response.json({error:'Verify the previous winner before editing picks.'},{status:409});
 if(!info.cycleId||info.locked)return Response.json({error:'No upcoming cycle or poll choices already reserved. Changes are locked.'},{status:409});
 if(!info.window?.open)return Response.json({error:'Nomination deadline passed. Change the schedule through approved admin controls, not this form.'},{status:409});
 const options=body.options;
 if(!Array.isArray(options)||options.length!==2||options.some(x=>typeof x!=='string'))return Response.json({error:'Select exactly two options.'},{status:400});
 const lookup=new Map(info.pool.map(x=>[key(x,type),x]));const normalized=options.map(x=>key(x,type));
 if(new Set(normalized).size!==2||normalized.some(x=>!lookup.has(x)))return Response.json({error:'Select two distinct eligible options.'},{status:400});
 // Recheck lock immediately before writing to reduce races with the poll publisher.
 const fresh=parse(await kv.get(PREFIX+info.cycleId),{});const freshDrafts=parse(await kv.get(K.drafts),{});
 if(Array.isArray(fresh.pollOptions)||fresh.messageId||fresh.publishedAt||(freshDrafts[type]?.cycleId===info.cycleId&&freshDrafts[type]?.status==='published'))return Response.json({error:'Poll choices have been reserved; changes are locked.'},{status:409});
 const latest=parse(await kv.get(K.nominations),{});const labels=normalized.map(x=>lookup.get(x));
 latest[type]={discordId:String(info.winner.discordId),options:labels,updatedAt:new Date().toISOString(),updatedBy:'staff',adminDiscordId:String((await getSession(request,env)).id),cycleId:info.cycleId};
 await kv.put(K.nominations,JSON.stringify(latest));
 if(freshDrafts[type]?.cycleId===info.cycleId&&freshDrafts[type]?.status==='draft'){delete freshDrafts[type];await kv.put(K.drafts,JSON.stringify(freshDrafts));}
 return Response.json({success:true,type,options:labels,cycleId:info.cycleId},{headers:{'Cache-Control':'no-store'}});
}
