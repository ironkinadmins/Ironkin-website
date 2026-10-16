
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

let ikShowcaseProfile = null;
let ikShowcaseCollection = null;
function ikShowcaseSafe(value){return profileEscapeHtml(String(value || ""));}
function ikRenderShowcase(){
 const root=document.getElementById('ikMemberShowcase');if(!root||!ikShowcaseProfile)return;
 const pref=ikShowcaseProfile.showcase||{};root.replaceChildren();
 const add=(label,value,note)=>{if(!value)return;const card=document.createElement('div');card.className='ik-showcase-card';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;card.append(small,strong);if(note){const p=document.createElement('p');p.textContent=note;card.append(p)}root.append(card);return card;};
 add('Current focus',pref.title);
 add('Favourite boss',pref.featuredBoss);
 if(pref.collectionGoal){
  const tabs=ikShowcaseCollection?.tabs||[];const page=tabs.flatMap(t=>t.pages||[]).find(p=>p.name===pref.collectionGoal);
  const card=add('Collection Log goal',pref.collectionGoal,page?`${page.obtained} / ${page.total} obtained`:'Waiting for Collection Log sync');
  if(card&&page){const track=document.createElement('div');track.className='ik-goal-track';track.setAttribute('role','progressbar');track.setAttribute('aria-valuenow',String(page.obtained));track.setAttribute('aria-valuemax',String(page.total));const fill=document.createElement('div');fill.className='ik-goal-fill';fill.style.width=`${page.total?Math.min(100,Math.round(page.obtained/page.total*100)):0}%`;track.append(fill);card.append(track);const missing=(page.items||[]).filter(i=>!i.quantity).slice(0,4).map(i=>i.name);if(missing.length){const m=document.createElement('div');m.className='ik-goal-missing';m.textContent='Still missing: '+missing.join(', ');card.append(m)}}
  if(card&&pref.goalNote){const note=document.createElement('p');note.textContent=pref.goalNote;card.append(note)}
 }
 root.hidden=!root.childElementCount;
}
function ikPopulateCollectionGoal(data){
 ikShowcaseCollection=data;const select=document.getElementById('ikCollectionGoal');if(select){const chosen=ikShowcaseProfile?.showcase?.collectionGoal||select.value;select.replaceChildren();select.add(new Option('No active goal',''));const pages=(data?.tabs||[]).flatMap(t=>(t.pages||[]).map(p=>({tab:t.name,page:p})));for(const {tab,page} of pages)select.add(new Option(`${tab} · ${page.name} (${page.obtained}/${page.total})`,page.name));if(chosen&&!pages.some(({page})=>page.name===chosen))select.add(new Option(chosen+' (not in latest sync)',chosen));select.value=chosen;}
 ikRenderShowcase();
}
function renderProfileHero(profile) {
  const hero = document.getElementById("profileHero");
  if (!hero) return;

  ikShowcaseProfile=profile;
  const memberSince = profileFormatDate(profile.memberSince);
  const memberSincePill = memberSince
    ? `<span>Member Since: ${profileEscapeHtml(memberSince)}</span>`
    : "";

  hero.innerHTML = `
    <div class="profile-identity-card" style="--ik-profile-banner:${profile.bannerUrl ? `url(\"${profileEscapeHtml(profile.bannerUrl)}\")` : "none"}">
      <div class="ik-avatar-edit-wrap"><img class="profile-avatar"
        src="${profileEscapeHtml(profile.avatarUrl || "assets/ironkin-emblem.png")}"
        alt="${profileEscapeHtml(profile.displayName)} avatar"
        onerror="this.onerror=null;this.src='assets/ironkin-emblem.png';" />${profile.isOwnProfile ? `<button type="button" class="ik-profile-edit-trigger" data-ik-edit="avatar">Edit avatar</button>` : ""}</div>
      <div class="profile-identity-copy">
        <p class="eyebrow">Ironkin Member Profile</p>
        <h1>${profileEscapeHtml(profile.displayName)}</h1>
        <div class="profile-meta-row">
          <span>Rank: ${profileEscapeHtml(profile.rank)}</span>
          ${memberSincePill}
        </div>
        <div class="ik-osrs-links" id="ikOsrsLinks"></div>
        ${profile.isOwnProfile ? `<div class="ik-profile-edit-actions"><button type="button" class="ik-profile-edit-trigger" data-ik-edit="all">Edit profile</button></div>` : ""}
        <div class="profile-hero-facts">
          <div><strong>${profileFormatNumber(profile.embers?.balance || 0)}</strong><span>Embers</span></div>
          <div><strong>${profileFormatNumber(profile.placements?.topThreeFinishes || 0)}</strong><span>Top 3 Finishes</span></div>
          <div><strong>${profileFormatNumber((profile.placements?.wins?.botw || 0) + (profile.placements?.wins?.sotw || 0) + (profile.placements?.wins?.bingo || 0))}</strong><span>Event Wins</span></div>
        </div>
        <div class="profile-badge-row">
          ${buildProfileBadges(profile).map(badge => `<span class="profile-badge badge-${badge.tone}" data-tooltip="${profileEscapeHtml(badge.tooltip)}" aria-label="${profileEscapeHtml(badge.tooltip)}" tabindex="0">${badge.iconHtml || `<i>${badge.icon}</i>`}${profileEscapeHtml(badge.label)}</span>`).join("")}
        </div>
        <div class="ik-profile-hero-achievements" id="profileHeroAchievements" aria-label="Earned achievements"></div>
        <div class="ik-showcase" id="ikMemberShowcase" aria-label="Member showcase" hidden></div>
        <p class="profile-blurb" ${profile.isOwnProfile ? `data-ik-edit="bio" role="button" tabindex="0" title="Edit your bio" style="cursor:pointer"` : ""}>${profile.blurb ? profileEscapeHtml(profile.blurb) : (profile.isOwnProfile ? "Click to add your profile bio" : "")}</p>
      </div>
      ${profile.isOwnProfile ? `<button type="button" class="ik-profile-edit-trigger ik-banner-edit-trigger" data-ik-edit="banner">Edit banner</button>` : ""}
    </div>
  `;
  ikRenderShowcase();
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
    <div class="profile-top-skills ik-profile-progress-widget">
      <div class="ik-progress-tabs" role="tablist" aria-label="OSRS progression">
        <button type="button" class="is-active" data-osrs-progress-tab="skills" aria-selected="true">Skills</button>
        <button type="button" data-osrs-progress-tab="quests" aria-selected="false">Quests</button>
        <button type="button" data-osrs-progress-tab="diaries" aria-selected="false">Achievement Diaries</button>
      </div>
      <div data-osrs-progress-panel="skills"><div class="ik-osrs-skill-grid">${ikOrderedSkills(Array.isArray(wom.skills)?wom.skills:topSkills).map(skill=>`<div class="ik-osrs-skill" title="${profileEscapeHtml(skill.name)} · ${profileFormatNumber(skill.experience??skill.xp??0)} XP"><img loading="lazy" alt="" src="https://oldschool.runescape.wiki/images/${encodeURIComponent(skill.name.replace(/ /g,'_'))}_icon.png" onerror="this.style.display='none'"><span class="ik-skill-name">${profileEscapeHtml(skill.name)}</span><strong>${profileFormatNumber(skill.level)}</strong></div>`).join('')}</div></div>
      <div data-osrs-progress-panel="quests" hidden><p class="admin-muted">Select Quests to load RuneProfile progress.</p></div>
      <div data-osrs-progress-panel="diaries" hidden><p class="admin-muted">Select Achievement Diaries to load RuneProfile progress.</p></div>
    </div>
  `;
  ikInitOsrsProgressTabs(profile);
}


let ikChecklistRequest=0;
const ikSkillOrder=['Attack','Hitpoints','Mining','Strength','Agility','Smithing','Defence','Herblore','Fishing','Ranged','Thieving','Cooking','Prayer','Crafting','Firemaking','Magic','Fletching','Woodcutting','Runecraft','Slayer','Farming','Construction','Hunter','Sailing'];
function ikOrderedSkills(skills){return [...skills].sort((a,b)=>{const ia=ikSkillOrder.findIndex(n=>n.toLowerCase()===String(a.name||'').toLowerCase()),ib=ikSkillOrder.findIndex(n=>n.toLowerCase()===String(b.name||'').toLowerCase());return (ia<0?99:ia)-(ib<0?99:ib)})}

function ikInitOsrsProgressTabs(profile){
 const widget=document.querySelector('.ik-profile-progress-widget');if(!widget)return;
 let cached=null;let pending=null;
 const buttons=[...widget.querySelectorAll('[data-osrs-progress-tab]')];
 const esc=value=>profileEscapeHtml(String(value??''));
 const render=(tab)=>{
   const panel=widget.querySelector(`[data-osrs-progress-panel="${tab}"]`);if(!panel||!cached)return;
   if(tab==='quests'){
     const response=cached.quests;
     if(!Array.isArray(response?.data)){panel.textContent=response?.error||'Quest information unavailable for this player.';return;}
     const quests=response.data;
     const completed=quests.filter(q=>q.state==='finished').length;
     panel.innerHTML=`<p class="ik-progress-summary">${completed} / ${quests.length} quests completed</p><div class="ik-checklist">${quests.map(q=>`<div class="ik-checklist-row ${q.state==='finished'?'is-complete':''}"><span>${q.state==='finished'?'✓':q.state==='in_progress'?'◐':'○'}</span><span>${esc(q.name)}</span><small>${Number(q.points)||0} QP</small></div>`).join('')}</div>`;
   }else if(tab==='diaries'){
     const response=cached.diaries;
     if(!Array.isArray(response?.data)){panel.textContent=response?.error||'Achievement Diary information unavailable for this player.';return;}
     const areas=response.data;
     panel.innerHTML=`<div class="ik-checklist">${areas.map(a=>`<div class="ik-diary-area"><strong>${esc(a.area)}</strong>${(a.tiers||[]).map(t=>`<div class="ik-checklist-row ${t.total>0&&t.completed>=t.total?'is-complete':''}"><span>${t.total>0&&t.completed>=t.total?'✓':'○'}</span><span>${esc(t.tier)}</span><small>${Number(t.completed)||0} / ${Number(t.total)||0}</small></div>`).join('')}</div>`).join('')}</div>`;
   }
 };
 const requestId=++ikChecklistRequest;
 buttons.forEach(button=>button.addEventListener('click',async()=>{
   const tab=button.dataset.osrsProgressTab;
   buttons.forEach(b=>{const selected=b===button;b.classList.toggle('is-active',selected);b.setAttribute('aria-selected',String(selected));});
   widget.querySelectorAll('[data-osrs-progress-panel]').forEach(p=>{p.hidden=p.dataset.osrsProgressPanel!==tab;});
   if(tab==='skills')return;
   const panel=widget.querySelector(`[data-osrs-progress-panel="${tab}"]`);
   if(cached){render(tab);return;}
   panel.textContent='Loading '+(tab==='quests'?'quests':'achievement diaries')+'…';
   if(!pending)pending=fetch('/api/profile-osrs-checklist?rsn='+encodeURIComponent(profile.rsn||profile.username||''),{headers:{Accept:'application/json'}}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to load RuneProfile progress');return data;});
   try{const data=await pending;if(requestId!==ikChecklistRequest)return;cached=data;render(tab);}catch(e){pending=null;panel.textContent=e.message||'RuneProfile progress unavailable.';}
 }));
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
  const bannerInput=document.getElementById("profileBannerInput");if(bannerInput)bannerInput.value=profile.bannerUrl||"";
  if (blurbInput) blurbInput.value = profile.ownBlurb || "";
  for(const [id,key] of [['ikShowcaseTitle','title'],['ikShowcaseBoss','featuredBoss'],['ikGoalNote','goalNote']]){const input=document.getElementById(id);if(input)input.value=profile.showcase?.[key]||'';}
  const goal=document.getElementById('ikCollectionGoal');if(goal){const v=profile.showcase?.collectionGoal||'';if(v&&!Array.from(goal.options).some(o=>o.value===v))goal.add(new Option(v,v));goal.value=v;}
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
      bannerUrl: document.getElementById("profileBannerInput")?.value.trim() || "",
      blurb: blurbInput?.value.trim() || "",
      showcase: {title:document.getElementById('ikShowcaseTitle')?.value.trim()||'',featuredBoss:document.getElementById('ikShowcaseBoss')?.value.trim()||'',collectionGoal:document.getElementById('ikCollectionGoal')?.value||'',goalNote:document.getElementById('ikGoalNote')?.value.trim()||''}
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (status) status.textContent = data.error || "Could not save profile.";
    return;
  }

  if (status) status.textContent = "Profile saved.";
  renderProfile(data.profile);
  ikCloseProfileEditor();
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
  if(name==="combat")ikCaLoad();
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


let ikEditorReturnParent=null;
function ikOpenProfileEditor(focus){
 const overlay=document.getElementById('ikProfileEditOverlay');const mount=document.getElementById('ikEditFormMount');const card=document.querySelector('.profile-settings-card');
 if(!overlay||!mount||!card||card.style.display==='none')return;
 if(!ikEditorReturnParent)ikEditorReturnParent=card.parentNode;
 mount.append(card);overlay.hidden=false;document.body.style.overflow='hidden';
 const focusId={avatar:'profileAvatarInput',banner:'profileBannerInput',bio:'profileBlurbInput',all:'ikShowcaseTitle'}[focus]||'ikShowcaseTitle';
 document.getElementById(focusId)?.focus();
}
function ikCloseProfileEditor(){
 const overlay=document.getElementById('ikProfileEditOverlay');const card=document.querySelector('.profile-settings-card');
 if(overlay)overlay.hidden=true;document.body.style.overflow='';
 if(ikEditorReturnParent&&card&&card.parentNode!==ikEditorReturnParent)ikEditorReturnParent.append(card);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("profileHero")?.addEventListener("click",event=>{const trigger=event.target.closest("[data-ik-edit]");if(trigger)ikOpenProfileEditor(trigger.dataset.ikEdit);});
  document.getElementById("profileHero")?.addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target.matches("[data-ik-edit]")){event.preventDefault();ikOpenProfileEditor(event.target.dataset.ikEdit);}});
  document.getElementById("ikCloseEdit")?.addEventListener("click",ikCloseProfileEditor);
  document.getElementById("ikProfileEditOverlay")?.addEventListener("click",event=>{if(event.target.id==="ikProfileEditOverlay")ikCloseProfileEditor();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")ikCloseProfileEditor();});
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
 ikCaState.rsn=rsn;ikCaState.loaded=false;ikCaState.tasks=[];ikCaState.error='';
 const links=document.getElementById('ikOsrsLinks');
 const external=document.getElementById('ikCombatExternal');
 if(links){links.replaceChildren();for(const [name,href] of [['RuneProfile','https://www.runeprofile.com/'+encodeURIComponent(rsn)],['TempleOSRS','https://templeosrs.com/player/overview.php?player='+encodeURIComponent(rsn)],['Wise Old Man','https://wiseoldman.net/players/'+encodeURIComponent(rsn)]]){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=name+' ↗';links.append(a)}}
 if(external)external.href='https://www.runeprofile.com/'+encodeURIComponent(rsn);
 if(!rsn){for(const id of ['ikClogSummary','ikOsrsFeed']){const n=document.getElementById(id);if(n)n.textContent='No linked OSRS username.'}return}
 try{
 const response=await fetch('/api/osrs-progress?rsn='+encodeURIComponent(rsn),{headers:{Accept:'application/json'}});
 const contentType=response.headers.get('content-type')||'';if(!contentType.includes('application/json'))throw Error('OSRS API route returned a web page instead of JSON (HTTP '+response.status+'). Confirm Cloudflare Pages Functions are deployed at /api/osrs-progress.');const result=await response.json();if(!response.ok)throw Error(result.error||'OSRS sources unavailable (HTTP '+response.status+')');
 const clog=result.collection||{};
 const summary=document.getElementById('ikClogSummary');if(summary)summary.textContent=clog.available?`${Number(clog.total||0).toLocaleString()} / ${Number(clog.possible||0).toLocaleString()} slots · TempleOSRS`:'Collection Log not synced or unavailable on TempleOSRS';
 await ikLoadRuneJournal(rsn,clog,result.recent||[]);

 }catch(err){await ikLoadRuneJournal(rsn,{items:[]},[]);const n=document.getElementById('ikClogSummary');if(n&&!n.textContent.includes('RuneProfile'))n.textContent='TempleOSRS unavailable: '+err.message}
}


// Player-specific Combat Achievements from RuneProfile public API.
const ikCaState={tasks:[],loaded:false,loading:false,error:'',rsn:'',points:0,tierReached:null};
function ikCaRender(){
 const mount=document.getElementById('ikCaTasks'),status=document.getElementById('ikCaStatus'),summary=document.getElementById('ikCombatSummary');if(!mount)return;
 mount.replaceChildren();const tier=document.getElementById('ikCaTier')?.value||'',query=(document.getElementById('ikCaSearch')?.value||'').trim().toLowerCase();
 const filtered=ikCaState.tasks.filter(t=>(!tier||t.tier===tier)&&(!query||[t.name,t.boss,t.description,t.type].some(v=>v.toLowerCase().includes(query))));
 const completed=ikCaState.tasks.filter(t=>t.completed&&!t.exempt).length;
 const eligible=ikCaState.tasks.filter(t=>!t.exempt).length;
 if(summary)summary.textContent=ikCaState.loaded?`${completed} / ${eligible} tasks completed · ${ikCaState.points} points · Highest tier: ${ikCaState.tierReached||'None'}`:'Player-specific Combat Achievements from RuneProfile';
 const progress=document.getElementById('ikCaProgress');if(progress){progress.replaceChildren();for(const tierName of ['Easy','Medium','Hard','Elite','Master','Grandmaster']){const ts=ikCaState.tasks.filter(t=>t.tier===tierName&&!t.exempt);if(!ts.length)continue;const badge=document.createElement('span');const strong=document.createElement('strong');strong.textContent=tierName+' ';badge.append(strong,document.createTextNode(`${ts.filter(t=>t.completed).length}/${ts.length}`));progress.append(badge)}}
 const near=document.getElementById('ikCaNearComplete');if(near){near.replaceChildren();if(ikCaState.loaded){const groups=new Map();for(const task of ikCaState.tasks){if(task.exempt||!task.boss)continue;const group=groups.get(task.boss)||{done:0,left:0};if(task.completed)group.done++;else group.left++;groups.set(task.boss,group)}const closest=[...groups.entries()].filter(([,v])=>v.left>0&&v.done>0).sort((a,b)=>a[1].left-b[1].left||b[1].done-a[1].done).slice(0,5);if(closest.length){const heading=document.createElement('h3');heading.textContent='Closest to completion';near.append(heading);for(const [boss,v] of closest){const b=document.createElement('button');b.type='button';b.textContent=`${boss} · ${v.left} remaining`;b.onclick=()=>{const select=document.getElementById('ikCaBoss');if(select){select.value=boss;select.dispatchEvent(new Event('change'))}};near.append(b)}}}}
 if(status)status.textContent=ikCaState.loading?'Loading player Combat Achievements…':ikCaState.error?ikCaState.error:ikCaState.loaded?`${filtered.length.toLocaleString()} matching tasks · ${completed} / ${eligible} completed · RuneProfile`:'Open this tab to load player progress.';
 for(const task of filtered.slice(0,350)){
  const card=document.createElement('details');card.className='ik-ca-task'+(task.completed&&!task.exempt?' is-complete':'');
  const row=document.createElement('summary');const mark=document.createElement('span');mark.className='ik-ca-status-icon';mark.textContent=task.exempt?'—':task.completed?'✓':'○';
  const copy=document.createElement('span');copy.className='ik-ca-task-copy';const name=document.createElement('strong');name.textContent=task.name;const meta=document.createElement('small');meta.textContent=[task.boss,task.type,task.exempt?'Exempt':task.completed?'Completed':'Remaining'].filter(Boolean).join(' · ');copy.append(name,meta);
  const badge=document.createElement('span');badge.className='ik-ca-pill';badge.textContent=task.tier;row.append(mark,copy,badge);card.append(row);
  const description=document.createElement('div');description.className='ik-ca-task-description';description.textContent=task.description||'No description available.';card.append(description);mount.append(card);
 }
 if(filtered.length>350){const p=document.createElement('p');p.className='admin-muted';p.textContent='Showing first 350 matches. Use tier or search to narrow results.';mount.append(p)}
 if(ikCaState.loaded&&!filtered.length){const p=document.createElement('p');p.className='admin-muted';p.textContent='No tasks match these filters.';mount.append(p)}
}
async function ikCaLoad(force=false){
 if(ikCaState.loading||(ikCaState.loaded&&!force))return;
 const rsn=ikCaState.rsn;
 if(!rsn){ikCaState.error='No linked OSRS username.';ikCaRender();return}
 ikCaState.loading=true;ikCaState.error='';ikCaRender();
 try{
  const res=await fetch('/api/player-combat-achievements?rsn='+encodeURIComponent(rsn),{headers:{Accept:'application/json'},cache:force?'reload':'default'});
  if(!(res.headers.get('content-type')||'').includes('application/json'))throw Error('Player Combat Achievements API returned HTML. Confirm the Pages Function was deployed.');
  const data=await res.json();if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);
  if(!data.available||!Array.isArray(data.tasks))throw Error('Player completion data unavailable.');
  ikCaState.tasks=data.tasks;ikCaState.points=data.totalPoints;ikCaState.tierReached=data.tierReached;ikCaState.loaded=true;
 }catch(err){ikCaState.error='Player Combat Achievements unavailable: '+err.message;}
 finally{ikCaState.loading=false;ikCaRender()}
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('ikCaTier')?.addEventListener('change',ikCaRender);
 document.getElementById('ikCaSearch')?.addEventListener('input',ikCaRender);
 document.getElementById('ikCaReload')?.addEventListener('click',()=>{ikCaState.loaded=false;ikCaLoad(true)});
});


