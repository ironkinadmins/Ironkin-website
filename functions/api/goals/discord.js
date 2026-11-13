import { supabaseRest } from '../_supabase.js';
const equal=(a,b)=>{if(!a||!b||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;};
export async function onRequestGet({request,env}){
 const secret=String(env.GOALS_BOT_SECRET||'');const supplied=request.headers.get('Authorization')||'';
 if(secret.length<24||!equal(supplied,`Bearer ${secret}`))return Response.json({error:'Unauthorized'},{status:401});
 const id=new URL(request.url).searchParams.get('discord_id')||'';
 if(!/^\d{15,22}$/.test(id))return Response.json({error:'Invalid Discord ID'},{status:400});
 try{const r=await supabaseRest(env,`ironkin_member_goals?select=title,category,target,progress,unit,status,is_public&discord_id=eq.${id}&order=created_at.desc&limit=50`);
 return Response.json({goals:await r.json()},{headers:{'Cache-Control':'no-store'}});}
 catch(e){console.error('Bot goals lookup',e);return Response.json({error:'Unable to retrieve goals'},{status:500});}
}
