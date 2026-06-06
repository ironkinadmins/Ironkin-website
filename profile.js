let currentProfile = null;

function profileFormatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function profileEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function profileFormatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function getPlacementIcon(place) {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `#${place}`;
}

function renderProfileHero(profile) {
  const hero = document.getElementById("profileHero");
  if (!hero) return;

  hero.innerHTML = `
    <div class="profile-identity-card">
      <img class="profile-avatar" src="${profileEscapeHtml(profile.avatarUrl)}" alt="${profileEscapeHtml(profile.displayName)} avatar" />
      <div class="profile-identity-copy">
        <p class="eyebrow">Ironkin Member Profile</p>
        <h1>${profileEscapeHtml(profile.displayName)}</h1>
        <div class="profile-meta-row">
          <span>RSN: ${profileEscapeHtml(profile.rsn)}</span>
          <span>Rank: ${profileEscapeHtml(profile.rank)}</span>
          <span>Member Since: ${profileFormatDate(profile.memberSince)}</span>
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
        WOM stats could not be loaded for <strong>${profileEscapeHtml(profile.rsn)}</strong>.
        <br />${profileEscapeHtml(wom.error || "Make sure the Discord server nickname matches the RSN.")}
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
      <strong>${wom.combatLevel || "—"}</strong>
    </div>
    <div class="profile-stat-card">
      <span>Overall Rank</span>
      <strong>${wom.overallRank ? profileFormatNumber(wom.overallRank) : "—"}</strong>
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

function renderProfile(profile) {
  currentProfile = profile;
  const grid = document.getElementById("profileGrid");
  if (grid) grid.style.display = "grid";

  renderProfileHero(profile);
  renderWomStats(profile);
  renderEmbers(profile);
  renderEventRecord(profile);
  populateProfileForm(profile);
}

async function loadProfile() {
  const hero = document.getElementById("profileHero");

  try {
    const response = await fetch(`/api/profile?t=${Date.now()}`, { cache: "no-store" });
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
  loadProfile();
});
