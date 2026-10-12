import { hasSupabase, supabaseRest, getSupabaseKey } from "../_supabase.js";

const bundledGeoClues = {"round-01": ["/assets/ironkin-geoguessr/round-01/715e1da8447d4488ac508bd7a78e4b56.png", "/assets/ironkin-geoguessr/round-01/d0cecc4b59754c11ab17bbf033f4cb3b.png", "/assets/ironkin-geoguessr/round-01/30cf6d8dded94b2cb99ffbfc8f852845.png"], "round-02": ["/assets/ironkin-geoguessr/round-02/21cdfbbf57ff44e49b30bca19aee478f.png", "/assets/ironkin-geoguessr/round-02/50f54122bcb849ef9a8c96a41cf7ad5b.png", "/assets/ironkin-geoguessr/round-02/4e6cd23e27ad4ab487d2a630cfb4d76a.png"], "round-03": ["/assets/ironkin-geoguessr/round-03/02d5c6b2e7674d4383c302f3a606505e.png", "/assets/ironkin-geoguessr/round-03/a2377d075075453985c943e830c58ea6.png", "/assets/ironkin-geoguessr/round-03/914d81c001824e438c696d532b81ae54.png"], "round-04": ["/assets/ironkin-geoguessr/round-04/fc98c855a5bb4156b23b5bc598fc0df9.png", "/assets/ironkin-geoguessr/round-04/7702a9df1cd145beafa5279748c0c1fd.png", "/assets/ironkin-geoguessr/round-04/2c07c0112c3d454f80633dc81c07e8b7.png"], "round-05": ["/assets/ironkin-geoguessr/round-05/3c6b202830e14051afd2e1aa484bb0df.png", "/assets/ironkin-geoguessr/round-05/5cdfb747b4104b678611015226c0c93e.png", "/assets/ironkin-geoguessr/round-05/73312c9f377e4633ac95a831e2dab2b6.png"], "round-06": ["/assets/ironkin-geoguessr/round-06/883862655a88487981f28effae91dcc2.png", "/assets/ironkin-geoguessr/round-06/831fbe86bfde40dbbcbc095932914762.png", "/assets/ironkin-geoguessr/round-06/ee2fb7b261ae4f63983e115c218662f3.png"], "round-07": ["/assets/ironkin-geoguessr/round-07/c410aa34118b47839461ade8fd763db4.png", "/assets/ironkin-geoguessr/round-07/25f32168c4644113b8cc2dc440ed3448.png", "/assets/ironkin-geoguessr/round-07/95f3f2f4f7224c8cb27b38c6b2a87787.png"], "round-08": ["/assets/ironkin-geoguessr/round-08/e360df8b0ac54344899b880b8723ae7d.png", "/assets/ironkin-geoguessr/round-08/3aa1f0d3697445a79c99b777cb5fdb48.png", "/assets/ironkin-geoguessr/round-08/9f3cf5f742e849d68fe0e36f8adf9e7b.png"], "round-09": ["/assets/ironkin-geoguessr/round-09/6e681ea4ad0c4852a9b5c42edc23f49a.png", "/assets/ironkin-geoguessr/round-09/7e8af7bdb36b4442be3cc8496cef6701.png", "/assets/ironkin-geoguessr/round-09/43156be5703b45d39130a86189fb2a03.png"], "round-10": ["/assets/ironkin-geoguessr/round-10/9a491893f4b840588b8adf80d9fa0d3d.png", "/assets/ironkin-geoguessr/round-10/3bd36b7c43424bf8971e314a255f2767.png", "/assets/ironkin-geoguessr/round-10/d91d4975f1c444db825df10c41d0af06.png"]};
// Restore bundled GeoGuessr clues when an older admin save retained only image 1.
// Do not alter unrelated Location Hunt challenges or override custom additional clues.
function completeBundledClues(images){
 if(images.length!==1)return images;
 const first=images[0];
 const match=first.match(/\/assets\/ironkin-geoguessr\/(round-\d{2})\/[^/?#]+\.png(?:[?#].*)?$/i);
 if(!match)return images;
 const bundled=bundledGeoClues[match[1]];
 if(!bundled||!bundled.includes(first))return images;
 return [first,...bundled.filter(url=>url!==first)];
}
export function locationHuntStops(challenge,week){
 const base=new Date(challenge?.opensAt||week?.startDate||0).getTime();
 const configured=Array.isArray(challenge?.locationHunt)?challenge.locationHunt:[];
 return configured.map((x,i)=>{
  const explicit=new Date(x.revealsAt||0).getTime();const at=Number.isFinite(explicit)&&explicit>0?explicit:base;
  const images=completeBundledClues((Array.isArray(x.images)&&x.images.length?x.images:String(x.image||'').split(',')).map(v=>String(v).trim()).filter(Boolean));
  return {id:String(x.id||`location-${i+1}`),title:String(x.title||`Round ${i+1}`),images,requirement:String(x.requirement||'Screenshot your character at the matching location.'),minimumPlayers:Math.max(1,Number(x.minimumPlayers)||1),revealsAt:new Date(at).toISOString()};
 });
}
export function locationPoints(n){return n<=1?5:n===2?3:1;}
export async function clueRows(env,weekId,challengeId,teamId,test=false){
 const r=await supabaseRest(env,`ironkin_games_location_clues${test?"_test":""}?select=*&week_id=eq.${encodeURIComponent(weekId)}&challenge_id=eq.${encodeURIComponent(challengeId)}&team_id=eq.${encodeURIComponent(teamId)}`);
 const rows=await r.json();if(!Array.isArray(rows))throw new Error("Invalid clue response from database");return rows;
}
export async function locationRows(env,weekId,challengeId,teamId,test=false){
  if(!hasSupabase(env)) return [];
  const r=await supabaseRest(env,`ironkin_games_location_submissions${test?"_test":""}?select=*&week_id=eq.${encodeURIComponent(weekId)}&challenge_id=eq.${encodeURIComponent(challengeId)}&team_id=eq.${encodeURIComponent(teamId)}&order=submitted_at.asc`);
  const rows=await r.json();if(!Array.isArray(rows))throw new Error("Invalid proof response from database");return rows;
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
