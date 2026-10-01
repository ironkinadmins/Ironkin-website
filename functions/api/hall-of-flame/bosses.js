import { getSession, isStaffSession } from "../_auth.js";
import { supabaseRest } from "../_supabase.js";
import { approvedForBoss, bossMessage, discordMessages, mergeBoard, normalizeBoss, parseDiscordBoard, syncDiscordBoard } from "./_records.js";

const noStore={"Cache-Control":"no-store"};
const json=(body,status=200)=>Response.json(body,{status,headers:noStore});
const slugify=value=>normalizeBoss(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);

async function listBosses(env,{all=false}={}){
  // Keep the PostgREST request deliberately simple. Filtering/sorting this very
  // small catalogue in the Function avoids deployment-specific PostgREST query
  // parsing/schema-cache issues from turning the entire Hall of Flame into a 500.
  const r=await supabaseRest(env,"hall_of_flame_bosses?select=*");
  const rows=await r.json();
  const bosses=Array.isArray(rows)?rows:[];
  return bosses
    .filter(b=>all||(b.active!==false&&b.visible!==false))
    .sort((a,b)=>(Number(a.display_order)||0)-(Number(b.display_order)||0)||String(a.name||"").localeCompare(String(b.name||"")));
}

async function wikiBossImage(name){
  const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",generator:"search",gsrsearch:`intitle:${name}`,gsrnamespace:"0",gsrlimit:"6",prop:"pageimages",piprop:"original|thumbnail",pithumbsize:"600",origin:"*"});
  const response=await fetch(`https://oldschool.runescape.wiki/api.php?${params}`,{headers:{"User-Agent":"Ironkin Clan Event (ironkinclan.com; Hall of Flame boss artwork)"}});
  if(!response.ok) throw new Error(`OSRS Wiki image lookup failed (${response.status}).`);
  const data=await response.json().catch(()=>({}));
  const pages=Array.isArray(data?.query?.pages)?data.query.pages:[];
  const norm=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const wanted=norm(name);
  const page=pages.find(p=>norm(p.title)===wanted)||pages.find(p=>norm(p.title).includes(wanted))||pages[0];
  return {imageUrl:page?.original?.source||page?.thumbnail?.source||"",pageTitle:page?.title||""};
}

export async function onRequestGet({request,env}){
  const session=await getSession(request,env);
  const staff=isStaffSession(session);
  const url=new URL(request.url);
  try {
    const bosses=await listBosses(env,{all:staff&&url.searchParams.get("scope")==="staff"});
    return json({bosses,isStaff:staff,signedIn:Boolean(session)});
  } catch (error) {
    // Staff get the actionable backend detail; public callers only get a safe message.
    return json({error:"Could not load Hall of Flame record boards.",...(staff?{detail:String(error?.message||error)}:{})},500);
  }
}

export async function onRequestPost({request,env}){
  const session=await getSession(request,env);
  if(!isStaffSession(session)) return json({error:"Staff access required."},403);
  const body=await request.json().catch(()=>({}));
  if(body.action==="wiki-image"){
    const name=normalizeBoss(body.name);
    if(!name) return json({error:"Boss name is required."},400);
    try{const found=await wikiBossImage(name);if(!found.imageUrl)return json({error:`No OSRS Wiki image was found for ${name}. You can still paste an image URL manually.`},404);return json({ok:true,...found,source:"OSRS Wiki"});}
    catch(error){return json({error:error.message||"OSRS Wiki image lookup failed."},502);}
  }
  if(body.action==="populate-wiki-images"){
    const bosses=await listBosses(env,{all:true});
    let updated=0,failed=0; const results=[];
    for(const boss of bosses){
      if(boss.image_url){results.push({slug:boss.slug,ok:true,skipped:true});continue;}
      try{const found=await wikiBossImage(boss.name);if(!found.imageUrl)throw new Error("No image found");await supabaseRest(env,`hall_of_flame_bosses?slug=eq.${encodeURIComponent(boss.slug)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({image_url:found.imageUrl,updated_at:new Date().toISOString()})});updated++;results.push({slug:boss.slug,ok:true,imageUrl:found.imageUrl});}
      catch(error){failed++;results.push({slug:boss.slug,ok:false,error:error.message});}
    }
    return json({ok:failed===0,updated,failed,results});
  }
  if(body.action==="sync" || body.action==="sync-all"){
    const all=await listBosses(env,{all:true});
    const targets=body.action==="sync-all"?all.filter(b=>b.active!==false&&b.discord_sync!==false):all.filter(b=>b.slug===slugify(body.slug)&&b.discord_sync!==false);
    if(body.action==="sync"&&!targets.length) return json({error:"Boss not found or Discord sync is disabled."},404);
    let synced=0, failed=0; const results=[];
    for(const boss of targets){
      try{
        const legacyMessage=await bossMessage(env,boss.name);
        const legacy=parseDiscordBoard(legacyMessage?.embeds?.[0]?.description||"");
        const approved=await approvedForBoss(env,boss.name);
        const board=mergeBoard(legacy,approved);
        if(!board.length){results.push({slug:boss.slug,ok:false,skipped:true,reason:"No records"});continue;}
        const result=await syncDiscordBoard(env,boss.name,board,"",boss.image_url||""); synced++; results.push({slug:boss.slug,ok:true,...result});
      }catch(error){failed++;results.push({slug:boss.slug,ok:false,error:error.message});}
    }
    return json({ok:failed===0,synced,failed,results});
  }
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
