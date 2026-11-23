import { getSession, isStaffSession } from "../_auth.js";
import { hybridKv } from "../_hybridKv.js";
import { appendAdminAudit } from "../_adminAudit.js";
const headers = { "Cache-Control":"no-store" };
const reply = (data, status=200) => Response.json(data,{status,headers});
const validId = value => /^\d{17,22}$/.test(String(value||""));
async function context(env,id) {
  const kv=hybridKv(env,"drops");
  const raw=await kv.get(`member-profile:${id}`);
  const profile=raw?JSON.parse(raw):null;
  const revoked=await kv.get(`plugin-key-revoked:${id}`);
  return {kv,profile,revoked};
}
export async function onRequestGet({request,env}) {
  const session=await getSession(request,env);
  if(!isStaffSession(session))return reply({error:"Staff only."},403);
  const id=new URL(request.url).searchParams.get("discordId");
  if(!validId(id))return reply({error:"Provide a valid Discord member ID."},400);
  const {profile,revoked}=await context(env,id);
  return reply({discordId:id,displayName:profile?.displayName||"",rsn:profile?.rsn||"",previousRsns:profile?.previousRsns||[],hasKey:Boolean(profile?.pluginApiKey),revoked:Boolean(revoked),revokedAt:revoked?JSON.parse(revoked)?.at:null});
}
export async function onRequestPost({request,env}) {
  const session=await getSession(request,env);
  if(!isStaffSession(session))return reply({error:"Staff only."},403);
  const body=await request.json().catch(()=>({}));
  const id=String(body.discordId||"");
  if(!validId(id)||body.action!=="revoke")return reply({error:"Provide discordId and action: revoke."},400);
  const {kv,profile,revoked}=await context(env,id);
  if(!profile)return reply({error:"Member profile not found."},404);
  if(revoked)return reply({ok:true,alreadyRevoked:true,discordId:id});
  const at=new Date().toISOString();
  // Set deny marker FIRST: no request can authenticate using an old key afterward.
  await kv.put(`plugin-key-revoked:${id}`,JSON.stringify({at,by:String(session.id)}));
  if(profile.pluginApiKey)await kv.delete(`plugin-api-key:${profile.pluginApiKey}`);
  profile.pluginApiKey="";
  profile.pluginKeyRevoked=true;
  profile.pluginKeyRevokedAt=at;
  await kv.put(`member-profile:${id}`,JSON.stringify(profile));
  await appendAdminAudit(env,session,"plugin-key.revoked",`Revoked plugin access for ${profile.displayName||id}`,id);
  return reply({ok:true,discordId:id,revoked:true,revokedAt:at});
}
