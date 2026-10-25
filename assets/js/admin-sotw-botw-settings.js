// SOTW/BOTW cycle schedule configuration (planning only; no live job activation).
document.addEventListener("DOMContentLoaded", () => {
  const date = document.getElementById("ikCycleDate");
  const time = document.getElementById("ikCycleTime");
  const first = document.getElementById("ikCycleFirst");
  const preview = document.getElementById("ikCyclePreview");
  const status = document.getElementById("ikCycleStatus");
  const save = document.getElementById("ikCycleSave");
  if (!date || !time || !first || !preview || !save) return;
  function showPreview() {
    if (!date.value) { preview.textContent = "Choose a start date to preview the rotation."; return; }
    const start = new Date(date.value + "T12:00:00Z");
    if (Number.isNaN(start.getTime())) { preview.textContent = "Choose a valid calendar date."; return; }
    preview.textContent = Array.from({length: 4}, (_, i) => {
      const d = new Date(start.getTime() + i * 7 * 86400000).toISOString().slice(0,10);
      const type = i % 2 ? "Break" : i === 0 ? first.value.toUpperCase() : first.value === "botw" ? "SOTW" : "BOTW";
      return `${d}: ${type}`;
    }).join("  ·  ");
  }
  [date,time,first].forEach(el => el.addEventListener("change", showPreview));
  fetch("/api/admin/events/cycle", {credentials:"same-origin",cache:"no-store"}).then(r => {if (!r.ok) throw Error("Unable to load cycle settings.");return r.json();}).then(data => {
    date.value = data.config.startDate || ""; time.value = data.config.startTime || "15:00"; first.value = data.config.firstEvent || "botw"; showPreview();
  }).catch(e => {status.textContent = e.message;});
  save.addEventListener("click", async () => {
    save.disabled = true; status.textContent = "Saving…";
    try {
      const r = await fetch("/api/admin/events/cycle", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({startDate:date.value,startTime:time.value,firstEvent:first.value,enabled:false})});
      const data = await r.json(); if (!r.ok) throw Error(data.error || "Could not save cycle.");
      status.textContent = "Schedule saved (inactive). No events or polls have been created.";showPreview();
    } catch(e) {status.textContent = e.message;} finally {save.disabled = false;}
  });
});

// Separate persistent lists, using the existing server-side pools {botw,sotw}.
document.addEventListener("DOMContentLoaded", () => {
  const bosses = document.getElementById("ikBotwPool");
  const skills = document.getElementById("ikSotwPool");
  const type = document.getElementById("ikPollType");
  const result = document.getElementById("ikPollDraftResult");
  const winner = document.getElementById("ikPollWinnerStatus");
  const prepare = document.getElementById("ikPollPrepare");
  const saveBosses = document.getElementById("ikSaveBotw");
  const saveSkills = document.getElementById("ikSaveSotw");
  let pools = {botw:[],sotw:[]}, states = {};
  const lines = v => v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const showWinner = () => {
    const state=states[type.value];
    winner.textContent=state?.state === "resolved" ? `Automatically verified: ${state.rsn || "Winner"}` : (state?.reason || "Awaiting finalized event results.");
  };
  type.addEventListener("change",showWinner);
  const request = async (method,body) => {
    const response=await fetch("/api/admin/events/cycle",{method,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Request failed.");return data;
  };
  request("GET").then(data=>{
    pools={botw:data.pools?.botw||[],sotw:data.pools?.sotw||[]};
    states=data.winnerStatus||{};
    bosses.value=pools.botw.join("\n");skills.value=pools.sotw.join("\n");showWinner();
  }).catch(e=>{result.textContent=e.message;});
  async function save(which,button) {
    button.disabled=true;result.textContent=`Saving ${which.toUpperCase()} options…`;
    try {
      // Preserve the other list's unsaved edits in the UI, but never overwrite
      // its stored version with an out-of-date copy from this page.
      const latest=await request("GET");
      const next={botw:latest.pools?.botw||[],sotw:latest.pools?.sotw||[]};
      next[which]=lines(which==="botw"?bosses.value:skills.value);
      const saved=await request("PUT",{action:"save-pools",...next});
      pools=saved.pools;
      if(which==="botw")bosses.value=pools.botw.join("\n");
      else skills.value=pools.sotw.join("\n");
      result.textContent=`${which.toUpperCase()} options saved. The other list was not changed.`;
    }catch(e){result.textContent=e.message;}finally{button.disabled=false;}
  }
  saveBosses.addEventListener("click",()=>save("botw",saveBosses));
  saveSkills.addEventListener("click",()=>save("sotw",saveSkills));
  prepare.addEventListener("click",async()=>{
    prepare.disabled=true;result.textContent="Preparing draft…";
    try {
      const data=await request("PUT",{action:"prepare-draft",type:type.value});
      result.textContent=`Draft ready (not posted): ${data.draft.options.map(x=>x.label).join(" | ")}${data.draft.rotationResetSuggested?" · Random pool reset required":""}`;
    }catch(e){result.textContent=e.message;}finally{prepare.disabled=false;}
  });
});

// Separate live-test namespace: never changes the official schedule or active event registry.
document.addEventListener("DOMContentLoaded", () => {
  const start=document.getElementById("ikLiveTestStart"), refresh=document.getElementById("ikLiveTestRefresh"), reset=document.getElementById("ikLiveTestReset"), status=document.getElementById("ikLiveTestStatus");
  if(!start||!refresh||!status)return;
  const update=async()=>{
    const r=await fetch("/api/admin/events/cycle-live-test",{credentials:"same-origin",cache:"no-store"});
    const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load test status");
    const t=d.test;status.textContent=t?`Status: ${t.status}\nPoll closes: ${t.pollClosesAt}\nWOM starts: ${t.womStartsAt}\nWOM ends: ${t.womEndsAt}\nChoices: ${(t.options||[]).map(x=>x.label).join(" / ")}\nVotes: ${JSON.stringify(t.counts||[])}\nWOM: ${t.womUrl||t.womStatus||"Not created"}\n${t.error||""}`:"No live test started.";
    reset.disabled=!t||!["needs_review","failed","cancelled","completed"].includes(t.status)||!!t.womCompetitionId||["created","attempted","needs_review"].includes(t.womStatus);
    start.disabled=!!t&&!["cancelled","completed","failed"].includes(t.status);
  };
  refresh.addEventListener("click",()=>update().catch(e=>status.textContent=e.message));
  reset.addEventListener("click",async()=>{
    if(!confirm("Reset this finished/failed live test so a new poll can start? The old Discord message will remain; no WOM competition or official event will be deleted."))return;
    reset.disabled=true;
    try{
      const r=await fetch("/api/admin/events/cycle-live-test",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reset"})});
      const d=await r.json();if(!r.ok)throw Error(d.error||"Reset failed");await update();
    }catch(e){status.textContent=e.message;await update().catch(()=>{});}
  });

  start.addEventListener("click",async()=>{
    if(!confirm("Post a PUBLIC 3-minute SOTW test poll and attempt to create a REAL 15-minute WOM competition in group 12095? No rewards or nominations will be issued."))return;
    start.disabled=true;
    try{
      const r=await fetch("/api/admin/events/cycle-live-test",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"start"})});
      const d=await r.json();if(!r.ok)throw Error(d.error||"Test could not start");await update();
    }catch(e){status.textContent=e.message;start.disabled=false;}
  });
  update().catch(e=>status.textContent=e.message);
});

