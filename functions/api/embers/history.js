import { getSession, isStaffSession } from "../_auth.js";
import { supabaseRest } from "../_supabase.js";

const HEADERS = { "Cache-Control": "private, no-store" };
function json(body, status=200){ return Response.json(body,{status,headers:HEADERS}); }
function validId(value){const id=String(value||"").trim();return /^\d{15,22}$/.test(id)?id:null;}
function positiveInt(value,max){const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=max?n:null;}
export async function onRequestGet({request,env}){
 const session=await getSession(request,env);
 if(!session?.id)return json({error:"Sign in with Discord to view Ember history."},401);
 const url=new URL(request.url);
 const requested=validId(url.searchParams.get("userId"));
 const own=validId(session.id);
 if(!own)return json({error:"Invalid session."},401);
 const staff=isStaffSession(session);
 if(url.searchParams.has("userId")&&!requested)return json({error:"Invalid Discord ID."},400);
 if(requested&&requested!==own&&!staff)return json({error:"Staff access required."},403);
 const userId=requested||own;
 const cursor=positiveInt(url.searchParams.get("before"),Number.MAX_SAFE_INTEGER);
 if(url.searchParams.has("before")&&!cursor)return json({error:"Invalid cursor."},400);
 const type=String(url.searchParams.get("type")||"all");
 if(!["all","earned","spent"].includes(type))return json({error:"Invalid filter."},400);
 const guild=String(env.DISCORD_GUILD_ID||env.IRONKIN_GUILD_ID||"").trim();
 if(guild&&!/^\d{15,22}$/.test(guild))return json({error:"Invalid guild configuration."},503);
 const guildFilter=guild?`&guild_id=eq.${encodeURIComponent(guild)}`:"";
 const direction=type==="earned"?"&delta=gt.0":type==="spent"?"&delta=lt.0":"";
 const pagination=cursor?`&id=lt.${cursor}`:"";
 try{
  const response=await supabaseRest(env,`transactions?select=id,guild_id,user_id,delta,balance_after,kind,actor_user_id,counterparty_id,reason,created_at&user_id=eq.${encodeURIComponent(userId)}${guildFilter}${direction}${pagination}&order=id.desc&limit=26`);
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error("Unexpected transaction response");
  const hasMore=rows.length>25;
  const transactions=rows.slice(0,25).map(({id,guild_id,delta,balance_after,kind,actor_user_id,counterparty_id,reason,created_at})=>({id,guildId:String(guild_id),delta,balanceAfter:balance_after,kind,actorUserId:actor_user_id?String(actor_user_id):null,counterpartyId:counterparty_id?String(counterparty_id):null,reason,createdAt:created_at}));
  let balance=null;
  if(!cursor&&type==="all"){
   const r=await supabaseRest(env,`balances?select=balance,guild_id&user_id=eq.${encodeURIComponent(userId)}${guildFilter}&limit=10`);
   const balances=await r.json();
   if(Array.isArray(balances)&&balances.length===1)balance=Number(balances[0].balance);
  }
  return json({userId,transactions,balance,hasMore,nextCursor:hasMore?transactions.at(-1)?.id:null,filter:type});
 }catch(error){console.error("Ember ledger read failed",error);return json({error:"Unable to load Ember transactions. Check that the bot's transactions and balances tables are available through Supabase REST."},502);}
}
