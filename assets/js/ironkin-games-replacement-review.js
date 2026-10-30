(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mode=$('cqReplacementMode'),status=$('cqReplacementStatus'),list=$('cqReplacementList'),message=$('cqReplacementMessage');
if(!mode||!list)return;
let state=null,loading=false;
const endpoint=()=>'/api/ironkin-games/conquest'+(mode.value==='sandbox'?'?sandbox=1':'');
const nameFor=id=>state?.scores?.[id]?.teamName||id;
const originalFor=id=>{for(const region of state?.regions||[]){const task=region.tasks?.find(t=>t.id===id);if(task)return region.name+' · '+(task.title||task.name||id)}return id};
const when=v=>v?new Date(v).toLocaleString():'Unknown';
async function load(){
 if(loading)return;loading=true;message.textContent='Loading requests…';
 try{const response=await fetch(endpoint(),{credentials:'same-origin',cache:'no-store'}),body=await response.json();
 if(!response.ok)throw Error(body.error||'Could not load requests');
 if(!body.staff)throw Error('Staff access required');
 state=body;render();
 }catch(error){state=null;list.replaceChildren();message.textContent=error.message}
 finally{loading=false}
}
function render(){
 const all=state.replacementRequests||[],pending=all.filter(r=>r.status==='pending').length;
 $('cqReplacementCount').textContent=`(${pending} pending)`;
 const filtered=all.filter(r=>status.value==='all'||r.status===status.value).sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0));
 message.textContent=`${filtered.length} requests · ${mode.value==='sandbox'?'Test Mode':'Live'}`;
 list.innerHTML=filtered.map(r=>`<article style="border:1px solid #465167;border-radius:12px;padding:16px;margin:12px 0">
 <div style="display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap"><strong>${esc(nameFor(r.teamId))} · ${esc(r.tier)} replacement</strong><span>${esc(r.status)}</span></div>
 <p><strong>Original:</strong> ${esc(originalFor(r.taskId))}</p>
 <p><strong>Proposed replacement:</strong> ${esc(r.replacement||r.replacementId||'Not specified')}</p>
 <p style="opacity:.8">Power: ${esc(r.via==='desert'?'Desert Mirage copying Dark Resurrection':'Dark Resurrection')} · Requested ${esc(when(r.at))}</p>
 ${r.status==='pending'?`<div style="display:flex;gap:8px;flex-wrap:wrap">
 <button type="button" data-request="${esc(r.id)}" data-decision="approved">Approve</button>
 <button type="button" data-request="${esc(r.id)}" data-decision="rejected">Reject</button></div>`:`<p>Reviewed ${esc(when(r.reviewedAt))}</p>`}
 </article>`).join('')||'<p>No replacement requests match this filter.</p>';
 list.querySelectorAll('[data-request]').forEach(button=>button.onclick=async()=>{
  const decision=button.dataset.decision;
  if(!confirm(`${decision==='approved'?'Approve':'Reject'} this replacement request?${decision==='approved'?' This consumes the power.':''}`))return;
  button.disabled=true;
  try{const response=await fetch(endpoint(),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reviewReplacement',requestId:button.dataset.request,decision})}),body=await response.json();
   if(!response.ok)throw Error(body.error||'Review failed');await load();
  }catch(error){message.textContent=error.message;button.disabled=false}
 });
}
mode.onchange=load;status.onchange=()=>state?render():load();$('cqReplacementRefresh').onclick=load;load();
})();