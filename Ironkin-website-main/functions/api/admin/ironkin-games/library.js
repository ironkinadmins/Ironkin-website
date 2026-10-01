import { getSession, isStaffSession } from "../../_auth.js";
import { loadGames, saveGames } from "../../ironkin-games/_store.js";

const clean = c => ({
  id:String(c.id||crypto.randomUUID()), name:String(c.name||"New Challenge"), publicName:String(c.publicName||"Mystery Challenge"),
  kind:c.kind==="side"?"side":"main", durationMode:c.durationMode==="week"?"week":"timed", durationMinutes:Math.max(1,Number(c.durationMinutes)||60),
  trackingMethod:["automatic","admin"].includes(c.trackingMethod)?c.trackingMethod:"submissions",
  trackerType:["timed-wom-attempt","wom-clues","wom-metric","boss-rush","clue-progress"].includes(c.trackerType)?c.trackerType:"none",
  trackerConfig:{metric:String(c.trackerConfig?.metric||""),metricLabel:String(c.trackerConfig?.metricLabel||"")},
  scoring:{mode:String(c.scoring?.mode||((c.trackerType==="wom-clues"||c.trackerType==="clue-progress")?"weighted-clues":(c.trackerType==="timed-wom-attempt"||c.trackerType==="boss-rush")?"unique-metrics":"total-gain")),ranking:c.scoring?.ranking==="lowest"?"lowest":"highest",weights:{beginner:Number(c.scoring?.weights?.beginner??.5),easy:Number(c.scoring?.weights?.easy??1),medium:Number(c.scoring?.weights?.medium??2),hard:Number(c.scoring?.weights?.hard??4),elite:Number(c.scoring?.weights?.elite??7),master:Number(c.scoring?.weights?.master??10)},tieBreak:Array.isArray(c.scoring?.tieBreak)?c.scoring.tieBreak:["master","elite","hard","medium","easy","beginner"]},
  trackingMode:["timed-wom-attempt","boss-rush"].includes(c.trackerType)?"boss-rush":"team", attemptsPerPlayer:Math.max(1,Number(c.attemptsPerPlayer)||1),
  participants:String(c.participants||"3-5 players"), proofRequired:c.trackingMethod==="submissions"?c.proofRequired!==false:false,
  summary:String(c.summary||""), objective:String(c.objective||""), instructions:String(c.instructions||""), rules:Array.isArray(c.rules)?c.rules.map(String):[], status:c.status||"active"
});
export async function onRequestPost({request,env}){
  if(!isStaffSession(await getSession(request,env))) return Response.json({error:"Staff only."},{status:403});
  const body=await request.json().catch(()=>({})), state=await loadGames(env), action=String(body.action||"save");
  state.challengeLibrary=Array.isArray(state.challengeLibrary)?state.challengeLibrary:[];
  if(action==="delete"){
    const id=String(body.id||"");
    if((state.weeks||[]).some(w=>(w.challenges||[]).some(c=>String(c.libraryId||"")===id))) return Response.json({error:"This challenge is already used by a week. Remove it from those weeks before deleting the library definition."},{status:409});
    state.challengeLibrary=state.challengeLibrary.filter(c=>String(c.id)!==id);
  } else {
    const item=clean(body.challenge||{}), i=state.challengeLibrary.findIndex(c=>String(c.id)===item.id);
    if(i>=0) state.challengeLibrary[i]={...state.challengeLibrary[i],...item}; else state.challengeLibrary.push(item);
  }
  await saveGames(env,state); return Response.json({ok:true,state});
}