// RuneProfile journal: actual per-player Collection Log and activity feed, with Temple fallback.
async function ikLoadRuneJournal(rsn,temple,templeRecent){
 const mount=document.getElementById('ikClogItems'),feed=document.getElementById('ikOsrsFeed');
 let data=null,activities=[];
 try{const response=await fetch('/api/profile-rune-journal?rsn='+encodeURIComponent(rsn),{headers:{Accept:'application/json'}});if(!response.ok)throw Error('RuneProfile journal unavailable');data=await response.json();activities=Array.isArray(data.activities)?data.activities:[];}catch(e){/* Temple collection remains the fallback */}
 if(mount){mount.replaceChildren();const tabs=Array.isArray(data?.collection?.tabs)?data.collection.tabs:[];
 if(tabs.length){const bar=document.createElement('div');bar.className='ik-clog-tabs';const body=document.createElement('div');body.className='ik-clog-body';const pages=document.createElement('div');pages.className='ik-clog-pages';const detail=document.createElement('div');detail.className='ik-clog-detail';body.append(pages,detail);mount.append(bar,body);
 const showTab=(tab)=>{bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab.name)));pages.replaceChildren();const list=Array.isArray(tab.pages)?tab.pages:[];
 const showPage=(page)=>{pages.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.page===page.name)));detail.replaceChildren();const title=document.createElement('h3');title.textContent=page.name;const count=document.createElement('small');count.textContent=`Obtained ${page.obtained} / ${page.total}`;const grid=document.createElement('div');grid.className='ik-clog-grid';for(const item of page.items||[]){const slot=document.createElement('div');slot.className='ik-clog-slot'+(item.quantity>0?'':' missing');const img=document.createElement('img');img.loading='lazy';img.alt='';img.src='https://oldschool.runescape.wiki/images/Special:FilePath/'+encodeURIComponent(item.name.replace(/ /g,'_')+'.png');img.onerror=()=>img.remove();const label=document.createElement('span');label.textContent=item.name;slot.append(img,label);if(item.quantity>1){const q=document.createElement('small');q.textContent='×'+item.quantity;slot.append(q)}grid.append(slot)}detail.append(title,count,grid)};
 for(const page of list){const b=document.createElement('button');b.type='button';b.dataset.page=page.name;b.textContent=page.name;const c=document.createElement('small');c.textContent=`${page.obtained}/${page.total}`;b.append(c);b.onclick=()=>showPage(page);pages.append(b)}if(list.length)showPage(list[0]);};
 for(const tab of tabs){const b=document.createElement('button');b.type='button';b.dataset.tab=tab.name;b.textContent=tab.name;const count=document.createElement('small');count.textContent=`${tab.obtained} / ${tab.total}`;b.append(count);b.onclick=()=>showTab(tab);bar.append(b)}showTab(tabs[0]);const summary=document.getElementById('ikClogSummary');if(summary)summary.textContent=`${data.collection.obtained} / ${data.collection.total} slots · RuneProfile`;
 }else{const list=document.createElement('div');list.className='ik-osrs-collection-list';for(const item of (temple.items||[]).slice(0,300)){const row=document.createElement('div');row.className='ik-osrs-item';row.textContent=(item.name||'Item #'+item.id)+' ×'+(item.count||1);list.append(row)}mount.append(list);if(!list.children.length)mount.textContent='Collection Log not yet synced to RuneProfile or TempleOSRS.';}}
  ikRenderOsrsHighlights(activities, data?.collection);
 if(feed){
  const filters=document.getElementById('ikOsrsFilters');
  const categories=[['all','All activity'],['collection','Collection Log'],['achievements','Achievements'],['levels','Levels & XP'],['drops','Drops'],['quests','Quests']];
  const groupOf={new_item_obtained:'collection',combat_achievement_tier_completed:'achievements',achievement_diary_tier_completed:'achievements',level_up:'levels',xp_milestone:'levels',maxed:'levels',valuable_drop:'drops',quest_completed:'quests'};
  const labels={new_item_obtained:'Collection Log unlock',combat_achievement_tier_completed:'Combat Achievement tier',achievement_diary_tier_completed:'Achievement Diary',level_up:'Level up',xp_milestone:'XP milestone',maxed:'Maxed',valuable_drop:'Valuable drop',quest_completed:'Quest completed'};
  const rows=activities.length?activities:(templeRecent||[]).map(item=>({type:'new_item_obtained',data:{itemId:item.id},enriched:{itemName:item.name},createdAt:null}));
  let active='all',page=0;const pageSize=7;
  const count=document.getElementById('ikOsrsFeedCount'),indicator=document.getElementById('ikOsrsPage'),prev=document.getElementById('ikOsrsPrev'),next=document.getElementById('ikOsrsNext');
  const render=()=>{
   const filtered=active==='all'?rows:rows.filter(event=>groupOf[event.type]===active);
   const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages-1);feed.replaceChildren();
   for(const event of filtered.slice(page*pageSize,(page+1)*pageSize)){
    const d=event.data||{},e=event.enriched||{},group=groupOf[event.type]||'other';
    const detail=event.type==='level_up'?`${d.name||'Skill'} level ${d.level??''}`:event.type==='new_item_obtained'?e.itemName||`Item #${d.itemId}`:event.type==='combat_achievement_tier_completed'?e.tierName||`Tier ${d.tierId}`:event.type==='achievement_diary_tier_completed'?`${e.areaName||'Area '+d.areaId} ${e.tierName||''}`:event.type==='xp_milestone'?`${d.name||'Skill'} ${Number(d.xp||0).toLocaleString()} XP`:event.type==='valuable_drop'?e.itemName||`Item #${d.itemId}`:event.type==='quest_completed'?e.questName||`Quest #${d.questId}`:'';
    const row=document.createElement('div');row.className='ik-osrs-feed-row';const marker=document.createElement('span');marker.className='ik-feed-marker';marker.dataset.kind=group;marker.setAttribute('aria-hidden','true');const info=document.createElement('div');info.className='ik-feed-info';const title=document.createElement('strong');title.textContent=(labels[event.type]||'OSRS activity')+(detail?': '+detail:'');const when=document.createElement('small');const date=new Date(event.createdAt);when.textContent=event.createdAt&&Number.isFinite(date.getTime())?date.toLocaleString():'Recent unlock (time unavailable)';info.append(title,when);row.append(marker,info);feed.append(row);
   }
   if(!filtered.length){const empty=document.createElement('p');empty.className='admin-muted';empty.textContent=rows.length?'No activity in this category.':'No recent RuneProfile activity available. The player may need to sync their RuneProfile plugin.';feed.append(empty)}
   if(count)count.textContent=`${filtered.length} ${filtered.length===1?'event':'events'}`;if(indicator)indicator.textContent=`${page+1} / ${pages}`;if(prev)prev.disabled=page===0;if(next)next.disabled=page>=pages-1;
   filters?.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===active)));
  };
  if(filters){filters.replaceChildren();for(const [key,label] of categories){const button=document.createElement('button');button.type='button';button.dataset.filter=key;button.textContent=label;button.onclick=()=>{active=key;page=0;render()};filters.append(button)}}
  if(prev)prev.onclick=()=>{page=Math.max(0,page-1);render()};if(next)next.onclick=()=>{page++;render()};render();
 }
}

