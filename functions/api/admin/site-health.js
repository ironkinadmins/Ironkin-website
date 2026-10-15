import { getSession, isStaffSession } from "../_auth.js";
import { hasSupabase, supabaseRest } from "../_supabase.js";
import { loadGames } from "../ironkin-games/_store.js";

const headers = { "Cache-Control": "no-store" };
async function check(name, task) {
  const start=Date.now();
  try {
    const result=await task();
    return { name, status:result==="not-configured"?"not-configured":"ok", latencyMs:Date.now()-start };
  } catch (error) {
    console.warn("Admin health check:",name,error?.message||error);
    return { name, status:"error", latencyMs:Date.now()-start };
  }
}
export async function onRequestGet({request,env}) {
  const session=await getSession(request,env);
  if(!isStaffSession(session))return Response.json({error:"Staff only."},{status:403,headers});
  const checks=await Promise.all([
    check("Supabase",async()=>{
      if(!hasSupabase(env))return "not-configured";
      await supabaseRest(env,"hall_of_flame_submissions?select=id&limit=1");
    }),
    check("Ironkin Games storage",async()=>{await loadGames(env);}),
    check("Discord configuration",async()=>{
      return (env.DISCORD_BOT_TOKEN||env.DISCORD_TOKEN)?"ok":"not-configured";
    })
  ]);
  return Response.json({checks,checkedAt:new Date().toISOString()},{headers});
}
