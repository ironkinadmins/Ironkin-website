
// Ember history is read-only and always scoped by the authenticated Discord session.
const ikWalletState={filter:"all",cursor:null,loading:false,loaded:false,rows:[]};
function ikWalletLabel(kind){return String(kind||"transaction").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function ikRenderWallet(){
 const mount=document.getElementById("ikWalletTransactions");if(!mount)return;
 mount.replaceChildren();
 if(!ikWalletState.rows.length){const p=document.createElement("p");p.className="admin-muted";p.textContent="No Ember transactions found for this filter.";mount.append(p);return;}
 for(const tx of ikWalletState.rows){
  const row=document.createElement("div");row.className="ik-wallet-tx";
  const detail=document.createElement("div");
  const title=document.createElement("strong");title.textContent=tx.reason||ikWalletLabel(tx.kind);detail.append(title);
  const meta=document.createElement("small");const date=tx.createdAt?new Date(tx.createdAt):null;
  meta.textContent=[ikWalletLabel(tx.kind),date&&!Number.isNaN(date.getTime())?date.toLocaleString():"",`Balance after: ${Number(tx.balanceAfter).toLocaleString()}`].filter(Boolean).join(" · ");detail.append(meta);
  const amount=document.createElement("span");amount.className="ik-wallet-tx-amount "+(tx.delta>=0?"positive":"negative");amount.textContent=(tx.delta>0?"+":"")+Number(tx.delta).toLocaleString();
  row.append(detail,amount);mount.append(row);
 }
}
async function ikLoadWallet({more=false}={}){
 if(ikWalletState.loading)return;
 const mount=document.getElementById("ikWalletTransactions"),moreButton=document.getElementById("ikWalletMore");if(!mount)return;
 ikWalletState.loading=true;if(moreButton)moreButton.disabled=true;
 if(!more)mount.textContent="Loading Ember transactions…";
 try{
  const query=new URLSearchParams({type:ikWalletState.filter});
  if(more&&ikWalletState.cursor)query.set("before",String(ikWalletState.cursor));
  const response=await fetch("/api/embers/history?"+query,{cache:"no-store"});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"Unable to load Ember history.");
  ikWalletState.rows=more?[...ikWalletState.rows,...data.transactions]:data.transactions;
  ikWalletState.cursor=data.nextCursor;ikWalletState.loaded=true;
  const balance=document.getElementById("ikWalletBalance");if(balance&&data.balance!==null&&data.balance!==undefined)balance.textContent=Number(data.balance).toLocaleString()+" Embers";
  if(moreButton)moreButton.hidden=!data.hasMore;
  ikRenderWallet();
 }catch(error){if(!more)ikWalletState.loaded=false;mount.textContent=error.message||"Could not load Ember history.";}
 finally{ikWalletState.loading=false;if(moreButton)moreButton.disabled=false;}
}
function ikInitWallet(){
 document.querySelectorAll("[data-wallet-filter]").forEach(button=>button.addEventListener("click",()=>{
  ikWalletState.filter=button.dataset.walletFilter;ikWalletState.cursor=null;ikWalletState.rows=[];
  document.querySelectorAll("[data-wallet-filter]").forEach(b=>b.classList.toggle("is-active",b===button));ikLoadWallet();
 }));
 document.getElementById("ikWalletMore")?.addEventListener("click",()=>ikLoadWallet({more:true}));
 document.getElementById("ikWalletRefresh")?.addEventListener("click",()=>{ikWalletState.cursor=null;ikLoadWallet();});
}


