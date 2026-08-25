const signupStatus=document.getElementById("gamesSignupStatus");
const signupForm=document.getElementById("gamesSignupForm");
const rsnInput=document.getElementById("gamesSignupRsn");
const timezoneInput=document.getElementById("gamesSignupTimezone");
const signupButton=document.getElementById("gamesSignupButton");
const withdrawButton=document.getElementById("gamesWithdrawButton");
const playersRoot=document.getElementById("signupPlayers");
const myStats=document.getElementById("mySignupStats");
const signupCount=document.getElementById("signupCount");
let signupState=null;
let gamesState=null;
let countdownTimer=null;

function earliestGamesStart(){
  const weeks=Array.isArray(gamesState?.weeks)?gamesState.weeks:[];
  const dates=weeks.map(w=>new Date(w.startDate).getTime()).filter(Number.isFinite).sort((a,b)=>a-b);
  return dates.length?dates[0]:null;
}
function setCountdown(rootId,target){
  const root=document.getElementById(rootId);
  if(!root)return;
  const cells=root.querySelectorAll("div strong");
  if(!target||!Number.isFinite(target)){cells.forEach(x=>x.textContent="--");return;}
  let diff=Math.max(0,target-Date.now());
  const days=Math.floor(diff/86400000);diff%=86400000;
  const hrs=Math.floor(diff/3600000);diff%=3600000;
  const mins=Math.floor(diff/60000);diff%=60000;
  const secs=Math.floor(diff/1000);
  [days,hrs,mins,secs].forEach((v,i)=>{if(cells[i])cells[i].textContent=String(v).padStart(2,"0");});
}
function formatCountdownDate(target){
  if(!target||!Number.isFinite(target))return "";
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(target));
}
function updateCountdowns(){
  const configuredBegin=gamesState?.gamesStartsAt?new Date(gamesState.gamesStartsAt).getTime():null;
  const begins=Number.isFinite(configuredBegin)?configuredBegin:earliestGamesStart();
  const configuredClose=signupState?.registrationClosesAt?new Date(signupState.registrationClosesAt).getTime():null;
  const closes=Number.isFinite(configuredClose)?configuredClose:null;
  setCountdown("gamesBeginCountdown",begins);
  setCountdown("signupCloseCountdown",closes);
  const closeDate=document.getElementById("signupCloseDate");
  const beginDate=document.getElementById("gamesBeginDate");
  if(closeDate)closeDate.textContent=formatCountdownDate(closes);
  if(beginDate)beginDate.textContent=formatCountdownDate(begins);
  const closeCaption=document.getElementById("signupCloseCaption");
  const beginCaption=document.getElementById("gamesBeginCaption");
  if(closeCaption){
    const opens=signupState?.registrationOpensAt?new Date(signupState.registrationOpensAt).getTime():null;
    if(signupState?.rosterLocked)closeCaption.textContent="Registration is locked.";
    else if(Number.isFinite(opens)&&Date.now()<opens)closeCaption.textContent=`Registration opens ${new Date(opens).toLocaleString()}.`;
    else if(closes&&Date.now()>=closes)closeCaption.textContent="Registration is closed.";
    else if(signupState?.signupOpen===false)closeCaption.textContent="Registration is currently closed.";
    else closeCaption.textContent="Register before time runs out!";
  }
  if(beginCaption){
    if(begins&&Date.now()>=begins)beginCaption.textContent="The Ironkin Games have begun!";
    else beginCaption.textContent="Get ready. The Games are coming!";
  }
}
function setSignupButtonLabel(label){
  const span=signupButton?.querySelector("span");
  if(span)span.textContent=label;
  else if(signupButton)signupButton.textContent=label;
}
function setStatus(message,type=""){
  signupStatus.textContent=message||"";
  signupStatus.classList.remove("is-error","is-success");
  if(type)signupStatus.classList.add(`is-${type}`);
}

