import { TERRITORIES, CONQUEST_RULES } from './_conquestConfig.js';
export const region = id => TERRITORIES.find(r=>r.id===id);
export const task = id => TERRITORIES.flatMap(r=>r.tasks).find(t=>t.id===id);
export const stateFor = (s,id) => s.teams[id] ||= {unlocked:[],scouted:[],equipped:[],lastSwap:'',usedPowers:[],approved:{},powerBonuses:[],penalties:0,declared:[],participants:{},metrics:{},extraActions:0};
export const progress = (t,r) => r.tasks.reduce((sum,x)=>sum+(t.approved[x.id]?x.points:0),0);
export const captured = (t,r) => t.unlocked.includes(r.id)&&progress(t,r)>=r.captureThreshold;
export const derivedTaskBonuses = t => {
 const approved=t.approved||{};
 let points=0;
 for(const d of t.declared||[]){
  if(d.status!=='completed'||!approved[d.taskId])continue;
  const obj=task(d.taskId);
  if(d.power==='asgarnia')points+=25;
  if(d.power==='karamja')points+=obj?.tier==='Elite'?100:50;
  if(d.power==='wilderness')points+=150;
  if(d.power==='zeah')points+=100;
 }
 if(eligible(t,'kandarin')||(t.copiedPassive||[]).includes('kandarin')){
  const count=Object.entries(t.participants||{}).filter(([id,ids])=>approved[id]&&new Set(ids||[]).size>=3).length;
  points+=Math.min(5,count)*15;
 }
 return points;
};
export const total = t => TERRITORIES.reduce((n,r)=>n+progress(t,r)+(captured(t,r)?r.captureBonus:0),0)+(t.powerBonuses||[]).filter(b=>b.source==='staff').reduce((n,b)=>n+Number(b.points||0),0)+derivedTaskBonuses(t)-(t.penalties||0);
export const eligible = (t,id) => t.equipped.includes(id)&&captured(t,region(id));
const competitive = TERRITORIES.flatMap(r=>r.tasks.filter(t=>t.competitive));
const ascending = new Set(['morytania-14','zeah-14']);
export function rankings(s,games){
 const result={};
 for(const challenge of competitive){
  const candidates=(games.teams||[]).map(team=>({teamId:team.id,metric:stateFor(s,team.id).metrics?.[challenge.id]})).filter(x=>typeof x.metric==='number'&&Number.isFinite(x.metric)&&stateFor(s,x.teamId).approved[challenge.id]);
  candidates.sort((a,b)=>ascending.has(challenge.id)?a.metric-b.metric:b.metric-a.metric);
  result[challenge.id]=candidates.map((c,i)=>{const place=candidates.findIndex(x=>x.metric===c.metric)+1;return {...c,place,bonus:CONQUEST_RULES.competitiveBonuses[place-1]||0}});
 }
 return result;
}
export function summaries(s,games){
 const ranks=rankings(s,games),output={};
 for(const team of games.teams||[]){
  const t=stateFor(s,team.id),captures=TERRITORIES.filter(r=>captured(t,r));
  const rankingBonus=s.published?Object.values(ranks).flat().filter(x=>x.teamId===team.id).reduce((n,x)=>n+x.bonus,0):0;
  const gloryBonus=s.published&&(eligible(t,'varlamore')||(t.copiedPassive||[]).includes('varlamore'))?Math.min(2,Object.values(ranks).flat().filter(x=>x.teamId===team.id&&x.place===1).length)*20:0;
  const secretBonus=TERRITORIES.reduce((n,r)=>n+(t.scouted.includes(r.id)&&t.approved[r.id+'-secret']?20:0),0);
  const members=new Set([team.captainDiscordId,...(team.members||[]).map(m=>m.discordId||m.id)].filter(Boolean).map(String));
  const participation=new Set(Object.entries(t.participants||{}).filter(([id])=>t.approved[id]).flatMap(([,ids])=>ids).map(String));
  const participationBonus=members.size>=8&&[...members].every(id=>participation.has(id))?25:0;
  const base=TERRITORIES.reduce((n,r)=>n+progress(t,r),0),captureBonus=captures.reduce((n,r)=>n+r.captureBonus,0),powerBonus=(t.powerBonuses||[]).filter(b=>b.source==='staff').reduce((n,b)=>n+Number(b.points||0),0)+derivedTaskBonuses(t);
  output[team.id]={teamName:team.name,unlocked:t.unlocked,scouted:t.scouted,equipped:t.equipped,lastSwap:t.lastSwap,usedPowers:t.usedPowers,actionsLeft:5+(t.extraActions||0)-t.unlocked.length,scoutsLeft:2-t.scouted.length,captured:captures.map(r=>r.id),progress:Object.fromEntries(TERRITORIES.map(r=>[r.id,progress(t,r)])),basePoints:base,captureBonus,powerBonus:powerBonus+gloryBonus,secretBonus,rankingBonus,participationBonus,penalties:t.penalties||0,total:base+captureBonus+powerBonus+gloryBonus+secretBonus+rankingBonus+participationBonus-(t.penalties||0),approved:t.approved,declared:t.declared||[],metrics:t.metrics||{},participants:t.participants||{}};
 }
 return {scores:output,rankings:ranks};
}
