import { clearCookie, getConfig, getTeamSession } from "./_teamAccess.js";
const h=(x={})=>({"Cache-Control":"no-store",...x});
export async function onRequestGet({request,env}){const team=await getTeamSession(request,env);const c=await getConfig(env);return Response.json({team,teams:{team1:{name:c.team1.name,passwordSet:Boolean(c.team1.hash)},team2:{name:c.team2.name,passwordSet:Boolean(c.team2.hash)}}},{headers:h()});}
export async function onRequestDelete(){return Response.json({ok:true},{headers:h({"Set-Cookie":clearCookie()})});}
