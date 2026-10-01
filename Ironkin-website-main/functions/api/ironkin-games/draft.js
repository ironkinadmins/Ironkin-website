import { getSession, isStaffSession } from "../_auth.js";
import { loadGames } from "./_store.js";
const idOf = p => String(p?.discordId || p?.id || "");
const nameOf = p => p?.rsn || p?.displayName || p?.name || "Player";
const buildSequence=(teams,signups,order)=>{
  const signupIds=new Set(signups.map(idOf));
  const remaining=new Map(teams.map(t=>[String(t.id),8-(signupIds.has(String(t.captainDiscordId||""))?1:0)]));
  const seq=[];
  for(let round=0;round<8;round++){const row=round%2?[...order].reverse():[...order];for(const id of row){if((remaining.get(String(id))||0)>0){seq.push(String(id));remaining.set(String(id),(remaining.get(String(id))||0)-1);}}}
  return seq;
};
export async function onRequestGet({request,env}){
  const state=await loadGames(env), session=await getSession(request,env), staff=isStaffSession(session);
  const signups=Array.isArray(state.signups)?state.signups:[];
  const draft=state.draft&&typeof state.draft==="object"?state.draft:{status:"setup",order:[],picks:[]};
  const signupIds=new Set(signups.map(idOf));
  const captainIds=new Set((state.teams||[]).map(t=>String(t.captainDiscordId||"")).filter(Boolean));
  const draftedIds=new Set((draft.picks||[]).map(p=>String(p.playerId||"")));
  const player = p => ({id:idOf(p),name:nameOf(p),ehp:Number(p.ehp)||0,ehb:Number(p.ehb)||0,totalLevel:Number(p.totalLevel)||0,timezone:p.timezone||"—"});
  const teams=(state.teams||[]).slice(0,4).map(t=>{
    const capId=String(t.captainDiscordId||""), cap=signups.find(p=>idOf(p)===capId), override=draft.captainOverrides?.[capId];
    const captain=cap?{...player(cap),playing:true}:(capId?{id:capId,name:override?.name||"Admin Captain",playing:false}:null);
    const picks=(draft.picks||[]).filter(p=>String(p.teamId)===String(t.id)).map(pk=>player(signups.find(p=>idOf(p)===String(pk.playerId))||pk.player||{}));
    return {id:t.id,name:t.name||"Team",captain,picks,targetPicks:captain?.playing?7:8};
  });
  const available=signups.filter(p=>!captainIds.has(idOf(p))&&!draftedIds.has(idOf(p))).map(player).sort((a,b)=>b.ehp-a.ehp);
  const order=(draft.order||[]).filter(id=>teams.some(t=>String(t.id)===String(id)));
  const sequence=order.length===4?buildSequence((state.teams||[]).slice(0,4),signups,order):[], pickNo=(draft.picks||[]).length, totalPicks=sequence.length||teams.reduce((n,t)=>n+t.targetPicks,0);
  let currentTeamId="";
  if(draft.status==="live"&&pickNo<sequence.length)currentTeamId=sequence[pickNo]||"";
  const round=pickNo<sequence.length?Math.min(8,Math.floor(pickNo/4)+1):Math.min(8,Math.ceil(Math.max(1,pickNo)/4));
  return Response.json({title:state.title||"Ironkin Games",draft:{status:draft.status||"setup",order,picksMade:pickNo,totalPicks,currentTeamId,round},teams,available,isStaff:staff},{headers:{"Cache-Control":"no-store"}});
}