let ikAchievementFilter='all';
let ikAchievementCatalog=[];
let ikClanAchievementCatalog=[];
let ikProfileRecognitionCatalog=[];
let ikAchievementRequest=0;
let ikAchievementFrame=null;
function ikRenderAchievements(){
 const mount=document.getElementById('profileAchievementsList');
 const count=document.getElementById('profileAchievementCount');
 const featured=document.getElementById('profileFeaturedAchievements');
 if(!mount)return;
 const unlocked=ikAchievementCatalog.filter(a=>a.unlocked);
 if(count)count.textContent=`${unlocked.length} / ${ikAchievementCatalog.length} unlocked`;
 if(featured)featured.innerHTML=unlocked.slice(0,3).map(a=>`<span>✦ ${profileEscapeHtml(a.name)}</span>`).join('');
 ikRenderHeroAchievements();
 document.querySelectorAll('[data-achievement-filter]').forEach(button=>{
  const selected=button.dataset.achievementFilter===ikAchievementFilter;
  button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));
 });
 const shown=ikAchievementCatalog.filter(a=>ikAchievementFilter==='all'||(ikAchievementFilter==='unlocked'?a.unlocked:!a.unlocked));
 mount.innerHTML=shown.length?shown.map(a=>`<article class="ik-profile-achievement ${a.unlocked?'is-unlocked':'is-locked'}"><div class="ik-achievement-meta"><span>${a.unlocked?'✓ Unlocked':'◇ Locked'}</span><span>${profileEscapeHtml(a.rarity)}</span></div><h3>${profileEscapeHtml(a.name)}</h3><p>${profileEscapeHtml(a.description)}</p></article>`).join(''):'<p class="admin-muted">No achievements in this category.</p>';
}
function ikRequestAchievements(profile){
 const mount=document.getElementById('profileAchievementsList');
 if(!mount)return;
 ikClanAchievementCatalog=[];
 ikAchievementCatalog=[...ikProfileRecognitionCatalog];
 ikRenderAchievements();
 mount.insertAdjacentHTML('beforeend','<p class="admin-muted" id="ikClanBadgeLoading">Loading event achievements…</p>');
 const requestId=++ikAchievementRequest;
 if(ikAchievementFrame)ikAchievementFrame.remove();
 ikAchievementFrame=document.createElement('iframe');
 ikAchievementFrame.src='/records.html';ikAchievementFrame.title='Clan achievement records';
 ikAchievementFrame.style.display='none';ikAchievementFrame.setAttribute('aria-hidden','true');
 const identities=[profile.rsn,profile.displayName,profile.username,...(profile.previousRsns||[])].filter(Boolean);
 ikAchievementFrame.addEventListener('load',()=>{
   ikAchievementFrame.contentWindow?.postMessage({type:'ironkin:request-achievements',requestId,identities},location.origin);
 });
 document.body.append(ikAchievementFrame);
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==ikAchievementFrame?.contentWindow)return;
 if(event.data?.type!=='ironkin:profile-achievements'||event.data.requestId!==ikAchievementRequest)return;
 ikClanAchievementCatalog=Array.isArray(event.data.catalog)?event.data.catalog:[];
 ikAchievementCatalog=[...ikProfileRecognitionCatalog,...ikClanAchievementCatalog];
 ikRenderAchievements();
 ikAchievementFrame?.remove();ikAchievementFrame=null;
});

let currentProfile = null;

function profileFormatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function profileEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function profileFormatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", {
  month: "long",
  year: "numeric"
})
}

function getPlacementIcon(place) {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `#${place}`;
}


function profileDiscordBadgeIcon(url, emoji, fallback) {
  if (url) return `<img class="profile-discord-role-icon" src="${profileEscapeHtml(url)}" alt="" loading="lazy" onerror="this.remove();" />`;
  if (emoji) return `<span class="profile-discord-role-emoji" aria-hidden="true">${profileEscapeHtml(emoji)}</span>`;
  return `<i>${fallback}</i>`;
}

