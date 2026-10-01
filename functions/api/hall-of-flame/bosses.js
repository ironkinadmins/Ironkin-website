import { getSession, isStaffSession } from "../_auth.js";
import { supabaseRest } from "../_supabase.js";
import { discordMessages, normalizeBoss } from "./_records.js";

const noStore={"Cache-Control":"no-store"};
const json=(body,status=200)=>Response.json(body,{status,headers:noStore});
const slugify=value=>normalizeBoss(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);

async function listBosses(env,{all=false}={}){
  const filters=all?"":"&active=eq.true&visible=eq.true";
  const r=await supabaseRest(env,`hall_of_flame_bosses?select=*&order=display_order.asc,name.asc${filters}`);
  return r.json();
}

export async function onRequestGet({request,env}){
  const session=await getSession(request,env);
  const staff=isStaffSession(session);
  const url=new URL(request.url);
  const bosses=await listBosses(env,{all:staff&&url.searchParams.get("scope")==="staff"});
  return json({bosses,isStaff:staff,signedIn:Boolean(session)});
}

export async function onRequestPost({request,env}){
  const session=await getSession(request,env);
  if(!isStaffSession(session)) return json({error:"Staff access required."},403);
  const body=await request.json().catch(()=>({}));
  if(body.action==="import-discord"){
    const messages=await discordMessages(env);
    const ignored=new Set(["boss of the week","skill of the week","hall of flame quick links!"]);
    const names=[...new Set(messages.map(m=>normalizeBoss(m.embeds?.[0]?.title)).filter(n=>n&&!ignored.has(n.toLowerCase())))];
    if(!names.length) return json({ok:true,imported:0});
    const rows=names.map((name,i)=>({slug:slugify(name),name,category:"Boss",record_type:"fastest_time",time_format:"MM:SS.ms",active:true,visible:true,accept_submissions:true,discord_sync:true,display_order:i*10,updated_at:new Date().toISOString()}));
    await supabaseRest(env,"hall_of_flame_bosses?on_conflict=slug",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
    return json({ok:true,imported:rows.length});
  }
  const name=normalizeBoss(body.name), slug=slugify(body.slug||name);
  if(!name||!slug) return json({error:"Boss name is required."},400);
  const row={slug,name,category:String(body.category||"Boss").slice(0,40),record_type:"fastest_time",time_format:String(body.time_format||"MM:SS.ms").slice(0,30),image_url:String(body.image_url||"").trim().slice(0,1000),active:body.active!==false,visible:body.visible!==false,accept_submissions:body.accept_submissions!==false,discord_sync:body.discord_sync!==false,display_order:Number.isFinite(Number(body.display_order))?Number(body.display_order):0,updated_at:new Date().toISOString()};
  await supabaseRest(env,"hall_of_flame_bosses?on_conflict=slug",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify([row])});
  return json({ok:true,boss:row},201);
}

export async function onRequestPatch({request,env}){
  const session=await getSession(request,env);
  if(!isStaffSession(session)) return json({error:"Staff access required."},403);
  const body=await request.json().catch(()=>({})); const slug=slugify(body.slug);
  if(!slug) return json({error:"Boss ID is required."},400);
  const fields={updated_at:new Date().toISOString()};
  for(const key of ["name","category","time_format","image_url"]){if(body[key]!==undefined)fields[key]=String(body[key]).trim();}
  for(const key of ["active","visible","accept_submissions","discord_sync"]){if(body[key]!==undefined)fields[key]=Boolean(body[key]);}
  if(body.display_order!==undefined) fields.display_order=Number(body.display_order)||0;
  await supabaseRest(env,`hall_of_flame_bosses?slug=eq.${encodeURIComponent(slug)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(fields)});
  if (fields.name) {
    await supabaseRest(env,`hall_of_flame_submissions?boss_slug=eq.${encodeURIComponent(slug)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({boss:fields.name,updated_at:new Date().toISOString()})});
  }
  return json({ok:true});
}

export async function onRequestDelete({request,env}){
  const session=await getSession(request,env);
  if(!isStaffSession(session)) return json({error:"Staff access required."},403);
  const url=new URL(request.url), slug=slugify(url.searchParams.get("slug"));
  if(!slug) return json({error:"Boss ID is required."},400);
  // Archive by default; preserve all record history and proof links.
  await supabaseRest(env,`hall_of_flame_bosses?slug=eq.${encodeURIComponent(slug)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({active:false,visible:false,accept_submissions:false,updated_at:new Date().toISOString()})});
  return json({ok:true,archived:true});
}
