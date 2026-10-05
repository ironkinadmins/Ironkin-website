import { getSession, isStaffSession } from "../_auth.js";
import { approvedForBoss, bossMessage, formatTime, mergeBoard, parseDiscordBoard, parseSubmissionTimeToMs, syncDiscordBoard } from "./_records.js";
import { supabaseRest } from "../_supabase.js";
import { hybridKv } from "../../_hybridKv.js";

const h={"Cache-Control":"no-store"};
const json=(body,status=200)=>Response.json(body,{status,headers:h});
const AUDIT_KEY="hall-of-flame:legacy-record-edits";
async function staff(request,env){const s=await getSession(request,env);return isStaffSession(s)?s:null;}
async function bossBySlug(env,slug){const r=await supabaseRest(env,`hall_of_flame_bosses?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`);return (await r.json())?.[0]||null;}
async function legacyBoard(env,boss){const message=await bossMessage(env,boss);return parseDiscordBoard(message?.embeds?.[0]?.description||"");}

export async function onRequestGet({request,env}){
  if(!await staff(request,env)) return json({error:"Staff access required."},403);
  const url=new URL(request.url),slug=String(url.searchParams.get("slug")||"").trim();
  const boss=await bossBySlug(env,slug); if(!boss)return json({error:"Boss not found."},404);
  const records=await legacyBoard(env,boss.name);
  return json({boss:{slug:boss.slug,name:boss.name},records:records.map((r,index)=>({...r,index}))});
}

export async function onRequestPost({request,env}){
  const session=await staff(request,env); if(!session)return json({error:"Staff access required."},403);
  const body=await request.json().catch(()=>({}));
  const slug=String(body.slug||"").trim(),index=Number(body.index),player=String(body.player||"").trim(),time=String(body.time||"").trim();
  if(!slug||!Number.isInteger(index)||index<0||index>2||!player||!time)return json({error:"Boss, record, player, and time are required."},400);
  const timeMs=parseSubmissionTimeToMs(time); if(!timeMs)return json({error:"Enter a valid PB time in minutes:seconds, for example 0:36 or 1:10.00."},400);
  const boss=await bossBySlug(env,slug); if(!boss)return json({error:"Boss not found."},404);
  const legacy=await legacyBoard(env,boss.name); if(!legacy[index])return json({error:"That imported Discord record no longer exists."},404);
  const before={...legacy[index]};
  const approved=await approvedForBoss(env,boss.name);
  // A Discord board row may be backed by an approved website/plugin submission.
  // Edit that source row when possible so the next Discord sync does not restore
  // the old value. Otherwise this is a true legacy/imported Discord-only record.
  const approvedMatch=approved.find(r=>String(r.player||"").trim().toLowerCase()===String(before.player||"").trim().toLowerCase() && Number(r.timeMs)===Number(before.timeMs));
  if(approvedMatch?.submissionId){
    const now=new Date().toISOString();
    await supabaseRest(env,`hall_of_flame_submissions?id=eq.${encodeURIComponent(approvedMatch.submissionId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:player,time_ms:timeMs,updated_at:now})});
    // Remove the old mirrored row from the legacy side before merging the updated
    // verified record, otherwise the old and corrected times can both appear.
    legacy.splice(index,1);
    const refreshed=await approvedForBoss(env,boss.name);
    const board=mergeBoard(legacy,refreshed);
    const discord=await syncDiscordBoard(env,boss.name,board,"",boss.image_url||"");
    try{const kv=hybridKv(env,"drops"),raw=await kv?.get(AUDIT_KEY),audit=raw?JSON.parse(raw):[];audit.push({boss:boss.name,bossSlug:boss.slug,before:{player:before.player,timeMs:before.timeMs},after:{player,timeMs},source:"verified",editedBy:String(session?.nick||session?.global_name||session?.username||"Staff"),editedAt:now});await kv?.put(AUDIT_KEY,JSON.stringify(audit.slice(-250)));}catch{}
    return json({ok:true,record:{player,timeMs,time:formatTime(timeMs)},source:"verified",discord});
  }
  legacy[index]={...legacy[index],player,timeMs,time:formatTime(timeMs)};
  const board=mergeBoard(legacy,approved);
  const discord=await syncDiscordBoard(env,boss.name,board,"",boss.image_url||"");
  try{
    const kv=hybridKv(env,"drops"); const raw=await kv?.get(AUDIT_KEY); const audit=raw?JSON.parse(raw):[];
    audit.push({boss:boss.name,bossSlug:boss.slug,before:{player:before.player,timeMs:before.timeMs},after:{player,timeMs},editedBy:String(session?.nick||session?.global_name||session?.username||"Staff"),editedAt:new Date().toISOString()});
    await kv?.put(AUDIT_KEY,JSON.stringify(audit.slice(-250)));
  }catch{}
  return json({ok:true,record:{player,timeMs,time:formatTime(timeMs)},discord});
}