function buildProfileBadges(profile) {
  const badges = [];
  const displayRank = String(profile.rank || profile.clanRank || "");
  const clanRank = String(profile.clanRank || "");
  const wins = profile.placements?.wins || {};
  const botwWins = Number(wins.botw || 0);
  const sotwWins = Number(wins.sotw || 0);
  const bingoWins = Number(wins.bingo || 0);
  const topThree = Number(profile.placements?.topThreeFinishes || 0);
  const embers = Number(profile.embers?.balance || 0);

  if (displayRank && displayRank !== "Member") {
    const isFounder = displayRank === "Founder";
    badges.push({
      iconHtml: profileDiscordBadgeIcon(profile.displayRankIconUrl || profile.rankIconUrl, profile.displayRankUnicodeEmoji || profile.rankUnicodeEmoji, isFounder ? "♛" : "◇"),
      label: displayRank,
      tone: isFounder ? "founder" : "rank",
      tooltip: isFounder ? "Founder — Created Ironkin." : `Rank: ${displayRank}`
    });
  }
  if (botwWins > 0) badges.push({
    icon: "⚔",
    label: `${botwWins}× BOTW Winner`,
    tone: "event",
    tooltip: `Boss of the Week Winner — Won BOTW ${botwWins} ${botwWins === 1 ? "time" : "times"}.`
  });
  if (sotwWins > 0) badges.push({
    icon: "✦",
    label: `${sotwWins}× SOTW Winner`,
    tone: "event",
    tooltip: `Skill of the Week Winner — Won SOTW ${sotwWins} ${sotwWins === 1 ? "time" : "times"}.`
  });
  if (bingoWins > 0) badges.push({
    icon: "▦",
    label: `${bingoWins}× Bingo Winner`,
    tone: "event",
    tooltip: `Battleship Bingo Champion — Member of a winning Bingo team ${bingoWins} ${bingoWins === 1 ? "time" : "times"}.`
  });
  if (topThree >= 5) badges.push({
    icon: "🏆",
    label: "Event Champion",
    tone: "champion",
    tooltip: `Event Champion — Achieved ${topThree} top-three finishes in clan events.`
  });
  if (embers >= 1000) badges.push({
    icon: "🔥",
    label: "Ember Elite",
    tone: "ember",
    tooltip: "Ember Elite — Reached at least 1,000 Embers."
  });
  else if (embers >= 500) badges.push({
    icon: "🔥",
    label: "Ember Collector",
    tone: "ember",
    tooltip: "Ember Collector — Reached at least 500 Embers."
  });

  return badges;
}


function ikBuildRecognitionCatalog(profile) {
 const wins=profile.placements?.wins||{};
 const botw=Number(wins.botw||0),sotw=Number(wins.sotw||0),bingo=Number(wins.bingo||0);
 const podiums=Number(profile.placements?.topThreeFinishes||0);
 const embers=Number(profile.embers?.balance||0);
 const rank=String(profile.rank||profile.clanRank||'');
 const recognition=[];
 if(rank && rank!=='Member') recognition.push({
   name:`${rank} Rank`, rarity:'Rank', unlocked:true,
   description:`Current clan rank: ${rank}.`,category:'recognition'
 });
 recognition.push(
  {name:'Ember Collector',rarity:'Recognition',unlocked:embers>=500,description:`Hold at least 500 Embers. Current balance: ${profileFormatNumber(embers)}.`,category:'recognition'},
  {name:'Ember Elite',rarity:'Recognition',unlocked:embers>=1000,description:`Hold at least 1,000 Embers. Current balance: ${profileFormatNumber(embers)}.`,category:'recognition'},
  {name:'BOTW Winner',rarity:'Event Recognition',unlocked:botw>0,description:`Win a Boss of the Week event. Recorded wins: ${botw}.`,category:'recognition'},
  {name:'SOTW Winner',rarity:'Event Recognition',unlocked:sotw>0,description:`Win a Skill of the Week event. Recorded wins: ${sotw}.`,category:'recognition'},
  {name:'Bingo Winner',rarity:'Event Recognition',unlocked:bingo>0,description:`Win a Battleship Bingo event. Recorded wins: ${bingo}.`,category:'recognition'},
  {name:'Event Champion',rarity:'Event Recognition',unlocked:podiums>=5,description:`Earn five top-three finishes. Recorded finishes: ${podiums}.`,category:'recognition'}
 );
 return recognition;
}
function ikRenderHeroAchievements(){
 const hero=document.getElementById('profileHeroAchievements');
 if(!hero)return;
 const unlocked=ikAchievementCatalog.filter(a=>a.unlocked);
 hero.replaceChildren();
 const initial=6;
 for(const [index,badge] of unlocked.entries()){
   const chip=document.createElement('span');
   chip.className='ik-hero-earned-badge';
   chip.textContent=`✦ ${badge.name}`;
   chip.title=badge.description||badge.name;
   if(index>=initial)chip.hidden=true;
   hero.append(chip);
 }
 if(unlocked.length>initial){
   const toggle=document.createElement('button');
   toggle.type='button';toggle.className='ik-hero-badges-toggle';
   toggle.textContent=`+${unlocked.length-initial} more`;
   toggle.setAttribute('aria-expanded','false');
   toggle.addEventListener('click',()=>{
     const expanded=toggle.getAttribute('aria-expanded')!=='true';
     hero.querySelectorAll('.ik-hero-earned-badge').forEach((badge,index)=>{badge.hidden=!expanded&&index>=initial;});
     toggle.textContent=expanded?'Show fewer':`+${unlocked.length-initial} more`;
     toggle.setAttribute('aria-expanded',String(expanded));
   });
   hero.append(toggle);
 }
}

