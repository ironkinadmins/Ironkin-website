import { getConfig, getTeamSession, boardTeam } from "./_teamAccess.js";
import { requireBingoTeam } from "./_teamAuthorization.js";
import { enforceStateIntegrity } from "./_stateIntegrity.js";
const noStore={"Cache-Control":"no-store"};
function emptyProgress(){return{completedQuantity:0,status:"open",completedBy:"",proofId:""};}
function cleanTile(tile,index,team){const progress=tile?.teamProgress?.[team]||emptyProgress();return{id:index,name:String(tile?.name||"").slice(0,120),image:String(tile?.image||"").slice(0,700),quantity:Math.max(1,Number(tile?.quantity)||1),teamProgress:{[team]:{completedQuantity:Math.max(0,Number(progress.completedQuantity)||0),status:["open","submitted","partial","approved","rejected"].includes(progress.status)?progress.status:"open",completedBy:String(progress.completedBy||"").slice(0,100),proofId:String(progress.proofId||"").slice(0,80)}}};}
function cleanAttack(a){return{id:String(a?.id||""),attackingTeam:a?.attackingTeam,defendingTeam:a?.defendingTeam,targetIndex:Number(a?.targetIndex),result:a?.result==="hit"?"hit":"miss",shipKey:String(a?.shipKey||""),at:String(a?.at||"")};}
const DEFAULT_SHIP_SIZES={carrier:5,battleship:4,cruiser:3,submarine:3,destroyer:3,patrol:2,"patrol-boat":2,patrolboat:2};
function cleanFleetSummary(team,teamKey,attacks){
  const ships=Array.isArray(team?.ships)?team.ships:[];
  const hitsTaken=(Array.isArray(attacks)?attacks:[]).filter(a=>a?.defendingTeam===teamKey&&a?.result==="hit").length;
  return {
    captain:String(team?.captain||"").slice(0,100),
    fleetConfirmed:Boolean(team?.fleetConfirmed),
    hitsTaken,
    ships:ships.map(ship=>{
      const key=String(ship?.key||"").toLowerCase().replace(/\s+/g,"-").slice(0,40);
      const cells=Array.isArray(ship?.cells)?ship.cells:[];
      const size=Math.max(0,Number(ship?.size)||cells.length||DEFAULT_SHIP_SIZES[key]||0);
      return {key,name:String(ship?.name||"").slice(0,80),size,sunk:Boolean(ship?.sunk)};
    })
  };
}
export async function onRequestGet({request,env}){const access=await getTeamSession(request,env);if(!access)return Response.json({error:"Team password required."},{status:401,headers:noStore});const user=await requireBingoTeam(request,env,access);if(!user.ok)return Response.json({error:user.error},{status:user.status,headers:noStore});const own=boardTeam(access),opponent=own==="ember"?"ash":"ember";const raw=await env.DROPS_KV.get("bingo:state:v2");if(!raw)return Response.json({error:"The Bingo board has not been created yet."},{status:404,headers:noStore});const state=enforceStateIntegrity(JSON.parse(raw)),config=await getConfig(env);const ownTeam=state.teams?.[own]||{},opponentTeam=state.teams?.[opponent]||{};const attacks=(Array.isArray(state.attacks)?state.attacks:[]).filter(a=>user.isStaff?(a.attackingTeam===own||a.defendingTeam===own):a.attackingTeam===own).map(cleanAttack);return Response.json({version:1,accessTeam:access,viewerTeam:own,isStaff:Boolean(user.isStaff),size:10,phase:state.phase||"setup",locked:Boolean(state.locked),updatedAt:state.updatedAt||"",tiles:(Array.isArray(state.tiles)?state.tiles:[]).slice(0,100).map((t,i)=>cleanTile(t,i,own)),ownTeam:{key:own,name:config[access].name,captain:String(ownTeam.captain||""),fleetConfirmed:Boolean(ownTeam.fleetConfirmed),ships:user.isStaff?(Array.isArray(ownTeam.ships)?ownTeam.ships:[]).map(s=>({key:String(s.key||""),name:String(s.name||""),size:Number(s.size)||0,cells:Array.isArray(s.cells)?s.cells.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<100):[],sunk:Boolean(s.sunk)})):[]},opponent:{key:opponent,name:config[access==="team1"?"team2":"team1"].name,captain:String(opponentTeam.captain||"")},fleetSummary:{[own]:cleanFleetSummary(ownTeam,own,state.attacks),[opponent]:cleanFleetSummary(opponentTeam,opponent,state.attacks)},attacks,proofs:(Array.isArray(state.proofs)?state.proofs:[]).filter(p=>p.team===own).slice(0,100).map(p=>({id:String(p.id||""),tileIndex:Number(p.tileIndex),player:String(p.player||""),url:String(p.url||""),note:String(p.note||""),quantity:Math.max(1,Number(p.quantity)||1),status:String(p.status||"pending"),createdAt:String(p.createdAt||"")}))},{headers:noStore});}
