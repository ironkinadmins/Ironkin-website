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
  const start=document.getElementById("ikLiveTestStart"), refresh=document.getElementById("ikLiveTestRefresh"), status=document.getElementById("ikLiveTestStatus");
  if(!start||!refresh||!status)return;
  const update=async()=>{
    const r=await fetch("/api/admin/events/cycle-live-test",{credentials:"same-origin",cache:"no-store"});
    const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load test status");
    const t=d.test;status.textContent=t?`Status: ${t.status}\nPoll closes: ${t.pollClosesAt}\nWOM starts: ${t.womStartsAt}\nWOM ends: ${t.womEndsAt}\nChoices: ${(t.options||[]).map(x=>x.label).join(" / ")}\nVotes: ${JSON.stringify(t.counts||[])}\nWOM: ${t.womUrl||t.womStatus||"Not created"}\n${t.error||""}`:"No live test started.";
    start.disabled=!!t&&!["cancelled","completed","failed"].includes(t.status);
  };
  refresh.addEventListener("click",()=>update().catch(e=>status.textContent=e.message));
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