function renderProfileHero(profile) {
  const hero = document.getElementById("profileHero");
  if (!hero) return;

  const memberSince = profileFormatDate(profile.memberSince);
  const memberSincePill = memberSince
    ? `<span>Member Since: ${profileEscapeHtml(memberSince)}</span>`
    : "";

  hero.innerHTML = `
    <div class="profile-identity-card">
      <img class="profile-avatar"
        src="${profileEscapeHtml(profile.avatarUrl || "assets/ironkin-emblem.png")}"
        alt="${profileEscapeHtml(profile.displayName)} avatar"
        onerror="this.onerror=null;this.src='assets/ironkin-emblem.png';" />
      <div class="profile-identity-copy">
        <p class="eyebrow">Ironkin Member Profile</p>
        <h1>${profileEscapeHtml(profile.displayName)}</h1>
        <div class="profile-meta-row">
          <span>Rank: ${profileEscapeHtml(profile.rank)}</span>
          ${memberSincePill}
        </div>
        <div class="ik-osrs-links" id="ikOsrsLinks"></div>
        <div class="profile-hero-facts">
          <div><strong>${profileFormatNumber(profile.embers?.balance || 0)}</strong><span>Embers</span></div>
          <div><strong>${profileFormatNumber(profile.placements?.topThreeFinishes || 0)}</strong><span>Top 3 Finishes</span></div>
          <div><strong>${profileFormatNumber((profile.placements?.wins?.botw || 0) + (profile.placements?.wins?.sotw || 0) + (profile.placements?.wins?.bingo || 0))}</strong><span>Event Wins</span></div>
        </div>
        <div class="profile-badge-row">
          ${buildProfileBadges(profile).map(badge => `<span class="profile-badge badge-${badge.tone}" data-tooltip="${profileEscapeHtml(badge.tooltip)}" aria-label="${profileEscapeHtml(badge.tooltip)}" tabindex="0">${badge.iconHtml || `<i>${badge.icon}</i>`}${profileEscapeHtml(badge.label)}</span>`).join("")}
        </div>
        <div class="ik-profile-hero-achievements" id="profileHeroAchievements" aria-label="Earned achievements"></div>
        <p class="profile-blurb">${profile.blurb ? profileEscapeHtml(profile.blurb) : "Add a short profile bio to make this page yours."}</p>
      </div>
    </div>
  `;
}

function renderWomStats(profile) {
  const mount = document.getElementById("profileWomStats");
  if (!mount) return;

  const wom = profile.wom || {};

  if (!wom.found) {
    mount.innerHTML = `
      <div class="profile-empty-state">
        Stats temporarily unavailable.
      </div>
    `;
    return;
  }

  const topSkills = Array.isArray(wom.topSkills) ? wom.topSkills : [];

  mount.innerHTML = `
    <div class="profile-stat-card">
      <span>Total Level</span>
      <strong>${profileFormatNumber(wom.totalLevel)}</strong>
    </div>
    <div class="profile-stat-card">
      <span>Overall XP</span>
      <strong>${profileFormatNumber(wom.overallXp)}</strong>
    </div>
    <div class="profile-stat-card">
      <span>Combat Level</span>
      <strong>${wom.combatLevel || "-"}</strong>
    </div>
    <div class="profile-stat-card">
      <span>Overall Rank</span>
      <strong>${wom.overallRank ? profileFormatNumber(wom.overallRank) : "-"}</strong>
    </div>
    <div class="profile-top-skills"><h3>Skills</h3><div class="ik-osrs-skill-grid">${(Array.isArray(wom.skills)?wom.skills:topSkills).map(skill=>`<div class="ik-osrs-skill" title="${profileEscapeHtml(skill.name)} · ${profileFormatNumber(skill.experience)} XP"><small>${profileEscapeHtml(skill.name)}</small><strong>${profileFormatNumber(skill.level)}</strong></div>`).join('')}</div></div>
  `;
}

