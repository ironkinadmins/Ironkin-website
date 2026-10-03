import { hasSupabase, supabaseRest, getSupabaseKey } from "../_supabase.js";

export function locationHuntStops(challenge, week) {
  const base = new Date(challenge?.opensAt || week?.startDate || 0).getTime();
  return (Array.isArray(challenge?.locationHunt) ? challenge.locationHunt : []).map((x,i)=>{
    const explicit = new Date(x.revealsAt || 0).getTime();
    const revealMs = Number.isFinite(explicit) && explicit > 0 ? explicit : base + i*86400000;
    return { id:String(x.id||`location-${i+1}`), title:String(x.title||`Location ${i+1}`), image:String(x.image||""), requirement:String(x.requirement||"Recreate the screenshot with your team."), minimumPlayers:Math.max(1,Number(x.minimumPlayers)||4), revealsAt:Number.isFinite(revealMs)?new Date(revealMs).toISOString():"" };
  });
}
export async function locationRows(env,weekId,challengeId,teamId){
  if(!hasSupabase(env)) return [];
  const r=await supabaseRest(env,`ironkin_games_location_submissions?select=*&week_id=eq.${encodeURIComponent(weekId)}&challenge_id=eq.${encodeURIComponent(challengeId)}&team_id=eq.${encodeURIComponent(teamId)}&order=submitted_at.asc`);
  const rows=await r.json(); return Array.isArray(rows)?rows:[];
}
export function currentLocationRows(rows){
  const map=new Map();
  for(const row of rows||[]){const prev=map.get(String(row.location_id));if(!prev||new Date(row.submitted_at).getTime()>new Date(prev.submitted_at).getTime())map.set(String(row.location_id),row);}
  return map;
}
export async function uploadLocationProof(env,file,id){
  const base=String(env.SUPABASE_URL||"").replace(/\/$/,""),key=getSupabaseKey(env);if(!base||!key)throw new Error("Supabase is not configured.");
  const ext=String(file.name||"proof.png").split(".").pop().replace(/[^a-z0-9]/gi,"").toLowerCase()||"png",path=`location-hunt/${id}.${ext}`;
  const headers={apikey:key,"Content-Type":file.type||"application/octet-stream","x-upsert":"false"};if(!key.startsWith("sb_secret_"))headers.Authorization=`Bearer ${key}`;
  const r=await fetch(`${base}/storage/v1/object/ironkin-games-proofs/${path}`,{method:"POST",headers,body:file});if(!r.ok)throw new Error(`Proof upload failed: ${await r.text()}`);
  return `${base}/storage/v1/object/public/ironkin-games-proofs/${path}`;
}