function ikRenderOsrsHighlights(activities,collection){
 const mount=document.getElementById('ikOsrsHighlights');if(!mount)return;
 mount.replaceChildren();
 const kinds=[['level_up','Latest level-up'],['new_item_obtained','Latest collection unlock'],['combat_achievement_tier_completed','Latest CA tier']];
 for(const [type,label] of kinds){const item=(activities||[]).find(a=>a.type===type);const card=document.createElement('div');card.className='ik-highlight-card';const title=document.createElement('span');title.textContent=label;const value=document.createElement('strong');const d=item?.data||{},e=item?.enriched||{};value.textContent=!item?'No recent event':type==='level_up'?`${d.name||'Skill'} ${d.level||''}`:type==='new_item_obtained'?(e.itemName||'Collection item'):(e.tierName||'Combat Achievement tier');card.append(title,value);mount.append(card)}
 if(collection&&Number(collection.total)>0){const card=document.createElement('div');card.className='ik-highlight-card';const title=document.createElement('span');title.textContent='Collection Log';const value=document.createElement('strong');value.textContent=`${Math.round(100*Number(collection.obtained||0)/Number(collection.total))}% complete`;card.append(title,value);mount.append(card)}
}

// Group existing RuneProfile controls into an Ironkin task-browser sidebar.
document.addEventListener('DOMContentLoaded',()=>{
 const panel=document.getElementById('profileCombat');if(!panel||panel.querySelector('.ik-ca-workspace'))return;
 const controls=panel.querySelector('.ik-ca-controls'),quick=panel.querySelector('.ik-ca-quickfilters'),progress=panel.querySelector('#ikCaProgress'),status=panel.querySelector('#ikCaStatus'),tasks=panel.querySelector('#ikCaTasks');
 if(!controls||!quick||!progress||!status||!tasks)return;
 const layout=document.createElement('div');layout.className='ik-ca-workspace';const sidebar=document.createElement('aside');sidebar.className='ik-ca-sidebar';sidebar.setAttribute('aria-label','Combat Achievement filters');const heading=document.createElement('h3');heading.textContent='Find achievements';sidebar.append(heading,controls,quick);const main=document.createElement('div');main.className='ik-ca-main';main.append(progress,status,tasks);layout.append(sidebar,main);panel.append(layout);
});