function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function n(v,d=1){const x=Number(v)||0;return x.toLocaleString(undefined,{maximumFractionDigits:d});}
function timezoneOptions(){
  try{
    if(Intl.supportedValuesOf){
      return Intl.supportedValuesOf("timeZone");
    }
  }catch{}
  return [
    "America/St_Johns","America/Halifax","America/Toronto","America/Winnipeg",
    "America/Edmonton","America/Vancouver","America/New_York","America/Chicago",
    "America/Denver","America/Los_Angeles","Europe/London","Europe/Dublin",
    "Europe/Paris","Europe/Berlin","Europe/Amsterdam","Europe/Stockholm",
    "Australia/Perth","Australia/Adelaide","Australia/Brisbane","Australia/Sydney",
    "Pacific/Auckland","UTC"
  ];
}
function timezoneLabel(zone){
  try{
    const now=new Date();
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,timeZoneName:"shortOffset",hour:"2-digit",minute:"2-digit"}).formatToParts(now);
    const offset=(parts.find(p=>p.type==="timeZoneName")||{}).value||"";
    return offset?`${zone.replaceAll("_"," ")} (${offset})`:zone.replaceAll("_"," ");
  }catch{return zone.replaceAll("_"," ");}
}
function populateTimezones(selected=""){
  const zones=timezoneOptions();
  const browserZone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"";}catch{return "";}})();
  const wanted=selected||browserZone||"America/Toronto";
  timezoneInput.innerHTML='<option value="">Select your timezone</option>'+zones.map(zone=>`<option value="${esc(zone)}">${esc(timezoneLabel(zone))}</option>`).join("");
  if(zones.includes(wanted)) timezoneInput.value=wanted;
  else if(wanted){
    const option=document.createElement("option");
    option.value=wanted;option.textContent=timezoneLabel(wanted);
    timezoneInput.appendChild(option);timezoneInput.value=wanted;
  }
}
function render(){
  if(!signupState)return;
  const signups=signupState.signups||[];
  signupCount.textContent=`${signups.length} signed up`;
  const locked=signupState.rosterLocked===true;
  signupButton.disabled=locked||!signupState.signupOpen||!signupState.signedIn;
  rsnInput.disabled=locked||!signupState.signupOpen||!signupState.signedIn;
  timezoneInput.disabled=locked||!signupState.signupOpen||!signupState.signedIn;
  withdrawButton.hidden=!signupState.mySignup;
  withdrawButton.disabled=locked;
  if(signupState.mySignup){
    rsnInput.value=signupState.mySignup.rsn||"";
    populateTimezones(signupState.mySignup.timezone||"");
    setSignupButtonLabel("Update Signup");
    const s=signupState.mySignup;
    myStats.innerHTML=`<div class="games-signup-summary"><strong>${esc(s.rsn)}</strong><span>${esc(s.timezone||"Timezone not set")}</span><span>Registered</span></div>`;
  }else{
    setSignupButtonLabel("Sign Up");
    if(!timezoneInput.options.length||timezoneInput.options.length===1)populateTimezones();
    myStats.innerHTML="";
  }
  setStatus(locked?"Registration is locked and signup changes are frozen.":(!signupState.signupOpen?"Registration is currently closed.":(!signupState.signedIn?"Sign in with Discord to register.":"Registration is open. Enter your Ironman RSN below.")));
  updateCountdowns();
  playersRoot.innerHTML=signups.length?signups.map((s,index)=>`<div class="games-signup-list-row"><span class="games-signup-list-number">${index+1}</span><div><strong>${esc(s.rsn||s.displayName||"Member")}</strong>${s.displayName&&s.rsn&&s.displayName!==s.rsn?`<small>${esc(s.displayName)}</small>`:""}</div></div>`).join(""):`<div class="games-empty-state"><div><strong>No one has signed up yet.</strong><br><span>Be the first to join Ironkin Games!</span></div></div>`;
}
async function load(){
  try{
    const [signupResponse,stateResponse]=await Promise.all([
      fetch(`/api/ironkin-games/signup?t=${Date.now()}`,{cache:"no-store"}),
      fetch(`/api/ironkin-games/state?t=${Date.now()}`,{cache:"no-store"})
    ]);
    signupState=await signupResponse.json();
    gamesState=stateResponse.ok?await stateResponse.json():null;
    if(!signupResponse.ok)throw new Error(signupState.error||"Could not load signup.");
    render();
    if(countdownTimer)clearInterval(countdownTimer);
    countdownTimer=setInterval(updateCountdowns,1000);
  }catch(err){setStatus(err.message,"error");}
}
signupForm.addEventListener("submit",async ev=>{
  ev.preventDefault();
  if(!timezoneInput.value){setStatus("Select your timezone before signing up.","error");return;}
  signupButton.disabled=true;setStatus("Verifying your RSN with Wise Old Man…");
  const r=await fetch("/api/ironkin-games/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rsn:rsnInput.value.trim(),timezone:timezoneInput.value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){setStatus(d.error||"Signup failed.","error");signupButton.disabled=false;return;}
  await load();setStatus("You are signed up for Ironkin Games.","success");
});
withdrawButton.addEventListener("click",async()=>{
  if(!confirm("Withdraw from Ironkin Games signup?"))return;
  const r=await fetch("/api/ironkin-games/signup",{method:"DELETE"});const d=await r.json().catch(()=>({}));
  if(!r.ok){setStatus(d.error||"Could not withdraw.","error");return;}rsnInput.value="";populateTimezones();await load();setStatus("You have been removed from signup.","success");
});
populateTimezones();
load();