// Review archived SOTW/BOTW Ember payouts. Credits are performed by the bot
// only after a staff member approves a fully resolved draft.
document.addEventListener('DOMContentLoaded',()=>{
  const anchor=document.getElementById('ikLiveTestStatus');
  if(!anchor)return;
  const panel=document.createElement('section');
  panel.className='admin-card';
  panel.style.marginTop='1.5rem';
  const heading=document.createElement('h3');heading.textContent='SOTW/BOTW Ember payout approval';
  const explanation=document.createElement('p');explanation.textContent='Payouts are calculated from archived WOM results and saved Event Rewards (02). No Embers are credited until you approve a fully matched draft.';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='btn';refresh.textContent='Refresh payout drafts';
  const content=document.createElement('div');content.style.whiteSpace='pre-wrap';
  panel.append(heading,explanation,refresh,content);anchor.parentElement.append(panel);
  const load=async()=>{
    content.replaceChildren();
    const response=await fetch('/api/admin/events/cycle-payouts',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load payouts');
    if(!data.drafts.length){content.textContent='No archived cycle payout drafts yet.';return;}
    for(const draft of data.drafts){
      const box=document.createElement('div');box.style.margin='1rem 0';
      const label=document.createElement('strong');label.textContent=`${draft.type.toUpperCase()} · ${draft.id} · ${draft.status}`;
      const lines=document.createElement('pre');lines.style.whiteSpace='pre-wrap';
      lines.textContent=(draft.payouts||[]).map(p=>`${p.rsn} — ${p.embers} Embers (${p.source}, rank ${p.rank}) · ${p.status||'pending'}`).join('\n')||'No payable linked members.';
      if(draft.unresolved?.length)lines.textContent+='\nREQUIRES REVIEW:\n'+draft.unresolved.map(u=>`${u.rsn||''}: ${u.reason}`).join('\n');
      box.append(label,lines);
      if(draft.status==='pending_review'){
        for(const action of ['approve','reject']){
          const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=action==='approve'?'Approve Ember payouts':'Reject payouts';button.style.marginRight='.5rem';
          button.disabled=action==='approve'&&(!draft.payouts?.length||!!draft.unresolved?.length);
          button.addEventListener('click',async()=>{
            if(!confirm(`${action.toUpperCase()} payouts for ${draft.id}? Approval authorizes the bot to credit Embers.`))return;
            button.disabled=true;
            try{const r=await fetch('/api/admin/events/cycle-payouts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:draft.id})});const d=await r.json();if(!r.ok)throw Error(d.error||'Review failed');await load();}
            catch(error){alert(error.message);button.disabled=false;}
          });box.append(button);
        }
      }
      content.append(box);
    }
  };
  refresh.addEventListener('click',()=>load().catch(e=>content.textContent=e.message));
  load().catch(e=>content.textContent=e.message);
});
