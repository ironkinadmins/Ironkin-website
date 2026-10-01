import { getSession, isStaffSession } from "../_auth.js";
import { supabaseRest } from "../_supabase.js";
const noStore={"Cache-Control":"no-store"};
export async function onRequestGet({request,env}){
  const session=await getSession(request,env); const url=new URL(request.url); const boss=String(url.searchParams.get("boss")||"").trim();
  const filters=["status=eq.approved"]; if(boss) filters.push(`boss=eq.${encodeURIComponent(boss)}`);
  const response=await supabaseRest(env,`hall_of_flame_submissions?select=id,display_name,boss,time_ms,time_text,proof_url,status,final_placement,created_at,reviewed_at,reviewed_by_name&${filters.join("&")}&order=reviewed_at.desc&limit=100`);
  return Response.json({entries:await response.json(),signedIn:Boolean(session),isStaff:isStaffSession(session)},{headers:noStore});
}
