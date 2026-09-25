import { getSession, isStaffSession } from "../_auth.js";
import { loadGames } from "./_store.js";
const idOf = p => String(p?.discordId || p?.id || "");
const nameOf = p => p?.rsn || p?.displayName || p?.name || "Player";
export async function onRequestGet({request,env}){
  const state=await loadGames(env), session=await getSession(request,env), staff=isStaffSession(session);
  const signups=Array.isArray(state.signups)?state.signups:[];
  const draft=state.draft&&typeof state.draft==="object"?state.draft:{status:"setup",order:[],picks:[]};
  const captainIds=new Set((state.teams||[]).map(t=>String(t.captainDiscordId||"")).filter(Boolean));
  const draftedIds=new Set((draft.picks||[]).map(p=>String(p.playerId||"")));
  const player = p => ({id:idOf(p),name:nameOf(p),ehp:Number(p.ehp)||0,ehb:Number(p.ehb)||0,totalLevel:Number(p.totalLevel)||0,timezone:p.timezone||"—"});
  const teams=(state.teams||[]).slice(0,4).map(t=>{
    const cap=signups.find(p=>idOf(p)===String(t.captainDiscordId||""));
    const picks=(draft.picks||[]).filter(p=>String(p.teamId)===String(t.id)).map(pk=>player(signups.find(p=>idOf(p)===String(pk.playerId))||pk.player||{}));
    return {id:t.id,name:t.name||"Team",captain:cap?player(cap):null,picks};
  });
  const available=signups.filter(p=>!captainIds.has(idOf(p))&&!draftedIds.has(idOf(p))).map(player).sort((a,b)=>b.ehp-a.ehp);
  const order=(draft.order||[]).filter(id=>teams.some(t=>t.id===id));
  const totalPicks=Math.max(0,teams.length*7), pickNo=(draft.picks||[]).length;
  let currentTeamId="";
  if(draft.status==="live"&&order.length===4&&pickNo<totalPicks){const round=Math.floor(pickNo/4),pos=pickNo%4,currentOrder=round%2?order.slice().reverse():order;currentTeamId=currentOrder[pos]||"";}
  return Response.json({title:state.title||"Ironkin Games",draft:{status:draft.status||"setup",order,picksMade:pickNo,totalPicks,currentTeamId,round:Math.min(7,Math.floor(pickNo/4)+1)},teams,available,isStaff:staff},{headers:{"Cache-Control":"no-store"}});
}
