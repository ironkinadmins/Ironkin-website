import { getSession, isStaffSession } from "../_auth.js";
import { hasSupabase, supabaseRest } from "../_supabase.js";

const CHANNELS = { "clan-info": "DISCORD_CLAN_INFO_WEBHOOK_URL", "rank-info": "DISCORD_RANK_INFO_WEBHOOK_URL" };
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const validId = v => /^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(v||""));
const err = (message,status=400)=>json({error:message},status);
const who = session => String(session.global_name||session.username||session.id||"staff").slice(0,120);
function normalize(v) {
  const channel_key=String(v.channel_key||"");
  if (!CHANNELS[channel_key]) throw Error("Invalid channel");
  const id=String(v.id||"");
  if(!validId(id)) throw Error("Invalid section ID (lowercase letters, numbers, - or _)");
  const title=String(v.title||"").trim().slice(0,256);
  if(!title) throw Error("Title is required");
  const description=String(v.description||"").trim();
  if(description.length>4000) throw Error("Description exceeds 4000 characters");
  const image_url=String(v.image_url||"").trim();
  if(image_url && (!/^https:\/\//.test(image_url)||image_url.length>1500)) throw Error("Image must use an HTTPS URL");
  const images=Array.isArray(v.images)?v.images:[];
  if(images.length>8) throw Error("Maximum 8 screenshots per topic");
  for(const url of images) if(typeof url!=="string" || !/^https:\/\/[^\s]+$/i.test(url) || url.length>1500) throw Error("Screenshots must use valid HTTPS URLs");
  const blocks=Array.isArray(v.blocks)?v.blocks:[];
  function checkBlocks(value, depth=0) {
    if(depth>1 || value.length>50) throw Error("Too many content blocks or nested categories");
    for(const b of value) {
      if(!b || !["text","image","category"].includes(b.type)) throw Error("Invalid content block");
      if(b.type==="text" && (typeof b.text!=="string" || b.text.length>4000)) throw Error("Text block exceeds 4000 characters");
      if(b.type==="image" && (typeof b.url!=="string" || !/^https:\/\/[^\s]+$/i.test(b.url) || b.url.length>1500)) throw Error("Image blocks require an HTTPS URL");
      if(b.type==="category") {
        if(depth!==0 || typeof b.title!=="string" || !b.title.trim() || b.title.length>80 || !/^[a-z0-9_-]{1,60}$/.test(b.id||"")) throw Error("Invalid category");
        if(!Array.isArray(b.blocks)) throw Error("Invalid category content");
        checkBlocks(b.blocks,depth+1);
      }
    }
  }
  checkBlocks(blocks);
  return {id,channel_key,title,description,image_url,images,blocks,sort_order:Math.max(0,Math.min(9999,Number(v.sort_order)||0)),enabled:v.enabled!==false};
}
async function read(env,id) {
 const response=await supabaseRest(env,`ironkin_discord_info_sections?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
 return (await response.json())[0]||null;
}
async function discord(url,path,method,payload) {
 const response=await fetch(url+path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw Error(`Discord ${response.status}: ${JSON.stringify(data).slice(0,300)}`);
 return data;
}
export async function onRequest({request,env}) {
 const session=await getSession(request,env);
 if(!isStaffSession(session)) return err("Staff access required",403);
 if(!hasSupabase(env)) return err("Supabase is not configured",503);
 try {
  if(request.method==="GET") {
   const r=await supabaseRest(env,"ironkin_discord_info_sections?select=*&order=channel_key.asc,sort_order.asc,id.asc");
   return json({sections:await r.json()});
  }
  if(!["POST","PUT"].includes(request.method)) return err("Method not allowed",405);
  const origin=request.headers.get("Origin");
  if(!origin || origin!==new URL(request.url).origin) return err("Same-origin request required",403);
  const body=await request.json();
  if(body.action==="save") {
   const v=normalize(body.section||{});
   const old=await read(env,v.id);
   if(old && old.channel_key!==v.channel_key) return err("A published section cannot be moved to another channel. Create a new section.");
   if(old && Number(body.expected_revision)!==Number(old.revision)) return err("This section was updated by another editor. Reload before saving.",409);
   if(!old && body.expected_revision!=null) return err("Section was removed. Reload.",409);
   const record={...v,revision:(old?.revision||0)+1,updated_at:new Date().toISOString(),updated_by:who(session)};
   const r=await supabaseRest(env,"ironkin_discord_info_sections?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify([record])});
   if(!r.ok) return err(`Database save failed (HTTP ${r.status})`,502);
   return json({section:(await r.json())[0]});
  }
  if(body.action==="publish") {
   const id=String(body.id||"");
   if(!validId(id)) return err("Invalid ID");
   const item=await read(env,id);
   if(!item) return err("Section not found",404);
   if(Number(body.expected_revision)!==Number(item.revision)) return err("Reload: this section has changed",409);
   if(!item.enabled) return err("Section disabled. Enable it before publishing.");
   const images=Array.isArray(item.images) && item.images.length ? item.images : (item.image_url ? [item.image_url] : []);
   // Publish an immutable snapshot. The bot will reconcile the permanent hub;
   // never create a standalone webhook message here.
   const published={published_title:item.title,published_description:item.description,
     published_images:images,published_blocks:Array.isArray(item.blocks)?item.blocks:[],published_sort_order:item.sort_order,
     published_enabled:true,published_at:new Date().toISOString()};
   const r=await supabaseRest(env,`ironkin_discord_info_sections?id=eq.${encodeURIComponent(id)}&revision=eq.${Number(item.revision)}`,
     {method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(published)});
   if(!r.ok) return err(`Database publish failed (HTTP ${r.status})`,502);
   const updated=await r.json();
   if(!updated.length) return err("Section changed during publishing. Reload and retry.",409);
   return json({section:updated[0],hub_sync:"pending",message:"Published. Forgewarden will refresh the hub automatically."});
  }
  return err("Unknown action");
 } catch(e) {return err(e.message||"Unexpected error",500);}
}
