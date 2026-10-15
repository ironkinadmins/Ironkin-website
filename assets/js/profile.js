
let ikAchievementFilter='all';
let ikAchievementCatalog=[];
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
 ikAchievementCatalog=[];mount.innerHTML='<p class="admin-muted">Loading achievements from clan records…</p>';
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
 ikAchievementCatalog=Array.isArray(event.data.catalog)?event.data.catalog:[];
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

  return badges.slice(0, 3);
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
        <div class="profile-hero-facts">
          <div><strong>${profileFormatNumber(profile.embers?.balance || 0)}</strong><span>Embers</span></div>
          <div><strong>${profileFormatNumber(profile.placements?.topThreeFinishes || 0)}</strong><span>Top 3 Finishes</span></div>
          <div><strong>${profileFormatNumber((profile.placements?.wins?.botw || 0) + (profile.placements?.wins?.sotw || 0) + (profile.placements?.wins?.bingo || 0))}</strong><span>Event Wins</span></div>
        </div>
        <div class="profile-badge-row">
          ${buildProfileBadges(profile).map(badge => `<span class="profile-badge badge-${badge.tone}" data-tooltip="${profileEscapeHtml(badge.tooltip)}" aria-label="${profileEscapeHtml(badge.tooltip)}" tabindex="0">${badge.iconHtml || `<i>${badge.icon}</i>`}${profileEscapeHtml(badge.label)}</span>`).join("")}
        </div>
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
    <div class="profile-top-skills">
      <h3>Top Skills</h3>
      ${topSkills.length ? topSkills.map(skill => `
        <div class="profile-skill-row">
          <span>${profileEscapeHtml(skill.name)}</span>
          <strong>${profileFormatNumber(skill.experience)} XP</strong>
          <small>Level ${profileFormatNumber(skill.level)}</small>
        </div>
      `).join("") : `<p class="admin-muted">No skill data available.</p>`}
    </div>
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

  renderProfileHero(profile);
  renderWomStats(profile);
  renderEmbers(profile);
  renderEventRecord(profile);
  ikRequestAchievements(profile);
  renderPluginApiKey(profile);
  const toolsLink=document.getElementById('profileToolsLink');
  if(toolsLink)toolsLink.hidden=profile.isOwnProfile===false;
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
    if(data.profile?.isOwnProfile)profileLoadSubmissions();
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

document.addEventListener("DOMContentLoaded", () => {
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
