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
  const clanRank = String(profile.clanRank || "");
  const staffRank = String(profile.staffRank || "");
  const wins = profile.placements?.wins || {};
  const botwWins = Number(wins.botw || 0);
  const sotwWins = Number(wins.sotw || 0);
  const bingoWins = Number(wins.bingo || 0);
  const topThree = Number(profile.placements?.topThreeFinishes || 0);
  const embers = Number(profile.embers?.balance || 0);

  if (staffRank) badges.push({
    iconHtml: profileDiscordBadgeIcon(profile.staffRankIconUrl, profile.staffRankUnicodeEmoji, "◆"),
    label: staffRank,
    tone: "staff",
    tooltip: `${staffRank} — Member of the Ironkin staff team.`
  });
  if (clanRank === "Founder") badges.push({
    iconHtml: profileDiscordBadgeIcon(profile.rankIconUrl, profile.rankUnicodeEmoji, "♛"),
    label: "Founder",
    tone: "founder",
    tooltip: "Founder — Created Ironkin."
  });
  else if (clanRank && clanRank !== "Member") badges.push({
    iconHtml: profileDiscordBadgeIcon(profile.rankIconUrl, profile.rankUnicodeEmoji, "◇"),
    label: clanRank,
    tone: "rank",
    tooltip: `Clan Rank: ${clanRank}`
  });
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

  return badges.slice(0, 7);
}

function renderProfileHero(profile) {
  const hero = document.getElementById("profileHero");
  if (!hero) return;

  const memberSince = profileFormatDate(profile.memberSince);
  const memberSincePill = memberSince
    ? `<span>Member Since: ${profileEscapeHtml(memberSince)}</span>`
    : "";

  const staffPill = profile.staffRank
    ? `<span>Staff: ${profileEscapeHtml(profile.staffRank)}</span>`
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
          ${staffPill}
          ${memberSincePill}
        </div>
        <div class="profile-badge-row">
          ${buildProfileBadges(profile).map(badge => `<span class="profile-badge badge-${badge.tone}" data-tooltip="${profileEscapeHtml(badge.tooltip)}" aria-label="${profileEscapeHtml(badge.tooltip)}" tabindex="0">${badge.iconHtml || `<i>${badge.icon}</i>`}${profileEscapeHtml(badge.label)}</span>`).join("")}
        </div>
        <p class="profile-blurb">${profile.blurb ? profileEscapeHtml(profile.blurb) : "No profile blurb yet."}</p>
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
      <h3>Top Skills by XP</h3>
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
      <h3>Recent Placements</h3>
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
  renderPluginApiKey(profile);
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
      throw new Error(data.error || "Could not load profile.");
    }

    renderProfile(data.profile);
  } catch (error) {
    if (hero) {
      hero.innerHTML = `
        <div class="profile-loading-card error">
          ${profileEscapeHtml(error.message)}
          <br /><br />
          <a class="btn primary" href="/api/auth/login">Sign in with Discord</a>
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

document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveProfileBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveProfile);

  document.getElementById("copyPluginApiKeyBtn")?.addEventListener("click", copyPluginApiKey);
  document.getElementById("showPluginApiKeyBtn")?.addEventListener("click", togglePluginApiKeyVisibility);
  document.getElementById("regeneratePluginApiKeyBtn")?.addEventListener("click", regeneratePluginApiKey);

  loadProfile();
});
