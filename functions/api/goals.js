import { getSession } from './_auth.js';
import { supabaseRest } from './_supabase.js';
const fields='id,discord_id,display_name,title,category,target,progress,unit,status,is_public,created_at,updated_at';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const validId=x=>typeof x==='string'&&/^\d{15,22}$/.test(x);
async function fetchRows(env,query){const r=await supabaseRest(env,`ironkin_member_goals?select=${fields}&${query}`);return r.json();}
export async function onRequestGet({request,env}){
 try{
  const session=await getSession(request,env);const url=new URL(request.url);
  if(url.searchParams.get('scope')==='mine'){
   if(!validId(session?.id))return reply({error:'Sign in with Discord to view your goals.'},401);
   return reply({goals:await fetchRows(env,`discord_id=eq.${session.id}&order=created_at.desc&limit=100`)});
  }
  return reply({goals:await fetchRows(env,'is_public=eq.true&order=updated_at.desc&limit=500')});
 }catch(e){console.error('Goals GET',e);return reply({error:'Unable to load goals.'},500);}
}
export async function onRequestPost({request,env}){
 const session=await getSession(request,env);if(!validId(session?.id))return reply({error:'Sign in required.'},401);
 try{
  const data=await request.json();const title=String(data.title||'').trim();const category=String(data.category||'Other').trim().slice(0,40);
  const unit=String(data.unit||'').trim().slice(0,24);const progress=Number(data.progress??0);
  const target=data.target==null||data.target===''?null:Number(data.target);
  if(!title||title.length>120||!Number.isFinite(progress)||progress<0||(target!==null&&(!Number.isFinite(target)||target<=0)))return reply({error:'Invalid goal values.'},400);
  const normalizedStatus=target!==null&&(data.status==='completed'||progress>=target)?'completed':data.status==='completed'?'completed':'in_progress';
  const normalizedProgress=target!==null&&normalizedStatus==='completed'?target:progress;
  const count=await fetchRows(env,`discord_id=eq.${session.id}&limit=51`);if(count.length>=50)return reply({error:'Maximum 50 goals.'},400);
  const r=await supabaseRest(env,'ironkin_member_goals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({discord_id:session.id,display_name:String(session.global_name||session.username||session.name||'Ironkin').slice(0,80),title,category,unit,progress:normalizedProgress,target,status:normalizedStatus,is_public:data.is_public===true})});
  return reply({goal:(await r.json())[0]},201);
 }catch(e){console.error('Goals POST',e);return reply({error:'Unable to create goal.'},500);}
}
export async function onRequestPatch({request,env}){
 const session=await getSession(request,env);if(!validId(session?.id))return reply({error:'Sign in required.'},401);
 try{
  const data=await request.json();if(!/^[0-9a-f-]{36}$/i.test(String(data.id||'')))return reply({error:'Invalid ID.'},400);
  const update={updated_at:new Date().toISOString()};
  if('title'in data){update.title=String(data.title||'').trim();if(!update.title||update.title.length>120)return reply({error:'Invalid title.'},400);}
  if('category'in data)update.category=String(data.category||'Other').slice(0,40);
  if('unit'in data)update.unit=String(data.unit||'').slice(0,24);
  if('progress'in data){update.progress=Number(data.progress);if(!Number.isFinite(update.progress)||update.progress<0)return reply({error:'Invalid progress.'},400);}
  if('target'in data){update.target=data.target==null||data.target===''?null:Number(data.target);if(update.target!==null&&(!Number.isFinite(update.target)||update.target<=0))return reply({error:'Invalid target.'},400);}
  if('status'in data){if(!['in_progress','completed'].includes(data.status))return reply({error:'Invalid status.'},400);update.status=data.status;}
  if('is_public'in data)update.is_public=data.is_public===true;
  const existing=await fetchRows(env,`id=eq.${encodeURIComponent(data.id)}&discord_id=eq.${session.id}&limit=1`);
  if(!existing.length)return reply({error:'Goal not found.'},404);
  const old=existing[0];const finalTarget='target'in update?update.target:old.target;const finalProgress='progress'in update?update.progress:Number(old.progress);const finalStatus='status'in update?update.status:old.status;
  if(finalTarget!==null&&Number(finalTarget)>0){if(finalStatus==='completed')update.progress=Number(finalTarget);else if(finalProgress>=Number(finalTarget))update.status='completed';}
  const r=await supabaseRest(env,`ironkin_member_goals?id=eq.${encodeURIComponent(data.id)}&discord_id=eq.${session.id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(update)});
  const rows=await r.json();return rows.length?reply({goal:rows[0]}):reply({error:'Goal not found.'},404);
 }catch(e){console.error('Goals PATCH',e);return reply({error:'Unable to update goal.'},500);}
}
export async function onRequestDelete({request,env}){
 const session=await getSession(request,env);if(!validId(session?.id))return reply({error:'Sign in required.'},401);
 const id=new URL(request.url).searchParams.get('id');if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))return reply({error:'Invalid ID.'},400);
 try{await supabaseRest(env,`ironkin_member_goals?id=eq.${encodeURIComponent(id)}&discord_id=eq.${session.id}`,{method:'DELETE'});return reply({ok:true});}
 catch(e){console.error('Goals DELETE',e);return reply({error:'Unable to delete goal.'},500);}
}