function renderEmbers(profile) {
  const value = document.getElementById("profileEmbersValue");
  if (value) value.textContent = profileFormatNumber(profile.embers?.balance || 0);
}

function renderEventRecord(profile) {
  const mount = document.getElementById("profileEventRecord");
  if (!mount) return;

  const placements = profile.placements || {};
  const wins = placements.wins || {};
  const recent = Array.isArray(placements.recent) ? placements.recent : [];

  mount.innerHTML = `
    <div class="profile-event-summary">
      <div><strong>${profileFormatNumber(wins.botw || 0)}</strong><span>BOTW Wins</span></div>
      <div><strong>${profileFormatNumber(wins.sotw || 0)}</strong><span>SOTW Wins</span></div>
      <div><strong>${profileFormatNumber(wins.bingo || 0)}</strong><span>Bingo Wins</span></div>
      <div><strong>${profileFormatNumber(placements.topThreeFinishes || 0)}</strong><span>Top 3 Finishes</span></div>
    </div>
    <div class="profile-recent-placements">
      <h3>Recent Event History</h3>
      ${recent.length ? recent.map(item => `
        <div class="profile-placement-row">
          <strong>${getPlacementIcon(item.placement)} ${profileEscapeHtml(item.type)}</strong>
          <span>${profileEscapeHtml(item.title)}</span>
          <small>${profileFormatNumber(item.gained)} gained</small>
        </div>
      `).join("") : `<p class="admin-muted">No archived event placements found yet.</p>`}
    </div>
  `;
}

function populateProfileForm(profile) {
  const avatarInput = document.getElementById("profileAvatarInput");
  const blurbInput = document.getElementById("profileBlurbInput");

  if (avatarInput) avatarInput.value = profile.ownAvatarUrl || "";
  if (blurbInput) blurbInput.value = profile.ownBlurb || "";
}


function renderPluginApiKey(profile) {
  const card = document.getElementById("profilePluginCard");
  const keyInput = document.getElementById("profilePluginApiKeyInput");
  const serverInput = document.getElementById("profilePluginServerInput");

  if (!card || profile.isOwnProfile === false) return;

  const plugin = profile.plugin || {};
  card.style.display = "";
  if (keyInput) keyInput.value = plugin.apiKey || "";
  if (serverInput) serverInput.value = plugin.serverUrl || "https://ironkinclan.com";
}

async function copyPluginApiKey() {
  const input = document.getElementById("profilePluginApiKeyInput");
  const status = document.getElementById("profilePluginStatus");
  const key = input?.value || "";

  if (!key) {
    if (status) status.textContent = "No plugin API key found.";
    return;
  }

  await navigator.clipboard.writeText(key);
  if (status) status.textContent = "Plugin API key copied.";
}

function togglePluginApiKeyVisibility() {
  const input = document.getElementById("profilePluginApiKeyInput");
  const button = document.getElementById("showPluginApiKeyBtn");
  if (!input) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  if (button) button.textContent = showing ? "Show" : "Hide";
}

async function regeneratePluginApiKey() {
  if (!confirm("Regenerate your plugin API key? Your old key will stop working immediately.")) return;

  const status = document.getElementById("profilePluginStatus");
  if (status) status.textContent = "Regenerating plugin API key...";

  const response = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customAvatarUrl: document.getElementById("profileAvatarInput")?.value.trim() || "",
      blurb: document.getElementById("profileBlurbInput")?.value.trim() || "",
      regeneratePluginApiKey: true
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (status) status.textContent = data.error || "Could not regenerate API key.";
    return;
  }

  renderProfile(data.profile);
  if (status) status.textContent = "Plugin API key regenerated. Update RuneLite with the new key.";
}

