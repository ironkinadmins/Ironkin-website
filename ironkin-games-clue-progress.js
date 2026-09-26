const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;"}[c]||({">":"&gt;","'":"&#39;",'"':"&quot;"}[c])));
const tiers=["beginner","easy","medium","hard","elite","master"];
const labels={beginner:"Beginner",easy:"Easy",medium:"Medium",hard:"Hard",elite:"Elite",master:"Master"};
const params=new URLSearchParams(location.search),weekId=params.get("weekId")||"",challengeId=params.get("challengeId")||"";
function ago(iso){const ms=Date.now()-new Date(iso||0).getTime();if(!Number.isFinite(ms))return"";const m=Math.max(0,Math.floor(ms/60000));return m<1?"just now":m===1?"1 minute ago":`${m} minutes ago`;}
function cooldownText(ms){const m=Math.max(1,Math.ceil(ms/60000));return m>=60?"Refresh available in 1 hour":`Refresh available in ${m}m`;}
function render(d){
  $("clueTitle").textContent=d.challenge?.name||"Clue Hunters"; $("totalPoints").textContent=Number(d.totals?.points||0).toLocaleString();
  $("clueStatus").hidden=true;
  const rows=(d.rows||[]).map(r=>`<tr><td class="player-cell"><strong>${esc(r.name||r.rsn)}</strong>${r.name&&r.rsn&&r.name!==r.rsn?`<small>${esc(r.rsn)}</small>`:""}</td>${tiers.map(t=>`<td>${Number(r.tiers?.[t])||0}</td>`).join("")}<td class="total-cell">${Number(r.clues)||0}</td><td class="points-cell">${Number(r.points)||0}</td></tr>`).join("");
  const remaining=Math.max(0,Number(d.refreshAvailableAt||0)-Date.now());
  $("clueProgress").innerHTML=`<section class="clue-summary"><div><span>YOUR TEAM</span><strong>${esc(d.team?.name||"Team")}</strong></div><div><span>TOTAL CLUES</span><strong>${Number(d.totals?.clues)||0}</strong></div><div><span>LAST UPDATED</span><strong>${esc(ago(d.updatedAt)||"Just now")}</strong></div><button id="refreshWom" class="games-btn secondary" type="button" ${remaining>0?"disabled":""}>${remaining>0?esc(cooldownText(remaining)):"Refresh WOM"}</button></section><section class="clue-table-card"><div class="clue-table-wrap"><table><thead><tr><th>Teammate</th>${tiers.map(t=>`<th>${labels[t]}</th>`).join("")}<th>Total Clues</th><th>Points</th></tr></thead><tbody>${rows||`<tr><td colspan="9">No rostered players found.</td></tr>`}</tbody></table></div><div class="clue-key"><span><b>0.5</b> Beginner</span><span><b>1</b> Easy</span><span><b>2</b> Medium</span><span><b>4</b> Hard</span><span><b>7</b> Elite</span><span><b>10</b> Master</span></div></section>`;
  const b=$("refreshWom"); if(b&&!b.disabled)b.onclick=()=>load(true,b);
}
async function load(force=false,button=null){try{if(button){button.disabled=true;button.textContent="Refreshing…";}const q=new URLSearchParams({weekId,challengeId});if(force)q.set("refresh","1");const r=await fetch(`/api/ironkin-games/clue-progress?${q}`,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not load team progress.");render(d);}catch(e){$("clueStatus").hidden=false;$("clueStatus").textContent=e.message;if(button){button.disabled=false;button.textContent="Try Again";}}}
if(!weekId||!challengeId){$("clueStatus").textContent="Challenge information is missing.";}else load();
