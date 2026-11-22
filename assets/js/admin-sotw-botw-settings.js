// SOTW/BOTW cycle schedule configuration (planning only; no live job activation).
document.addEventListener("DOMContentLoaded", () => {
  const date = document.getElementById("ikCycleDate");
  const time = document.getElementById("ikCycleTime");
  const first = document.getElementById("ikCycleFirst");
  const duration = document.getElementById("ikCycleDuration");
  const rotation = document.getElementById("ikCycleRotation");
  const preview = document.getElementById("ikCyclePreview");
  const status = document.getElementById("ikCycleStatus");
  const save = document.getElementById("ikCycleSave");
  if (!date || !time || !first || !preview || !save) return;
  function showPreview() {
    if (!date.value) { preview.textContent = "Choose a start date to preview the rotation."; return; }
    const start = new Date(date.value + "T12:00:00Z");
    if (Number.isNaN(start.getTime())) { preview.textContent = "Choose a valid calendar date."; return; }
    preview.textContent = Array.from({length: 4}, (_, i) => {
      const d = new Date(start.getTime() + i * Number(rotation.value) * 86400000).toISOString().slice(0,10);
      const type = i % 2 === 0 ? first.value.toUpperCase() : first.value === "botw" ? "SOTW" : "BOTW";
      return `${d}: ${type} (${duration.value} days)`;
    }).join("  ·  ");
  }
  [date,time,first,duration,rotation].forEach(el => el.addEventListener("change", showPreview));
  fetch("/api/admin/events/cycle", {credentials:"same-origin",cache:"no-store"}).then(r => {if (!r.ok) throw Error("Unable to load cycle settings.");return r.json();}).then(data => {
    date.value = data.config.startDate || ""; time.value = data.config.startTime || "15:00"; first.value = data.config.firstEvent || "botw"; duration.value = data.config.durationDays || 7; rotation.value = data.config.rotationDays || 14; showPreview();
  }).catch(e => {status.textContent = e.message;});
  save.addEventListener("click", async () => {
    save.disabled = true; status.textContent = "Saving…";
    try {
      const r = await fetch("/api/admin/events/cycle", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({startDate:date.value,startTime:time.value,firstEvent:first.value,durationDays:Number(duration.value),rotationDays:Number(rotation.value),enabled:false})});
      const data = await r.json(); if (!r.ok) throw Error(data.error || "Could not save cycle.");
      status.textContent = "Schedule saved. Existing activation state preserved; active-cycle changes are locked.";showPreview();
    } catch(e) {status.textContent = e.message;} finally {save.disabled = false;}
  });
});