function renderProfile(profile) {
  currentProfile = profile;
  const grid = document.getElementById("profileGrid");
  if (grid) grid.style.display = "grid";

  ikProfileRecognitionCatalog=ikBuildRecognitionCatalog(profile);
  ikAchievementCatalog=[...ikProfileRecognitionCatalog];
  renderProfileHero(profile);
  ikRenderAchievements();
  renderWomStats(profile);
  ikLoadOsrsProgress(profile);
  renderEmbers(profile);
  renderEventRecord(profile);
  ikRequestAchievements(profile);
  renderPluginApiKey(profile);
  const toolsLink=document.getElementById('profileToolsLink');
  if(toolsLink)toolsLink.hidden=profile.isOwnProfile===false;
  ikSelectProfileTab(ikProfileActiveTab,{updateHash:false});
  const hub=document.getElementById('profileHubCard');
  if(hub)hub.style.display=profile.isOwnProfile===false?'none':'';
  const activity=document.getElementById('profileActivityCard');
  if(activity && profile.isOwnProfile===false)activity.style.display='none';
  const settingsCard = document.querySelector(".profile-settings-card");
  if (settingsCard) {
    settingsCard.style.display = profile.isOwnProfile === false ? "none" : "";
  }

  populateProfileForm(profile);
}

async function loadProfile() {
  const hero = document.getElementById("profileHero");

  try {
    const params = new URLSearchParams(window.location.search);
    const viewedId = params.get("id");
    const profileUrl = viewedId
      ? `/api/profile?id=${encodeURIComponent(viewedId)}&t=${Date.now()}`
      : `/api/profile?t=${Date.now()}`;

    const response = await fetch(profileUrl, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const failure = new Error(data.error || "Could not load profile.");
      failure.status = response.status;
      throw failure;
    }

    renderProfile(data.profile);
    if(data.profile?.isOwnProfile){
      profileLoadSubmissions();
      const wallet=document.getElementById("profileEmberWallet");if(wallet)wallet.style.display="";
      ikLoadWallet();
    }
  } catch (error) {
    if (hero) {
      hero.innerHTML = `
        <div class="profile-loading-card error">
          ${profileEscapeHtml(error.message)}
          <br /><br />
          ${error.status === 401 ? `<a class="btn primary" href="/api/auth/login">Sign in with Discord</a>` : `<a class="btn" href="/ember-leaderboard.html">Back to Ember Leaderboard</a>`}
        </div>
      `;
    }
  }
}

async function saveProfile() {
  const avatarInput = document.getElementById("profileAvatarInput");
  const blurbInput = document.getElementById("profileBlurbInput");
  const status = document.getElementById("profileSaveStatus");

  if (status) status.textContent = "Saving profile...";

  const response = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customAvatarUrl: avatarInput?.value.trim() || "",
      blurb: blurbInput?.value.trim() || ""
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (status) status.textContent = data.error || "Could not save profile.";
    return;
  }

  if (status) status.textContent = "Profile saved.";
  renderProfile(data.profile);
}


