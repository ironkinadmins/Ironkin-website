import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";
const idOf=p=>String(p?.discordId||p?.id||"");
const displayOf=s=>String(s?.nick||s?.global_name||s?.username||"Admin Captain");
const buildSequence=(teams,signups,order)=>{
  const signupIds=new Set(signups.map(idOf));
  const remaining=new Map(teams.map(t=>[String(t.id),8-(signupIds.has(String(t.captainDiscordId||""))?1:0)]));
  const seq=[];
  for(let round=0;round<8;round++){
    const row=round%2?[...order].reverse():[...order];
    for(const id of row){if((remaining.get(String(id))||0)>0){seq.push(String(id));remaining.set(String(id),(remaining.get(String(id))||0)-1);}}
  }
  return seq;
};
export async function onRequestPost({request,env}){
 const session=await getSession(request,env);
 if(!isStaffSession(session))return Response.json({error:"Staff only."},{status:403});
 const body=await request.json().catch(()=>({})), action=String(body.action||""); const state=await loadGames(env);
 state.draft=state.draft&&typeof state.draft==="object"?state.draft:{status:"setup",order:[],picks:[]};
 const teams=(state.teams||[]).slice(0,4), teamIds=new Set(teams.map(t=>String(t.id))), signups=state.signups||[];
 if(action==="start"){
   const order=Array.isArray(body.order)?body.order.map(String):[];
   if(order.length!==4||new Set(order).size!==4||order.some(id=>!teamIds.has(id)))return Response.json({error:"Choose all four teams once in the Round 1 draft order."},{status:400});
   if(teams.some(t=>!String(t.captainDiscordId||"")))return Response.json({error:"Assign a captain to all four teams before starting the draft."},{status:400});
   const signupIds=new Set(signups.map(idOf));
   const nonPlaying=teams.filter(t=>!signupIds.has(String(t.captainDiscordId||"")));
   if(nonPlaying.length>1)return Response.json({error:"Only one non-playing admin captain is allowed. The other captains must be signed-up players."},{status:400});
   if(nonPlaying.length===1&&String(nonPlaying[0].captainDiscordId)!==String(session?.id||""))return Response.json({error:"A non-playing captain must be your own Discord account. Other captains must be signed-up players."},{status:400});
   const captainOverrides={};
   if(nonPlaying.length===1)captainOverrides[String(session.id)]={name:displayOf(session)};
   state.draft={status:"live",order,picks:[],startedAt:new Date().toISOString(),completedAt:"",captainOverrides};
   state.teams=state.teams.map(t=>teamIds.has(String(t.id))?{...t,members:[]}:t);
 } else if(action==="pick"){
   if(state.draft.status!=="live")return Response.json({error:"The draft is not live."},{status:409});
   const picks=state.draft.picks||[], order=state.draft.order||[], sequence=buildSequence(teams,signups,order), pickNo=picks.length;
   if(pickNo>=sequence.length)return Response.json({error:"The draft is already complete."},{status:409});
   const current=sequence[pickNo];
   if(String(body.teamId||current)!==String(current))return Response.json({error:"That team is not on the clock."},{status:409});
   const playerId=String(body.playerId||""), player=signups.find(p=>idOf(p)===playerId);
   if(!player)return Response.json({error:"Player not found in signups."},{status:404});
   const captains=new Set(teams.map(t=>String(t.captainDiscordId||"")));
   if(captains.has(playerId)||picks.some(p=>String(p.playerId)===playerId))return Response.json({error:"That player is not available."},{status:409});
   const round=Math.floor(pickNo/4)+1;
   state.draft.picks=[...picks,{pick:pickNo+1,round,teamId:current,playerId,player:{discordId:idOf(player),name:player.rsn||player.displayName||"Player",rsn:player.rsn||"",ehp:player.ehp,ehb:player.ehb,totalLevel:player.totalLevel,timezone:player.timezone||""},pickedAt:new Date().toISOString()}];
   state.teams=state.teams.map(t=>String(t.id)===String(current)?{...t,members:[...(t.members||[]),{discordId:idOf(player),name:player.rsn||player.displayName||"Player",rsn:player.rsn||"",ehp:player.ehp,ehb:player.ehb,totalLevel:player.totalLevel,timezone:player.timezone||""}]}:t);
   if(state.draft.picks.length>=sequence.length){state.draft.status="complete";state.draft.completedAt=new Date().toISOString();state.rosterLocked=true;}
 } else if(action==="undo"){
   const picks=state.draft.picks||[]; if(!picks.length)return Response.json({error:"There is no pick to undo."},{status:409});
   const last=picks[picks.length-1]; state.draft.picks=picks.slice(0,-1); state.draft.status="live"; state.draft.completedAt=""; state.rosterLocked=false;
   state.teams=state.teams.map(t=>String(t.id)===String(last.teamId)?{...t,members:(t.members||[]).filter(m=>idOf(m)!==String(last.playerId))}:t);
 } else if(action==="reset"){
   state.draft={status:"setup",order:[],picks:[],startedAt:"",completedAt:"",captainOverrides:{}}; state.rosterLocked=false;
   state.teams=state.teams.map((t,i)=>i<4?{...t,members:[]}:t);
 } else return Response.json({error:"Unknown draft action."},{status:400});
 await saveGames(env,state); return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