// Separate persistent lists, using the existing server-side pools {botw,sotw}.
document.addEventListener("DOMContentLoaded", () => {
  const bosses = document.getElementById("ikBotwPool");
  const skills = document.getElementById("ikSotwPool");
  const elite = document.getElementById("ikElitePool");
  const saveElite = document.getElementById("ikSaveElite");
  const type = document.getElementById("ikPollType");
  const result = document.getElementById("ikPollDraftResult");
  const winner = document.getElementById("ikPollWinnerStatus");
  const prepare = document.getElementById("ikPollPrepare");
  const saveBosses = document.getElementById("ikSaveBotw");
  const saveSkills = document.getElementById("ikSaveSotw");
  let pools = {"botw-standard":[],"botw-elite":[],sotw:[]}, states = {};
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
    pools={"botw-standard":data.pools?.["botw-standard"]||[],"botw-elite":data.pools?.["botw-elite"]||[],sotw:data.pools?.sotw||[]};
    states=data.winnerStatus||{};
    bosses.value=pools["botw-standard"].join("\n");elite.value=pools["botw-elite"].join("\n");skills.value=pools.sotw.join("\n");showWinner();
  }).catch(e=>{result.textContent=e.message;});
  async function save(which,button) {
    button.disabled=true;result.textContent=`Saving ${which.toUpperCase()} options…`;
    try {
      // Preserve the other list's unsaved edits in the UI, but never overwrite
      // its stored version with an out-of-date copy from this page.
      const latest=await request("GET");
      const next={"botw-standard":latest.pools?.["botw-standard"]||[],"botw-elite":latest.pools?.["botw-elite"]||[],sotw:latest.pools?.sotw||[]};
      next[which]=lines(which==="botw-standard"?bosses.value:which==="botw-elite"?elite.value:skills.value);
      const saved=await request("PUT",{action:"save-pools",...next});
      pools=saved.pools;
      if(which==="botw-standard")bosses.value=pools["botw-standard"].join("\n");
      else if(which==="botw-elite")elite.value=pools["botw-elite"].join("\n");
      else {skills.value=pools.sotw.join("\n");populateManualSkills();}
      result.textContent=`${which.toUpperCase()} options saved. The other list was not changed.`;
    }catch(e){result.textContent=e.message;}finally{button.disabled=false;}
  }
  // Select verified-tier archived events by label instead of requiring an invisible internal ID.
  const verifyType=document.getElementById("ikWinnerVerifyType");
  const verifyArchive=document.getElementById("ikWinnerVerifyArchive");
  const verifyHint=document.getElementById("ikWinnerArchiveHint");
  const verifyRefresh=document.getElementById("ikWinnerVerifyRefresh");
  let availableArchives=[];
  function renderEligibleArchives(){
    const category=verifyType.value;
    const tier=category.slice(5);
    const previous=verifyArchive.value;
    const candidates=availableArchives.filter(entry=>{
      if(entry?.type!=="botw" || entry.botwTier!==tier || !entry.id)return false;
      const rows=(Array.isArray(entry.leaderboard)?entry.leaderboard:[])
        .filter(row=>Number(row.gained)>0).sort((a,b)=>Number(b.gained)-Number(a.gained));
      return rows.length>0 && (!rows[1] || Number(rows[0].gained)!==Number(rows[1].gained));
    });
    verifyArchive.replaceChildren(new Option(candidates.length?"Select an archived competition…":"No eligible archived competitions found", ""));
    candidates.sort((a,b)=>new Date(b.endedAt||b.endDate||0)-new Date(a.endedAt||a.endDate||0));
    for(const entry of candidates){
      const leader=[...(entry.leaderboard||[])].sort((a,b)=>Number(b.gained)-Number(a.gained))[0];
      const rawDate=entry.endedAt||entry.endDate||entry.startedAt||entry.startDate;
      const date=rawDate&&!Number.isNaN(Date.parse(rawDate))?new Date(rawDate).toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"}):"Date unknown";
      const label=`${entry.title||entry.name||"BOTW"} · ${date} · Winner: ${leader.name||"Unknown"}`;
      verifyArchive.add(new Option(label,String(entry.id)));
    }
    if(candidates.some(entry=>String(entry.id)===previous))verifyArchive.value=previous;
    verifyHint.textContent=candidates.length
      ?`${candidates.length} eligible ${category==="botw-standard"?"Standard":"Elite"} archive(s). Discord member linkage will be checked when verifying.`
      :`No eligible ${category==="botw-standard"?"Standard":"Elite"} archives. Older shared BOTW archives cannot be assigned automatically.`;
  }
  async function loadEligibleArchives(){
    verifyRefresh.disabled=true;
    verifyHint.textContent="Loading archived competitions…";
    try{
      const response=await fetch("/api/admin/events/archive/list",{credentials:"same-origin",cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"Could not load archived competitions.");
      availableArchives=Array.isArray(data.archive)?data.archive:[];
      renderEligibleArchives();
    }catch(error){availableArchives=[];renderEligibleArchives();verifyHint.textContent=error.message;}
    finally{verifyRefresh.disabled=false;}
  }
  verifyType?.addEventListener("change",renderEligibleArchives);
  verifyRefresh?.addEventListener("click",loadEligibleArchives);
  if(verifyArchive)loadEligibleArchives();
  document.getElementById("ikVerifyBotwWinner")?.addEventListener("click",async()=>{
    const button=document.getElementById("ikVerifyBotwWinner"),status=document.getElementById("ikWinnerVerifyStatus");
    const category=document.getElementById("ikWinnerVerifyType").value,archiveId=document.getElementById("ikWinnerVerifyArchive").value.trim();
    if(!archiveId){status.textContent="Select an eligible archived competition.";return;}
    if(!confirm(`Verify the ${category} winner using archived event ${archiveId}?`))return;
    button.disabled=true;
    try{const data=await request("PUT",{action:"verify-category-winner",type:category,archiveId});states[category]=data.status;showWinner();status.textContent=`Verified ${data.status.rsn} for ${category}.`;}catch(e){status.textContent=e.message;}finally{button.disabled=false;}
  });
  const manualDiscord=document.getElementById("ikManualSotwDiscord");
  const manualSkill1=document.getElementById("ikManualSotwSkill1");
  const manualSkill2=document.getElementById("ikManualSotwSkill2");
  const manualSave=document.getElementById("ikManualSotwSave");
  const manualStatus=document.getElementById("ikManualSotwStatus");
  function populateManualSkills(){
    for(const select of [manualSkill1,manualSkill2]){
      const old=select.value;
      select.replaceChildren(new Option("Choose a skill…",""));
      for(const skill of pools.sotw||[])select.add(new Option(skill,skill));
      if((pools.sotw||[]).includes(old))select.value=old;
    }
  }
  request("GET").then(data=>{pools.sotw=data.pools?.sotw||[];populateManualSkills();
    const saved=data.nominations?.sotw;
    if(saved?.cycleId==="sotw:2026-11-27"){
      manualDiscord.value=String(saved.discordId||data.winners?.sotw||"");
      manualSkill1.value=saved.options?.[0]||"";manualSkill2.value=saved.options?.[1]||"";
    }else if(data.winners?.sotw)manualDiscord.value=String(data.winners.sotw);
  }).catch(e=>{manualStatus.textContent=e.message;});
  manualSave?.addEventListener("click",async()=>{
    const discordId=manualDiscord.value.trim(),options=[manualSkill1.value,manualSkill2.value];
    if(!/^\d{17,20}$/.test(discordId)||options.some(x=>!x)||options[0]===options[1]){
      manualStatus.textContent="Enter a valid Discord ID and choose two different skills.";return;
    }
    if(!confirm(`Set previous SOTW winner to Discord ID ${discordId} and nominate ${options.join(" + ")} for November 27? This will replace unpublished SOTW nominations.`))return;
    manualSave.disabled=true;manualStatus.textContent="Saving and verifying…";
    try{const data=await request("PUT",{action:"set-historical-sotw-winner",discordId,options});
      states.sotw=data.status;showWinner();
      manualStatus.textContent=`Saved for ${data.cycleId}: ${data.status.rsn} (${data.status.discordId}) nominated ${data.options.join(" and ")}. Third option remains random. Refresh Nomination Management to confirm.`;
    }catch(e){manualStatus.textContent=e.message;}finally{manualSave.disabled=false;}
  });
  saveBosses.addEventListener("click",()=>save("botw-standard",saveBosses));
  saveElite.addEventListener("click",()=>save("botw-elite",saveElite));
  saveSkills.addEventListener("click",()=>save("sotw",saveSkills));
  // Explicitly remove an unreserved production draft left over from testing.
  const clearDraft=document.createElement("button");
  clearDraft.type="button";clearDraft.className="btn";
  clearDraft.textContent="Clear Unpublished Draft";
  prepare.insertAdjacentElement("afterend",clearDraft);
  clearDraft.addEventListener("click",async()=>{
    const selected=type.value;
    if(!confirm(`Clear the ${selected.toUpperCase()} production draft? Only allowed before official reservation/publication. This does not delete Discord polls.`))return;
    clearDraft.disabled=true;
    try{const d=await request("PUT",{action:"clear-draft",type:selected});result.textContent=d.cleared?`Cleared unreserved ${selected.toUpperCase()} draft for ${d.cycleId}. The real poll will select fresh eligible options at publication.`:"No draft to clear.";}
    catch(e){result.textContent=e.message;}finally{clearDraft.disabled=false;}
  });
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
  const explanation=document.createElement('p');explanation.textContent='Recalculation fetches the FULL historical WOM standings and uses CURRENT Event Rewards (02) settings. No Embers are credited until you approve a fully matched draft.';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='btn';refresh.textContent='Refresh payout drafts';
  const prepare=document.createElement('button');prepare.type='button';prepare.className='btn';prepare.textContent='Find missing November 13 payouts';prepare.style.marginLeft='.5rem';
  const content=document.createElement('div');content.style.whiteSpace='pre-wrap';
  panel.append(heading,explanation,refresh,prepare,content);anchor.parentElement.append(panel);
  prepare.addEventListener('click',async()=>{
    if(!confirm('Find archived November 13 BOTW events and prepare missing payout drafts? This will NOT credit Embers or replace existing drafts.'))return;
    prepare.disabled=true;
    try{
      const r=await fetch('/api/admin/events/cycle-payouts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare',date:'2026-11-13'})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Could not prepare payouts');
      alert(d.results.map(x=>`${x.id}: ${x.status}${x.reason?' — '+x.reason:''}${x.unresolved?' (requires review)':''}`).join('\n'));
      await load();
    }catch(e){alert(e.message)}finally{prepare.disabled=false}
  });
  const recoverElite=document.createElement('button');recoverElite.type='button';recoverElite.className='btn';recoverElite.textContent='Recover November 13 Elite BOTW';recoverElite.style.marginLeft='.5rem';
  prepare.after(recoverElite);
  recoverElite.addEventListener('click',async()=>{
    if(!confirm('Recover the November 13 Elite BOTW draft from both archived WOM competitions? No Embers will be credited.'))return;
    recoverElite.disabled=true;
    try{
      const r=await fetch('/api/admin/events/cycle-payouts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare',date:'2026-11-13',only:'botw-elite'})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Elite recovery failed');
      alert((d.results||[]).map(x=>`${x.id}: ${x.status}${x.reason?' — '+x.reason:''}${x.participants!==undefined?' · '+x.participants+' participants':''}`).join('\n')||'No Elite archive matched; no draft created.');
      await load();
    }catch(e){alert('Elite recovery: '+e.message);}finally{recoverElite.disabled=false;}
  });
  const load=async()=>{
    content.replaceChildren();
    const response=await fetch('/api/admin/events/cycle-payouts',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load payouts');
    if(data.diagnostics?.length){const note=document.createElement('div');note.style.margin='1rem 0';note.style.whiteSpace='pre-wrap';note.textContent=data.diagnostics.map(x=>`MISSING ${x.type.toUpperCase()} (${x.cycle}): ${x.reason}\nWOM IDs: ${(x.womCompetitionIds||[]).join(', ')||'not recorded'}; WOM: ${x.womStatus||'unknown'}; finalization: ${x.finalizationStatus||'unknown'}; website: ${x.websiteStatus||'unknown'}`).join('\n\n');content.append(note);}
    if(!data.drafts.length){const note=document.createElement('p');note.textContent='No archived cycle payout drafts yet.';content.append(note);return;}
    // Put the recovered November 13 Elite review above unrelated historical payouts.
    // This changes presentation only; no draft or payment record is modified.
    const eliteNov13Id='3db76115-9da3-417d-9fc5-ccc98498095e';
    const standardNov13Id='cycle-botw-standard:2026-11-13-165740';
    const priority=d=>d.id===eliteNov13Id?0:d.id===standardNov13Id?1:2;
    const sortedDrafts=[...data.drafts].sort((a,b)=>priority(a)-priority(b));
    if(!sortedDrafts.some(d=>d.id===eliteNov13Id)){
      const missing=document.createElement('p');
      missing.textContent='November 13 Elite BOTW recovery draft is NOT present in the payout API response. The older jockey 818 draft below is not the recovered Elite event.';
      missing.style.fontWeight='bold';
      content.append(missing);
    }
    for(const draft of sortedDrafts){
      const box=document.createElement('div');box.style.margin='1rem 0';
      const label=document.createElement('strong');
      const title=draft.id===eliteNov13Id?'NOVEMBER 13 ELITE BOTW — RECOVERY REVIEW':draft.id===standardNov13Id?'NOVEMBER 13 STANDARD BOTW — RECOVERY REVIEW':'HISTORICAL EVENT — '+String(draft.type||'event').toUpperCase();
      label.textContent=`${title} · ${draft.id} · ${draft.status}`;
      const lines=document.createElement('pre');lines.style.whiteSpace='pre-wrap';
      // Keep the complete reportRows in storage for verification, but only display
      // players eligible for an Ember reward (including unmatched eligible players).
      const fullRows=Array.isArray(draft.reportRows)&&draft.reportRows.length?draft.reportRows:(draft.payouts||[]);
      const eligibleRows=fullRows.filter(p=>Number(p.embers)>0);
      lines.textContent=eligibleRows.map(p=>`${p.rank||'?'} · ${p.rsn} · ${p.gained??'?'} gained · ${p.embers} Embers (${p.source||'unknown'}) · ${p.status||'pending'}${p.reason?' · '+p.reason:''}`).join('\n')||'No eligible recipients recorded. Recalculate unpaid rewards.';
      if(draft.reportRows?.length){const summary=document.createElement('div');summary.textContent=`Eligible for Embers: ${eligibleRows.length} · Full WOM participants verified: ${draft.womParticipantCount||draft.reportRows.length} (ineligible players hidden)`;box.append(label,summary);} 
      if(draft.unresolved?.length)lines.textContent+='\nREQUIRES REVIEW:\n'+draft.unresolved.map(u=>`${u.rsn||''}: ${u.reason}`).join('\n');
      if(!label.isConnected)box.append(label);box.append(lines);
      if(draft.id===eliteNov13Id && draft.status==='pending_review') {
        const unmatched=eligibleRows.filter(row=>row.status==='unmatched');
        if(unmatched.length){
          const aliasTitle=document.createElement('p');
          aliasTitle.textContent='Historical RSN matching: confirm the member’s Discord ID (17–20 digits), save the mapping, then recalculate. Do not guess identities.';
          box.append(aliasTitle);
          for(const player of unmatched){
            const line=document.createElement('div');line.style.margin='.35rem 0';
            const name=document.createElement('span');name.textContent=player.rsn+' → ';
            const input=document.createElement('input');input.placeholder='Confirmed Discord user ID';input.setAttribute('aria-label','Discord ID for '+player.rsn);
            input.style.maxWidth='210px';
            const save=document.createElement('button');save.type='button';save.className='btn';save.textContent='Save historical name';
            save.addEventListener('click',async()=>{
              if(!/^\d{17,20}$/.test(input.value.trim())){alert('Enter a valid Discord user ID');return;}
              if(!confirm('Confirm that '+player.rsn+' is the same person as Discord user '+input.value.trim()+'? This is an audit-sensitive mapping, not an automatic guess.'))return;
              save.disabled=true;
              try{const r=await fetch('/api/admin/events/cycle-payouts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'set_historical_alias',id:draft.id,rsn:player.rsn,discordId:input.value.trim()})});const d=await r.json();if(!r.ok)throw Error(d.error||'Mapping failed');
                const recalcResponse=await fetch('/api/admin/events/cycle-payouts',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'recalculate',id:draft.id})});
                const recalcData=await recalcResponse.json().catch(()=>({}));
                if(!recalcResponse.ok)throw Error('Alias saved, but recalculation failed: '+(recalcData.error||'Unknown error')+'. The draft has not been updated.');
                const updated=recalcData.draft;
                const mappedRow=updated?.reportRows?.find(row=>String(row.rsn||'').trim().toLowerCase().replace(/[ _-]+/g,' ')===String(player.rsn).trim().toLowerCase().replace(/[ _-]+/g,' '));
                if(!mappedRow||mappedRow.status==='unmatched'||String(mappedRow.discordId)!==input.value.trim())throw Error('Alias saved, but the recalculated draft did not match this Discord ID. Do not approve.');
                await load();
                alert('Historical name matched and payout draft recalculated. '+player.rsn+' is now linked for this event. Review the updated rewards before approval.');}
              catch(e){alert(e.message);}finally{save.disabled=false;}
            });line.append(name,input,save);box.append(line);
          }
        }
      }
      const provenance=document.createElement('div');provenance.textContent=draft.womVerified?`Verified WOM participants: ${draft.womParticipantCount} · Competition IDs: ${(draft.womCompetitionIds||[]).join(', ')} · Components: ${(draft.womComponentCounts||[]).join(' + ')}`:'WARNING: Full WOM participant list not verified. Do not approve or trust this draft as complete.';provenance.style.margin='.4rem 0';box.append(provenance);
      const report=document.createElement('button');report.type='button';report.className='btn';report.textContent='Verify payments + export CSV';report.style.marginRight='.5rem';
      const reportStatus=document.createElement('div');reportStatus.style.margin='.5rem 0';
      report.addEventListener('click',async()=>{
        report.disabled=true;reportStatus.textContent='Checking Supabase payout ledger and Ember transactions…';
        try{
          const response=await fetch('/api/admin/events/cycle-payout-report?id='+encodeURIComponent(draft.id),{credentials:'same-origin',cache:'no-store'});
          const data=await response.json();if(!response.ok)throw Error(data.error||'Verification failed');
          const columns=['Event','Player','Discord ID','Rank','KC or XP gained','Reward type','Expected Embers','Paid Embers','Verified status','Paid at','Transaction ID','Reason'];
          const rows=data.rows.map(r=>[draft.id,r.rsn,r.discordId,r.rank,r.gained,r.source,r.expectedEmbers,r.paidEmbers,r.status,r.paidAt,r.transactionId,r.reason]);
          const csv=[columns,...rows].map(row=>row.map(v=>{let value=String(v??'');if(/^[=+@\-]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"'}).join(',')).join('\r\n');
          const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
          const a=document.createElement('a');a.href=url;a.download='ironkin-verified-payments-'+String(draft.id).replace(/[^a-z0-9_-]/gi,'_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          reportStatus.textContent=`Verified: ${data.summary.paid} paid (${data.summary.embersPaid} Embers), ${data.summary.unpaid} unpaid, ${data.summary.requiresReconciliation} requiring reconciliation. Checked ${data.verifiedAt}.`;
        }catch(error){reportStatus.textContent=error.message;}finally{report.disabled=false;}
      });box.append(report,reportStatus);
      if(draft.status==='pending_review'||draft.status==='rejected'){
        const recalc=document.createElement('button');recalc.type='button';recalc.className='btn';recalc.textContent='Recalculate unpaid rewards';recalc.style.marginRight='.5rem';
        recalc.addEventListener('click',async()=>{
          if(!confirm(`Recalculate ${draft.id} using CURRENT Rewards (02) settings and the COMPLETE live WOM competition standings? No Embers will be credited.`))return;
          recalc.disabled=true;
          try{const r=await fetch('/api/admin/events/cycle-payouts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'recalculate',id:draft.id})});const d=await r.json();if(!r.ok)throw Error(d.error||'Recalculation failed');alert(`Recovered ${d.participants} WOM participants (${(d.componentCounts||[]).join(' + ')} per competition). Using current rewards ${d.sourceEventId}: ${d.recipients} payable linked members; ${d.unresolved} unresolved issues. Saved report: ${d.draft?.reportRows?.length||0} rows.`);await load();}catch(e){alert(e.message);recalc.disabled=false;}
        });box.append(recalc);
      }
      if(draft.status==='pending_review'){
        for(const action of ['approve','reject']){
          const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=action==='approve'?'Approve Ember payouts':'Reject payouts';button.style.marginRight='.5rem';
          button.disabled=action==='approve'&&(draft.id==='3db76115-9da3-417d-9fc5-ccc98498095e'||!draft.womVerified||draft.womParticipantCount<2||draft.reportRows?.length!==draft.womParticipantCount||!draft.payouts?.length||!!draft.unresolved?.length);
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

// Isolated BOTW Discord poll test: deletion is confirmed by the Fly.io bot.
document.addEventListener("DOMContentLoaded",()=>{
 const host=document.getElementById("ikBotwPollTest");if(!host)return;
 const start=host.querySelector("[data-start]"),close=host.querySelector("[data-close]"),del=host.querySelector("[data-delete]"),refresh=host.querySelector("[data-refresh]"),out=host.querySelector("[data-status]");
 const api=async(action)=>{const r=await fetch("/api/admin/events/cycle-poll-test",{method:action?"POST":"GET",credentials:"same-origin",cache:"no-store",headers:action?{"Content-Type":"application/json"}:{},body:action?JSON.stringify({action}):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||"Test request failed");return d.test};
 const render=t=>{
  const result=t?.status==="closed"?`\nVote totals:\n${(t.options||[]).map((o,i)=>`${o.label}: ${t.counts?.[i]??0}`).join("\n")}\nResult: ${t.result==="winner"?`Winner - ${t.winnerLabel}`:t.result==="tie"?"Tie - council decision required":"No valid votes"}`:"";
  out.textContent=t?`Status: ${t.status}\nOptions: ${(t.options||[]).map(x=>x.label).join(" / ")}\nDiscord message: ${t.messageId||"Not confirmed"}${result}\n${t.status==="delete_requested"?"Waiting for bot to confirm Discord deletion. Refresh shortly.":t.status==="close_requested"?"Waiting for bot to count reactions. Refresh shortly.":""}`:"No test created.";
  start.disabled=!!t&&!(["deleted","cancelled"].includes(t.status));
  close.disabled=!t||t.status!=="published";
  del.disabled=!t||!["pending","published","close_requested","closed","delete_requested"].includes(t.status);
 };
 const reload=async()=>render(await api());refresh.onclick=()=>reload().catch(e=>out.textContent=e.message);
 start.onclick=async()=>{if(!confirm("Post a REAL, clearly marked BOTW TEST poll to Discord? This will not affect the November 13 BOTW or WOM."))return;start.disabled=true;try{render(await api("start"))}catch(e){out.textContent=e.message;await reload().catch(()=>{})}};
 close.onclick=async()=>{if(!confirm("Close this TEST poll now and count Discord reactions? This will not affect the live BOTW."))return;close.disabled=true;try{render(await api("close"))}catch(e){out.textContent=e.message;await reload().catch(()=>{})}};
 del.onclick=async()=>{if(!confirm("Delete the TEST poll message from Discord? The bot must confirm deletion before the test can be repeated."))return;del.disabled=true;try{render(await api("delete"))}catch(e){out.textContent=e.message;await reload().catch(()=>{})}};
 reload().catch(e=>out.textContent=e.message);
});

// Batch 4 staff controls: a runtime pause never bypasses Cloudflare's safety gates.
document.addEventListener("DOMContentLoaded", () => {
  const ids={polling:"ikControlPolling",womCreation:"ikControlWomCreation",finalization:"ikControlFinalization",resultsAnnouncements:"ikControlResultsAnnouncements",nominationReminders:"ikControlNominationReminders"};
  const save=document.getElementById("ikControlsSave"), status=document.getElementById("ikControlsStatus"), gates=document.getElementById("ikControlGates");
  const health=document.getElementById("ikHealthSummary"), table=document.querySelector("#ikHealthTable tbody"), refresh=document.getElementById("ikHealthRefresh");
  if(!save || !table)return;
  const req=async (url,method="GET",body)=>{
    const r=await fetch(url,{method,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json();if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d;
  };
  const loadControls=async()=>{
    const d=await req("/api/admin/events/cycle");
    Object.entries(ids).forEach(([key,id])=>{document.getElementById(id).checked=d.controls?.[key]!==false;});
    gates.textContent=`Cloudflare safety gates: WOM creation ${d.gates?.womCreation?"enabled":"disabled"}; finalization ${d.gates?.finalization?"enabled":"disabled"}. Both a gate and the matching checkbox must be enabled for the action to run.`;
  };
  save.addEventListener("click",async()=>{
    const controls=Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,document.getElementById(id).checked]));
    if((controls.womCreation||controls.finalization) && !confirm("Confirm these production automation controls. External actions may occur on the next bot check if Cloudflare safety flags are enabled."))return;
    save.disabled=true;status.textContent="Saving controls…";
    try{await req("/api/admin/events/cycle","PUT",{action:"save-controls",controls});status.textContent="Controls saved.";await loadControls();}
    catch(e){status.textContent=e.message;}finally{save.disabled=false;}
  });
  const loadHealth=async()=>{
    refresh.disabled=true;health.textContent="Loading current cycle records…";
    try{
      const d=await req("/api/admin/events/cycle-recovery");
      const cycles=Array.isArray(d.cycles)?d.cycles:[];
      table.replaceChildren();
      for(const c of cycles){
        const tr=document.createElement("tr");
        const fields=[c.id||c.cycleId||"—",c.pollClosed?"Closed":c.pollPublished?"Published":"Not published",c.womStatus||"—",c.websiteStatus||"—",c.finalizationStatus||"—"];
        for(const value of fields){const td=document.createElement("td");td.textContent=String(value);td.style.padding="8px";tr.append(td);}table.append(tr);
      }
      health.textContent=`${cycles.length} recent cycles loaded. Open Cycle Recovery below for details and staff reconciliation.`;
    }catch(e){health.textContent=e.message;}finally{refresh.disabled=false;}
  };
  refresh.addEventListener("click",loadHealth);
  loadControls().catch(e=>{status.textContent=e.message;});loadHealth();
});