let profileSubmissionFilter = "all";
let profileSubmissionRows = [];
function profileRenderSubmissionTracker() {
  const list = document.getElementById("profileActivityList");
  const summary = document.getElementById("profileActivitySummary");
  if (!list) return;
  const counts = { pending:0, approved:0, rejected:0 };
  profileSubmissionRows.forEach(row => {
    const key = String(row.status || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts,key)) counts[key]++;
  });
  if (summary) summary.textContent = `${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`;
  document.querySelectorAll("[data-profile-filter]").forEach(button=>{
    const selected=button.dataset.profileFilter===profileSubmissionFilter;
    button.classList.toggle("is-active",selected);
    button.setAttribute("aria-pressed",String(selected));
  });
  const rows = profileSubmissionRows.filter(row=>profileSubmissionFilter==="all" || row.status===profileSubmissionFilter);
  if (!rows.length) {list.innerHTML='<p class="admin-muted">No submissions in this category.</p>';return;}
  list.innerHTML=rows.map(row=>{
    const date = row.created_at ? new Date(row.created_at) : null;
    const when = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-CA") : "";
    const proof = /^https:\/\//i.test(String(row.proof_url||""))
      ? `<a href="${profileEscapeHtml(row.proof_url)}" target="_blank" rel="noopener noreferrer">View proof ↗</a>` : "";
    return `<div class="ik-profile-entry"><div class="ik-profile-entry-main">
      <strong>${profileEscapeHtml(row.boss||"Hall of Flame")}</strong>
      <small>${profileEscapeHtml(row.time_text||"")} · ${profileEscapeHtml(when)} · Hall of Flame</small>
      ${proof}</div><span class="ik-profile-entry-status" data-status="${profileEscapeHtml(row.status)}">${profileEscapeHtml(row.status)}</span></div>`;
  }).join("");
}
async function profileLoadSubmissions() {
  const card=document.getElementById("profileActivityCard");
  if (!card || !currentProfile?.isOwnProfile) return;
  card.style.display="";
  const list=document.getElementById("profileActivityList");
  if (list) list.innerHTML='<p class="admin-muted">Loading submissions…</p>';
  try {
    const response=await fetch("/api/hall-of-flame/submissions",{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if (!response.ok || !Array.isArray(data.submissions)) throw new Error(data.error||"Could not load submissions.");
    // The API scopes non-staff submissions to the authenticated Discord user.
    // Staff accounts must not accidentally show every member's submissions here.
    profileSubmissionRows=data.submissions.filter(row=>String(row.discord_id)===String(currentProfile.discordId))
      .map(row=>({...row,status:String(row.status||"pending").toLowerCase()}));
    profileRenderSubmissionTracker();
  } catch(error) {
    if(list)list.textContent=error.message||"Submission history unavailable. Try refreshing.";
  }
}


const ikProfileTabs = ["overview","collection","combat","achievements","history","tools"];
let ikProfileActiveTab = "overview";
function ikSelectProfileTab(name,{focus=false,updateHash=true}={}) {
  if(!ikProfileTabs.includes(name)) name="overview";
  const toolTab=document.querySelector('[data-profile-tab="tools"]');
  if(name==="tools" && toolTab?.hidden) name="overview";
  ikProfileActiveTab=name;
  const ids={overview:"profileOverview",collection:"profileCollection",combat:"profileCombat",achievements:"profileAchievements",history:"profileEventHistory",tools:"profileTools"};
  document.querySelectorAll('[data-profile-tab]').forEach(button=>{
    const selected=button.dataset.profileTab===name;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
    if(selected && focus)button.focus();
  });
  for(const [key,id] of Object.entries(ids)){
    const panel=document.getElementById(id);
    if(panel)panel.hidden=key!==name;
  }
  if(updateHash && history.replaceState)history.replaceState(null,'',`#${name}`);
}
function ikInitProfileTabs(){
  const tabs=[...document.querySelectorAll('[data-profile-tab]')];
  for(const tab of tabs){
    tab.addEventListener('click',()=>ikSelectProfileTab(tab.dataset.profileTab));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const visible=tabs.filter(item=>!item.hidden);
      const index=visible.indexOf(tab);
      const next=event.key==='Home'?0:event.key==='End'?visible.length-1:
        (index+(event.key==='ArrowRight'?1:-1)+visible.length)%visible.length;
      ikSelectProfileTab(visible[next].dataset.profileTab,{focus:true});
    });
  }
  const hash=location.hash.slice(1).toLowerCase();
  ikSelectProfileTab(ikProfileTabs.includes(hash)?hash:'overview',{updateHash:false});
  window.addEventListener('hashchange',()=>{
    const hash=location.hash.slice(1).toLowerCase();
    if(ikProfileTabs.includes(hash))ikSelectProfileTab(hash,{updateHash:false});
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ikInitWallet();
  ikInitProfileTabs();
  const badgeCount=document.getElementById('profileAchievementCount');
  const tabCount=document.getElementById('profileTabAchievementCount');
  if(badgeCount && tabCount){
    const update=()=>{tabCount.textContent=badgeCount.textContent && badgeCount.textContent!=='—'?`(${badgeCount.textContent.trim()})`:'';};
    new MutationObserver(update).observe(badgeCount,{childList:true,characterData:true,subtree:true});
    update();
  }
  document.querySelectorAll('[data-achievement-filter]').forEach(button=>button.addEventListener('click',()=>{
    ikAchievementFilter=button.dataset.achievementFilter;ikRenderAchievements();
  }));
  document.querySelectorAll("[data-profile-filter]").forEach(button=>button.addEventListener("click",()=>{
    profileSubmissionFilter=button.dataset.profileFilter;
    profileRenderSubmissionTracker();
  }));
  document.getElementById("profileActivityRefresh")?.addEventListener("click",profileLoadSubmissions);

  const saveBtn = document.getElementById("saveProfileBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveProfile);

  document.getElementById("copyPluginApiKeyBtn")?.addEventListener("click", copyPluginApiKey);
  document.getElementById("showPluginApiKeyBtn")?.addEventListener("click", togglePluginApiKeyVisibility);
  document.getElementById("regeneratePluginApiKeyBtn")?.addEventListener("click", regeneratePluginApiKey);

  loadProfile();
});

// External progression is public data. The existing Ironkin API remains authoritative for clan data.
async function ikLoadOsrsProgress(profile){
 const rsn=String(profile.rsn||profile.wom?.username||'').trim();
 const links=document.getElementById('ikOsrsLinks');
 const external=document.getElementById('ikCombatExternal');
 if(links){links.replaceChildren();for(const [name,href] of [['RuneProfile','https://www.runeprofile.com/'+encodeURIComponent(rsn)],['TempleOSRS','https://templeosrs.com/player/overview.php?player='+encodeURIComponent(rsn)],['Wise Old Man','https://wiseoldman.net/players/'+encodeURIComponent(rsn)]]){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=name+' ↗';links.append(a)}}
 if(external)external.href='https://www.runeprofile.com/'+encodeURIComponent(rsn);
 if(!rsn){for(const id of ['ikClogSummary','ikOsrsFeed']){const n=document.getElementById(id);if(n)n.textContent='No linked OSRS username.'}return}
 try{
 const response=await fetch('/api/profile/osrs-progress?rsn='+encodeURIComponent(rsn));
 const result=await response.json();if(!response.ok)throw Error(result.error||'OSRS sources unavailable');
 const clog=result.collection||{};
 const summary=document.getElementById('ikClogSummary');if(summary)summary.textContent=clog.available?`${Number(clog.total||0).toLocaleString()} / ${Number(clog.possible||0).toLocaleString()} slots · TempleOSRS`:'Collection Log not synced or unavailable on TempleOSRS';
 const mount=document.getElementById('ikClogItems');if(mount){mount.replaceChildren();const items=Array.isArray(clog.items)?clog.items:[];const wrap=document.createElement('div');wrap.className='ik-osrs-collection-list';for(const item of items.slice(0,300)){const row=document.createElement('div');row.className='ik-osrs-item';const label=document.createElement('span');label.textContent=item.name||('Item #'+item.id);row.append(label);const count=document.createElement('small');count.textContent='×'+(item.count||1);row.append(count);wrap.append(row)}mount.append(wrap);if(!items.length){const p=document.createElement('p');p.className='admin-muted';p.textContent=clog.available?'No individual items returned.':'Sync a collection log to TempleOSRS to display obtained items.';mount.append(p)}}
 const feed=document.getElementById('ikOsrsFeed');if(feed){feed.replaceChildren();const items=Array.isArray(result.recent)?result.recent:[];for(const item of items.slice(0,30)){const row=document.createElement('div');row.className='ik-osrs-feed-row';const title=document.createElement('span');title.textContent='Collected '+(item.name||('item #'+item.id));const date=document.createElement('small');const d=new Date(Number(item.date)*1000);date.textContent=Number.isFinite(d.getTime())?d.toLocaleDateString():'';row.append(title,date);feed.append(row)}if(!items.length)feed.textContent='No recent synced collection unlocks available.'}
 }catch(err){for(const id of ['ikClogSummary','ikOsrsFeed']){const n=document.getElementById(id);if(n)n.textContent='External OSRS data unavailable: '+err.message}}
}
