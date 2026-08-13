const signupStatus=document.getElementById("gamesSignupStatus");
const signupForm=document.getElementById("gamesSignupForm");
const rsnInput=document.getElementById("gamesSignupRsn");
const signupButton=document.getElementById("gamesSignupButton");
const withdrawButton=document.getElementById("gamesWithdrawButton");
const teamsRoot=document.getElementById("signupTeams");
const myStats=document.getElementById("mySignupStats");
const signupCount=document.getElementById("signupCount");
let signupState=null;
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function n(v,d=1){const x=Number(v)||0;return x.toLocaleString(undefined,{maximumFractionDigits:d});}
function render(){
  if(!signupState)return;
  signupCount.textContent=`${signupState.signups?.length||0} signed up`;
  const locked=signupState.rosterLocked===true;
  signupButton.disabled=locked||!signupState.signupOpen||!signupState.signedIn;
  rsnInput.disabled=locked||!signupState.signupOpen||!signupState.signedIn;
  withdrawButton.hidden=!signupState.mySignup;
  withdrawButton.disabled=locked;
  if(signupState.mySignup){
    rsnInput.value=signupState.mySignup.rsn||"";
    signupButton.textContent="Update Signup";
    const s=signupState.mySignup;
    myStats.innerHTML=`<div class="games-signup-summary"><strong>${esc(s.rsn)}</strong><span>EHP ${n(s.ehp)}</span><span>EHB ${n(s.ehb)}</span><span>Total ${n(s.totalLevel,0)}</span></div>`;
  }else{
    signupButton.textContent="Sign Up";
    myStats.innerHTML="";
  }
  signupStatus.textContent=locked?"Teams are locked and registration changes are frozen.":(!signupState.signupOpen?"Registration is currently closed.":(!signupState.signedIn?"Sign in with Discord to register.":"Registration is open. Enter your Ironman RSN below."));
  teamsRoot.innerHTML=(signupState.teams||[]).map((team,index)=>{
    const members=team.members||[];
    return `<article class="games-signup-team"><div class="games-signup-team-head"><div><p class="eyebrow">Team ${index+1}</p><h3>${esc(team.name||`Team ${index+1}`)}</h3></div><strong>${members.length}</strong></div><div class="games-signup-roster">${members.length?members.map(m=>`<div class="games-signup-player"><div><strong>${esc(m.rsn||m.name||"Member")}</strong>${m.name&&m.rsn&&m.name!==m.rsn?`<small>${esc(m.name)}</small>`:""}</div><span>${n(m.ehp)} EHP</span><span>${n(m.ehb)} EHB</span><span>${n(m.totalLevel,0)} total</span></div>`).join(""):`<p class="games-muted">No players assigned yet.</p>`}</div></article>`;
  }).join("");
}
async function load(){
  try{const r=await fetch(`/api/ironkin-games/signup?t=${Date.now()}`,{cache:"no-store"});signupState=await r.json();if(!r.ok)throw new Error(signupState.error||"Could not load signup.");render();}
  catch(err){signupStatus.textContent=err.message;}
}
signupForm.addEventListener("submit",async ev=>{
  ev.preventDefault();
  signupButton.disabled=true;signupStatus.textContent="Verifying your RSN with Wise Old Man…";
  const r=await fetch("/api/ironkin-games/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rsn:rsnInput.value.trim()})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){signupStatus.textContent=d.error||"Signup failed.";signupButton.disabled=false;return;}
  await load();signupStatus.textContent="You are signed up. Your WOM stats have been added to the team balancer.";
});
withdrawButton.addEventListener("click",async()=>{
  if(!confirm("Withdraw from Ironkin Games signup?"))return;
  const r=await fetch("/api/ironkin-games/signup",{method:"DELETE"});const d=await r.json().catch(()=>({}));
  if(!r.ok){signupStatus.textContent=d.error||"Could not withdraw.";return;}rsnInput.value="";await load();signupStatus.textContent="You have been removed from signup.";
});
load();
