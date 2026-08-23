function toggleMenu() {
  const navLinks = document.getElementById("navLinks");

  if (navLinks) {
    navLinks.classList.toggle("show");
  }
}

const NAV_STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

function isStaffUser(user) {
  return Boolean(
    user?.roles?.some(roleId => NAV_STAFF_ROLE_IDS.includes(roleId))
  );
}

async function getCurrentAuthUser() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();

    return data.signedIn ? data.user : null;
  } catch {
    return null;
  }
}

function isEventActive(event) {
  return event?.active === true;
}

function hasUsableWomCompetition(event) {
  const id = String(event?.womCompetitionId || "").trim();
  return Boolean(id && id !== "PUT_YOUR_WOM_ID_HERE");
}

function hasLiveFeaturedData(event) {
  if (!isEventActive(event)) return false;

  if (hasUsableWomCompetition(event)) return true;

  if (String(event?.type || "").includes("clan-goal")) {
    return Boolean(Number(event?.target || 0) > 0);
  }

  return false;
}

function getUnifiedEventType(event) {
  return String(event?.eventType || event?.type || event?.category || "").toLowerCase();
}

function getEventStartTime(event) {
  const value = event?.start || event?.startDate || event?.date || "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function getEventEndTime(event) {
  const value = event?.end || event?.endDate || event?.start || event?.startDate || event?.date || "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function isEventCurrentlyActiveByDates(event, now = Date.now()) {
  if (isEventActive(event)) return true;
  const start = getEventStartTime(event);
  const end = getEventEndTime(event);
  return start !== null && end !== null && start <= now && end >= now;
}

function isEventUpcomingByDates(event, now = Date.now()) {
  const start = getEventStartTime(event);
  return start !== null && start > now;
}

function featuredPriorityScore(event, now = Date.now()) {
  const type = getUnifiedEventType(event);
  const active = isEventCurrentlyActiveByDates(event, now);
  const upcoming = isEventUpcomingByDates(event, now);

  if (active && type.includes("clan-goal")) return 1;
  if (active && type === "botw") return 2;
  if (active && type === "sotw") return 3;
  if (upcoming && type.includes("clan-goal")) return 4;
  if (upcoming && type === "botw") return 5;
  if (upcoming && type === "sotw") return 6;
  if (upcoming && (type === "mass" || type === "clan-mass")) return 7;
  if (upcoming && type === "giveaway") return 8;
  if (upcoming) return 9;
  return 99;
}

function chooseFeaturedEvent(events) {
  const list = (Array.isArray(events) ? events : [])
    .filter(event => event && String(event.status || "").toLowerCase() !== "cancelled");

  const manual = list.find(event => event.featured === true);
  if (manual) return manual;

  return list
    .slice()
    .sort((a, b) => {
      const scoreDiff = featuredPriorityScore(a) - featuredPriorityScore(b);
      if (scoreDiff !== 0) return scoreDiff;

      const aStart = getEventStartTime(a) ?? Number.MAX_SAFE_INTEGER;
      const bStart = getEventStartTime(b) ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    })[0] || null;
}

function isClanGoalEvent(event) {
  const type = getUnifiedEventType(event);
  return type.includes("clan-goal") || type === "clan_goal";
}

function getBotwTierLabel(event) {
  if (event?.botwTier === "elite" || event?.id === "botw-elite") return "Elite";
  if (event?.botwTier === "standard" || event?.id === "botw-standard") return "Standard";
  return "";
}

function isBotwEvent(event) {
  return event?.type === "botw" || String(event?.id || "").startsWith("botw-");
}

function getEventPageHref(event) {
  if (isClanGoalEvent(event)) return "event.html?id=clan-goal";
  if (isBotwEvent(event)) return "event.html?id=botw-current";
  return `event.html?id=${encodeURIComponent(event?.id || "")}`;
}

function formatInactiveEventTitle(event) {
  if (String(event?.type || "").includes("clan-goal")) {
    return "";
  }

  return displayEventTitle(event?.title, event?.type);
}

function formatInactiveEventDescription(event) {
  if (String(event?.type || "").includes("clan-goal")) {
    return "";
  }

  return event?.description || "";
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString("en-US");
}

function getTimeRemaining(endDate) {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end - now;

  if (diff <= 0) return "Ended";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${hours}h`;
}

function getCountdownToStart(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const diff = start - now;

  if (!Number.isFinite(start.getTime())) return "Soon";
  if (diff <= 0) return "Started";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isBeforeEventStart(standings, event) {
  const startValue = standings?.startsAt || event?.startDate || event?.start;
  if (!startValue) return false;
  const start = new Date(startValue);
  return Number.isFinite(start.getTime()) && Date.now() < start.getTime();
}


function eventTracksXp(event, standings = null) {
  if (event?.type === "sotw") return true;
  if (event?.type === "botw") return false;

  const isClanGoal =
    event?.type === "clan-goal" ||
    event?.type === "clan-goal-boss" ||
    event?.type === "clan-goal-skill" ||
    event?.type === "clan_goal";

  if (!isClanGoal) return false;
  if (event?.goalKind === "skill-xp" || event?.type === "clan-goal-skill") return true;
  if (event?.goalKind === "boss-kc" || event?.type === "clan-goal-boss") return false;

  const skillMetricNames = new Set([
    "attack", "strength", "defence", "ranged", "prayer", "magic",
    "runecrafting", "construction", "hitpoints", "agility", "herblore",
    "thieving", "crafting", "fletching", "slayer", "hunter", "mining",
    "smithing", "fishing", "cooking", "firemaking", "woodcutting", "farming"
  ]);
  const metric = String(event?.womMetric || event?.metric || standings?.metric || "").toLowerCase();
  return skillMetricNames.has(metric);
}

function getEventMetricLabel(event, standings = null) {
  if (eventTracksXp(event, standings)) return "XP";
  if (event?.type === "botw" || event?.type?.includes("clan-goal") || event?.type === "clan_goal") return "KC";
  return "Gained";
}

function getDefaultRewards(event) {
  if (event?.type === "bounties" || event?.id === "bounties") {
    return { placement: [], participation: [] };
  }

  if (event?.type?.includes("clan-goal")) {
    return {
      placement: [
        { label: "25%", reward: "Clan Mass" },
        { label: "50%", reward: "Bond Giveaway" },
        { label: "75%", reward: "Bonus Embers" },
        { label: "100%", reward: "Bond Giveaway" }
      ],
      participation: []
    };
  }

  if (event?.type === "botw") {
    return {
      placement: [
        { label: "🥇 1st Place", reward: "75 Embers + BOTW Rank" },
        { label: "🥈 2nd Place", reward: "50 Embers" },
        { label: "🥉 3rd Place", reward: "35 Embers" }
      ],
      participation: [
        { requirement: "High Tier", reward: "Participation Embers vary by boss" },
        { requirement: "Low Tier", reward: "Participation Embers vary by boss" }
      ]
    };
  }

  return {
    placement: [
      { label: "🥇 1st Place", reward: "50 Embers + SOTW Rank" },
      { label: "🥈 2nd Place", reward: "40 Embers" },
      { label: "🥉 3rd Place", reward: "35 Embers" }
    ],
    participation: [
      { requirement: "1250K XP", reward: "30 Embers" },
      { requirement: "750K XP", reward: "20 Embers" },
      { requirement: "300K XP", reward: "10 Embers" }
    ]
  };
}

function getEventRewards(event) {
  const fallback = getDefaultRewards(event);
  const rewards = event?.rewards || {};

  return {
    placement: Array.isArray(rewards.placement) && rewards.placement.length
      ? rewards.placement
      : fallback.placement,
    participation: Array.isArray(rewards.participation) && rewards.participation.length
      ? rewards.participation
      : fallback.participation
  };
}

function getCompetitionStats(event, standings) {
  const rows = standings?.standings || [];
  const activeRows = rows.filter(player => Number(player.gained || 0) > 0);
  const activeCount = standings?.contributors || activeRows.length || 0;
  const totalGained = Number(standings?.totalGained || 0);
  const topFiveCombined = activeRows
    .slice(0, 5)
    .reduce((sum, player) => sum + Number(player.gained || 0), 0);
  const leader = Number(activeRows[0]?.gained || 0);
  const second = Number(activeRows[1]?.gained || 0);
  const leaderAdvantage = Math.max(leader - second, 0);
  const tracksXp = eventTracksXp(event, standings);
  const densityThreshold = tracksXp ? 100000 : 10;
  const densityCount = activeRows.filter(player => Number(player.gained || 0) >= densityThreshold).length;
  const density = activeCount ? Math.round((densityCount / activeCount) * 100) : 0;
  const metricLabel = getEventMetricLabel(event, standings);

  return {
    average: activeCount ? Math.round(totalGained / activeCount) : 0,
    topFiveCombined,
    leaderAdvantage,
    density,
    densityLabel: tracksXp ? "100K+ XP" : "10+ KC",
    metricLabel
  };
}

function renderCompetitionStats(event, standings) {
  if (!standings) {
    return `
      <section class="event-panel">
        <h2>Competition Stats</h2>
        <p>No WOM competition data is available yet.</p>
      </section>
    `;
  }

  const stats = getCompetitionStats(event, standings);

  return `
    <section class="event-panel">
      <h2>Competition Stats</h2>

      <div class="competition-stat-list">
        <div>
          <span>Average ${stats.metricLabel} per Competitor</span>
          <strong>${formatNumber(stats.average)}</strong>
        </div>

        <div>
          <span>Top 5 Combined ${stats.metricLabel}</span>
          <strong>${formatNumber(stats.topFiveCombined)}</strong>
        </div>

        <div>
          <span>Leader Advantage</span>
          <strong>${formatNumber(stats.leaderAdvantage)}</strong>
        </div>

        <div>
          <span>Competition Density</span>
          <strong>${stats.density}%</strong>
          <small>${stats.densityLabel}</small>
        </div>
      </div>
    </section>
  `;
}

function renderDropsPanel(listId = "dropsList") {
  return `
    <section class="event-panel">
      <h2>Unique Drops Received</h2>
      <p>Drops tracked throughout this event.</p>
      <div id="${escapeHtml(listId)}" class="drops-list"></div>
    </section>
  `;
}

function renderRewardsSection(event) {
  // Bounties reward each submitted item directly and never use event placement/participation rewards.
  if (event?.type === "bounties" || event?.id === "bounties") return "";

  const rewards = getEventRewards(event);
  const hasPlacement = rewards.placement.length > 0;
  const hasParticipation = rewards.participation.length > 0;

  if (!hasPlacement && !hasParticipation) {
    return "";
  }

  return `
    <section class="event-rewards-card">
      <div class="event-rewards-header">
        <p class="eyebrow">Event Rewards</p>
        <h2>Rewards</h2>
      </div>

      <div class="event-rewards-grid">
        <div class="reward-panel">
          <h3>Placement Rewards</h3>

          ${
            hasPlacement
              ? rewards.placement.map(item => `
                  <div class="reward-row">
                    <strong>${item.label || "Placement"}</strong>
                    <span>${item.reward || ""}</span>
                  </div>
                `).join("")
              : `<p>No placement rewards listed.</p>`
          }
        </div>

        <div class="reward-panel">
          <h3>Participation Embers</h3>

          ${
            hasParticipation
              ? rewards.participation.map(item => `
                  <div class="reward-row">
                    <strong>${item.requirement || "Requirement"}</strong>
                    <span>${item.reward || ""}</span>
                  </div>
                `).join("")
              : `<p>No participation rewards listed.</p>`
          }
        </div>
      </div>
    </section>
  `;
}


function displayEventTitle(title, type) {
  const rawTitle = String(title || "Event").trim();

  if (String(type || "").includes("clan-goal")) {
    return rawTitle.replace(/^Clan Goal\s*-\s*/i, "").trim() || rawTitle;
  }

  return rawTitle;
}

function formatEventType(type) {
  const labels = {
    sotw: "SOTW",
    botw: "BOTW",
    "clan-goal-boss": "Clan Goal",
    "clan-goal-skill": "Clan Goal",
    clan_goal: "Clan Goal",
    "clan-goal": "Clan Goal",
    bounties: "Bounties"
  };

  return labels[type] || String(type || "Event").toUpperCase();
}

function getEventIcon(type) {
  const icons = {
    sotw: "📊",
    botw: "☠️",
    "clan-goal-boss": "🔥",
    "clan-goal-skill": "🔥",
    clan_goal: "🔥",
    "clan-goal": "🔥",
    bounties: "🎯"
  };

  return icons[type] || "🔥";
}

async function fetchCurrentEvents() {
  const response = await fetch(`/api/current-events?t=${Date.now()}`, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load current events.");
  }

  return data.events || [];
}

async function fetchEventStandings(event) {
  if (!event.womCompetitionId || event.womCompetitionId === "PUT_YOUR_WOM_ID_HERE") {
    return null;
  }

  const response = await fetch(
    `/api/event-standings?competitionId=${event.womCompetitionId}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load WOM standings.");
  }

  return data;
}


function escapeNavSearchHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setupMemberSearch() {
  const searchWrap = document.getElementById("navMemberSearch");
  const input = document.getElementById("navMemberSearchInput");
  const results = document.getElementById("navMemberSearchResults");

  if (!searchWrap || !input || !results || searchWrap.dataset.ready === "true") return;

  searchWrap.dataset.ready = "true";
  let searchTimer = null;

  function hideResults() {
    results.style.display = "none";
    results.innerHTML = "";
  }

  async function runSearch(query) {
    const q = String(query || "").trim();

    if (q.length < 2) {
      hideResults();
      return;
    }

    results.style.display = "block";
    results.innerHTML = `<div class="nav-member-search-empty">Searching...</div>`;

    try {
      const response = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}&t=${Date.now()}`, {
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }

      const items = Array.isArray(data.results) ? data.results : [];

      if (!items.length) {
        results.innerHTML = `<div class="nav-member-search-empty">No members found.</div>`;
        return;
      }

      results.innerHTML = items.map(item => `
        <a class="nav-member-search-result" href="${escapeNavSearchHtml(item.profileUrl || "profile.html")}">
          <img src="${escapeNavSearchHtml(item.avatarUrl || "assets/ironkin-emblem.png")}" alt="" />
          <span>
            <strong>${escapeNavSearchHtml(item.displayName || "Unknown member")}</strong>
            <small>${escapeNavSearchHtml(item.staffRank || item.rank || "Member")}</small>
          </span>
        </a>
      `).join("");
    } catch {
      results.innerHTML = `<div class="nav-member-search-empty">Could not search members.</div>`;
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value), 250);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) runSearch(input.value);
  });

  document.addEventListener("click", event => {
    if (!searchWrap.contains(event.target)) {
      hideResults();
    }
  });
}



const GLOBAL_SEARCH_ROUTES = [
  { title: "Home", subtitle: "Ironkin dashboard", href: "/index.html", keywords: "home dashboard clan" },
  { title: "Events", subtitle: "Active and upcoming clan events", href: "/events.html", keywords: "events botw sotw clan goal bounty bingo" },
  { title: "Calendar", subtitle: "Clan schedule", href: "/calendar.html", keywords: "calendar schedule upcoming" },
  { title: "Hall of Flame", subtitle: "Champions and historic achievements", href: "/hall-of-flame.html", keywords: "hall flame winners champions" },
  { title: "Archive", subtitle: "Past event results", href: "/archive.html", keywords: "archive past events results" },
  { title: "Records", subtitle: "Ironkin records", href: "/records.html", keywords: "records stats wins" },
  { title: "Ranks", subtitle: "Clan progression and ranks", href: "/ranks.html", keywords: "ranks progression prestige" },
  { title: "Ember Shop", subtitle: "Spend your Embers", href: "/shop.html", keywords: "shop embers rewards tickets" },
  { title: "Ember Leaderboard", subtitle: "Top Ember balances", href: "/ember-leaderboard.html", keywords: "embers leaderboard rankings" },
  { title: "Rules", subtitle: "Community rules and expectations", href: "/rules.html", keywords: "rules moderation guidelines" },
  { title: "Giveaways", subtitle: "Clan giveaways", href: "/giveaways.html", keywords: "giveaways kc guess" },
  { title: "My Profile", subtitle: "Member profile and RuneLite settings", href: "/profile.html", keywords: "profile member runelite api key" }
];

function ensureGlobalSearchPalette() {
  let palette = document.getElementById("globalSearchPalette");
  if (palette) return palette;

  palette = document.createElement("div");
  palette.id = "globalSearchPalette";
  palette.className = "global-search-overlay";
  palette.setAttribute("aria-hidden", "true");
  palette.innerHTML = `
    <div class="global-search-dialog" role="dialog" aria-modal="true" aria-label="Search Ironkin">
      <div class="global-search-input-row">
        <span>⌕</span>
        <input id="globalSearchInput" type="search" placeholder="Search Ironkin..." autocomplete="off" />
        <kbd>Esc</kbd>
      </div>
      <div id="globalSearchResults" class="global-search-results"></div>
      <div class="global-search-footer"><span>Search pages and members</span><span>Ctrl / Cmd + K</span></div>
    </div>
  `;
  document.body.appendChild(palette);
  return palette;
}

function setupGlobalSearch() {
  const trigger = document.getElementById("navGlobalSearchTrigger");
  const palette = ensureGlobalSearchPalette();
  const input = palette.querySelector("#globalSearchInput");
  const results = palette.querySelector("#globalSearchResults");
  if (!input || !results || palette.dataset.ready === "true") return;
  palette.dataset.ready = "true";
  let timer = null;

  const renderPages = query => {
    const q = query.toLowerCase().trim();
    const pages = GLOBAL_SEARCH_ROUTES.filter(item => !q || `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase().includes(q)).slice(0, 6);
    return pages.map(item => `
      <a class="global-search-result" href="${item.href}">
        <span class="global-search-result-icon">↗</span>
        <span><strong>${escapeNavSearchHtml(item.title)}</strong><small>${escapeNavSearchHtml(item.subtitle)}</small></span>
        <em>Page</em>
      </a>
    `).join("");
  };

  async function runGlobalSearch(query) {
    const q = String(query || "").trim();
    const pageHtml = renderPages(q);
    if (q.length < 2) {
      results.innerHTML = `<div class="global-search-section-label">Quick links</div>${pageHtml}`;
      return;
    }

    results.innerHTML = `<div class="global-search-section-label">Pages</div>${pageHtml || '<div class="global-search-empty">No matching pages.</div>'}<div class="global-search-section-label">Members</div><div class="global-search-empty">Searching members...</div>`;

    try {
      const response = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}&t=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const members = response.ok && Array.isArray(data.results) ? data.results : [];
      const emptyMessage = response.status === 401
        ? "Sign in to search member profiles."
        : (data.syncWarning ? escapeNavSearchHtml(data.syncWarning) : "No matching members.");
      const memberHtml = members.length ? members.slice(0, 6).map(item => `
        <a class="global-search-result global-search-member" href="${escapeNavSearchHtml(item.profileUrl || "/profile.html")}">
          <img src="${escapeNavSearchHtml(item.avatarUrl || "/assets/ironkin-emblem.png")}" alt="" />
          <span><strong>${escapeNavSearchHtml(item.displayName || "Unknown member")}</strong><small>${escapeNavSearchHtml(item.staffRank || item.rank || "Ironkin member")}</small></span>
          <em>Member</em>
        </a>
      `).join("") : `<div class="global-search-empty">${emptyMessage}</div>`;
      results.innerHTML = `<div class="global-search-section-label">Pages</div>${pageHtml || '<div class="global-search-empty">No matching pages.</div>'}<div class="global-search-section-label">Members</div>${memberHtml}`;
    } catch {
      results.innerHTML = `<div class="global-search-section-label">Pages</div>${pageHtml}<div class="global-search-section-label">Members</div><div class="global-search-empty">Member search is temporarily unavailable.</div>`;
    }
  }

  function openSearch() {
    palette.classList.add("is-open");
    palette.setAttribute("aria-hidden", "false");
    document.body.classList.add("search-open");
    input.value = "";
    runGlobalSearch("");
    requestAnimationFrame(() => input.focus());
  }

  function closeSearch() {
    palette.classList.remove("is-open");
    palette.setAttribute("aria-hidden", "true");
    document.body.classList.remove("search-open");
  }

  trigger?.addEventListener("click", openSearch);
  palette.addEventListener("click", event => { if (event.target === palette) closeSearch(); });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => runGlobalSearch(input.value), 180);
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      palette.classList.contains("is-open") ? closeSearch() : openSearch();
    } else if (event.key === "Escape" && palette.classList.contains("is-open")) {
      closeSearch();
    }
  });
}

async function loadDiscordUser() {
  const loginBtn = document.getElementById("discordLoginBtn");
  const logoutBtn = document.getElementById("discordLogoutBtn");
  const adminNavLink = document.getElementById("adminNavLink");
  const staffHandbookNavLink = document.getElementById("staffHandbookNavLink");
  const profileNavLink = document.getElementById("profileNavLink");

  if (!loginBtn) return;

  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();

    if (!data.signedIn) return;

    loginBtn.textContent = "View Profile";
    loginBtn.href = "profile.html";

    if (data.user.inGuild) {
      loginBtn.title = "View your Ironkin member profile";
    }

    setupGlobalSearch();

    if (profileNavLink) {
      profileNavLink.style.display = "none";
    }

    if (isStaffUser(data.user)) {
      if (staffHandbookNavLink) staffHandbookNavLink.style.display = "inline-block";
      if (adminNavLink) adminNavLink.style.display = "inline-block";
    }

    if (logoutBtn) {
      logoutBtn.style.display = "inline-block";
    }
  } catch {
    // Leave sign-in button as-is if auth check fails
  }
}

async function loadSiteNav() {
  const navMount = document.getElementById("siteNav");

  if (!navMount) {
    loadDiscordUser();
    return;
  }

  try {
    const response = await fetch("/nav.html?v=20260807-premium-v4", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Could not load navigation.");
    }

    navMount.innerHTML = await response.text();
    setupGlobalSearch();
    loadDiscordUser();
  } catch {
    navMount.innerHTML = "";
  }
}

function renderHomeLastEventResult(entry) {
  const eventPercent = document.getElementById("homeEventPercent");
  const eventTitle = document.getElementById("homeEventTitle");
  const eventMeta = document.getElementById("homeEventMeta");
  const topThree = document.getElementById("homeTopThree");
  const featuredStats = document.getElementById("homeFeaturedStats");
  const homeTotalGained = document.getElementById("homeTotalGained");
  const homeClanXp = document.getElementById("homeClanXp");

  const winner = getArchiveWinner(entry);
  const metric = getEventMetricLabel(entry);
  const dateText = entry?.endedAt
    ? new Date(entry.endedAt).toLocaleDateString("en-US")
    : entry?.endDate
      ? new Date(entry.endDate).toLocaleDateString("en-US")
      : "Completed";

  if (eventPercent) eventPercent.textContent = `Previous ${formatEventType(entry?.type || "event")}`;
  if (eventTitle) eventTitle.textContent = displayEventTitle(entry?.title || "Previous Event", entry?.type);
  if (eventMeta) eventMeta.textContent = `${dateText} • Final Results`;
  if (homeTotalGained) homeTotalGained.textContent = winner ? formatNumber(winner.gained) : "Results";
  if (homeClanXp) homeClanXp.textContent = winner ? `${formatNumber(winner.gained)} ${metric}` : "Last Results";

  if (featuredStats) {
    featuredStats.innerHTML = `
      <div class="featured-stat">
        <strong>${winner ? escapeHtml(winner.name) : "-"}</strong>
        <span>Winner</span>
      </div>

      <div class="featured-stat">
        <strong>${winner ? formatNumber(winner.gained) : "0"}</strong>
        <span>Winning ${metric}</span>
      </div>

      <div class="featured-stat">
        <strong>${dateText}</strong>
        <span>Archived</span>
      </div>
    `;
  }

  if (topThree) {
    const rows = entry?.topFive?.length ? entry.topFive : entry?.leaderboard || [];
    topThree.innerHTML = rows.length
      ? rows.slice(0, 3).map((player, index) => `
          <div>
            <strong>#${index + 1} ${escapeHtml(player.name)}</strong>
            <span>${formatNumber(player.gained)} ${metric}</span>
          </div>
        `).join("")
      : "No leaderboard snapshot available.";
  }
}

let homeFeaturedRotationTimer = null;
let homeFeaturedRotationIndex = 0;
let homeFeaturedRotationItems = [];

function getHomeFeaturedCandidates(events) {
  return (Array.isArray(events) ? events : [])
    .filter(event => event && String(event.status || "").toLowerCase() !== "cancelled")
    .filter(event => {
      // Bounties are manual-only: they should appear on the homepage only when
      // staff explicitly marks the bounty board Active in Admin.
      if (event?.type === "bounties" || event?.id === "bounties") {
        return event.active === true;
      }
      return hasLiveFeaturedData(event) || isEventCurrentlyActiveByDates(event) || isEventUpcomingByDates(event);
    })
    .sort((a, b) => {
      const scoreDiff = featuredPriorityScore(a) - featuredPriorityScore(b);
      if (scoreDiff !== 0) return scoreDiff;

      const tierA = getBotwTierLabel(a) === "Elite" ? 0 : getBotwTierLabel(a) === "Standard" ? 1 : 2;
      const tierB = getBotwTierLabel(b) === "Elite" ? 0 : getBotwTierLabel(b) === "Standard" ? 1 : 2;
      if (tierA !== tierB) return tierA - tierB;

      const aStart = getEventStartTime(a) ?? Number.MAX_SAFE_INTEGER;
      const bStart = getEventStartTime(b) ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    });
}

function setHomeFeaturedControls(items, activeIndex) {
  const controls = document.getElementById("homeFeaturedControls");
  if (!controls) return;

  if (!Array.isArray(items) || items.length <= 1) {
    controls.innerHTML = "";
    return;
  }

  controls.innerHTML = `
    <button type="button" class="featured-rotation-arrow" data-featured-rotation="prev" aria-label="Previous featured event">‹</button>
    <div class="featured-rotation-dots" aria-label="Featured event slides">
      ${items.map((item, index) => `
        <button
          type="button"
          class="featured-rotation-dot${index === activeIndex ? " is-active" : ""}"
          data-featured-rotation-index="${index}"
          aria-label="Show ${escapeHtml(item.event.label || item.event.title || `event ${index + 1}`)}"
        ></button>
      `).join("")}
    </div>
    <button type="button" class="featured-rotation-arrow" data-featured-rotation="next" aria-label="Next featured event">›</button>
  `;

  controls.querySelectorAll("[data-featured-rotation]").forEach(button => {
    button.addEventListener("click", () => {
      const direction = button.getAttribute("data-featured-rotation");
      const nextIndex = direction === "prev"
        ? (homeFeaturedRotationIndex - 1 + homeFeaturedRotationItems.length) % homeFeaturedRotationItems.length
        : (homeFeaturedRotationIndex + 1) % homeFeaturedRotationItems.length;
      renderHomeFeaturedRotationItem(nextIndex, true);
    });
  });

  controls.querySelectorAll("[data-featured-rotation-index]").forEach(button => {
    button.addEventListener("click", () => {
      renderHomeFeaturedRotationItem(Number(button.getAttribute("data-featured-rotation-index")), true);
    });
  });
}

function restartHomeFeaturedRotation() {
  if (homeFeaturedRotationTimer) {
    clearInterval(homeFeaturedRotationTimer);
    homeFeaturedRotationTimer = null;
  }

  if (homeFeaturedRotationItems.length <= 1) return;

  homeFeaturedRotationTimer = setInterval(() => {
    const nextIndex = (homeFeaturedRotationIndex + 1) % homeFeaturedRotationItems.length;
    renderHomeFeaturedRotationItem(nextIndex, false);
  }, 8000);
}


function updateHomeFeaturedProgress(event, standings) {
  const bar = document.getElementById("homeFeaturedProgress");
  if (!bar) return;
  const start = getEventStartTime({ ...event, start: standings?.startsAt || event?.start || event?.startDate });
  const end = getEventEndTime({ ...event, end: standings?.endsAt || event?.end || event?.endDate });
  let percent = 0;

  if (isClanGoalEvent(event) && Number(event?.target || 0) > 0 && Number(standings?.totalGained || 0) >= 0) {
    percent = Math.min(100, Math.max(0, (Number(standings?.totalGained || 0) / Number(event.target)) * 100));
  } else if (start !== null && end !== null && end > start) {
    percent = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  }

  bar.style.width = `${percent.toFixed(1)}%`;
}

function renderHomeFeaturedRotationItem(index = 0, resetTimer = false) {
  if (!homeFeaturedRotationItems.length) return;

  homeFeaturedRotationIndex = Math.max(0, Math.min(index, homeFeaturedRotationItems.length - 1));
  const item = homeFeaturedRotationItems[homeFeaturedRotationIndex];
  const featuredEvent = item.event;
  const standings = item.standings;

  const eventPercent = document.getElementById("homeEventPercent");
  const eventTitle = document.getElementById("homeEventTitle");
  const eventMeta = document.getElementById("homeEventMeta");
  const topThree = document.getElementById("homeTopThree");
  const featuredStats = document.getElementById("homeFeaturedStats");
  const homeTotalGained = document.getElementById("homeTotalGained");
  const homeTotalGainedLabel = document.getElementById("homeTotalGainedLabel");
  const homeClanXp = document.getElementById("homeClanXp");
  const featuredLink = document.getElementById("homeFeaturedLink");

  const eventHasNotStarted = isBeforeEventStart(standings, featuredEvent);
  const typeLabel = featuredEvent.label || formatEventType(featuredEvent.type);
  const title = displayEventTitle(standings?.title || featuredEvent.title || typeLabel, featuredEvent.type);

  if (eventPercent) eventPercent.textContent = typeLabel;
  if (eventTitle) eventTitle.textContent = title;
  if (featuredLink) featuredLink.href = getEventPageHref(featuredEvent);
  updateHomeFeaturedProgress(featuredEvent, standings);

  // Bounties are drop-based, not WOM-based. Render aggregate bounty counts
  // instead of WOM standings/competitor language.
  if (featuredEvent?.type === "bounties" || featuredEvent?.id === "bounties") {
    const drops = Array.isArray(item.bountyDrops) ? item.bountyDrops : [];
    const totalCompleted = drops.reduce((sum, drop) => sum + Number(drop?.count || 0), 0);
    const completedDrops = drops
      .filter(drop => Number(drop?.count || 0) > 0)
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));

    if (eventMeta) eventMeta.textContent = featuredEvent.description || "Complete selected bounty drops to earn Embers.";
    if (homeTotalGained) homeTotalGained.textContent = formatNumber(totalCompleted);
    if (homeTotalGainedLabel) homeTotalGainedLabel.textContent = "Bounties Completed";
    if (homeClanXp) homeClanXp.textContent = `${formatNumber(totalCompleted)} completed`;
    if (featuredStats) {
      featuredStats.innerHTML = `
        <div class="featured-stat">
          <strong>${formatNumber(drops.length)}</strong>
          <span>Bounty Items</span>
        </div>
        <div class="featured-stat">
          <strong>${formatNumber(completedDrops.length)}</strong>
          <span>Items Completed</span>
        </div>
        <div class="featured-stat">
          <strong>${formatNumber(totalCompleted)}</strong>
          <span>Total Drops</span>
        </div>
      `;
    }
    if (topThree) {
      topThree.innerHTML = "";
      if (completedDrops.length) {
        completedDrops.slice(0, 3).forEach((drop, dropIndex) => {
          const div = document.createElement("div");
          div.innerHTML = `<strong>#${dropIndex + 1} ${escapeHtml(drop.name)}</strong><span>${formatNumber(drop.count)} completed</span>`;
          topThree.appendChild(div);
        });
      } else {
        topThree.textContent = "No bounty drops completed yet.";
      }
    }
    setHomeFeaturedControls(homeFeaturedRotationItems, homeFeaturedRotationIndex);
    if (resetTimer) restartHomeFeaturedRotation();
    return;
  }

  if (eventHasNotStarted) {
    const startText = getCountdownToStart(standings?.startsAt || featuredEvent.startDate || featuredEvent.start);

    if (eventMeta) {
      eventMeta.textContent = standings?.startsAt
        ? `Starts ${new Date(standings.startsAt).toLocaleString("en-US")}`
        : "Tracking will begin once the event starts.";
    }
    if (homeTotalGained) homeTotalGained.textContent = "Event Starting Soon";
    if (homeTotalGainedLabel) homeTotalGainedLabel.textContent = "";
    if (homeClanXp) homeClanXp.textContent = `Starts in ${startText}`;
    if (featuredStats) {
      featuredStats.innerHTML = `
        <div class="featured-stat featured-stat-countdown">
          <strong>${startText}</strong>
          <span>Until Start</span>
        </div>
      `;
    }
    if (topThree) topThree.innerHTML = "";
    setHomeFeaturedControls(homeFeaturedRotationItems, homeFeaturedRotationIndex);
    if (resetTimer) restartHomeFeaturedRotation();
    return;
  }

  if (eventMeta) {
    eventMeta.textContent = standings?.endsAt
      ? `${standings.metric || "Competition"} • Ends ${new Date(standings.endsAt).toLocaleDateString("en-US")}`
      : featuredEvent.description || "Event details coming soon.";
  }

  if (standings) {
    const topPlayer = standings.standings?.[0];
    const timeRemaining = standings.endsAt ? getTimeRemaining(standings.endsAt) : "TBD";

    if (homeTotalGained) homeTotalGained.textContent = formatNumber(standings.totalGained);
    if (homeTotalGainedLabel) homeTotalGainedLabel.textContent = "Total Gained";
    if (homeClanXp) homeClanXp.textContent = `${formatNumber(standings.totalGained)} gained`;
    if (featuredStats) {
      featuredStats.innerHTML = `
        <div class="featured-stat">
          <strong>${formatNumber(standings.contributors || 0)}</strong>
          <span>Active Participants</span>
        </div>
        <div class="featured-stat">
          <strong>${timeRemaining}</strong>
          <span>Time Remaining</span>
        </div>
        <div class="featured-stat">
          <strong>${topPlayer ? formatNumber(topPlayer.gained) : "0"}</strong>
          <span>Top Gain</span>
        </div>
      `;
    }
    if (topThree) {
      topThree.innerHTML = "";
      if (standings.standings?.length) {
        standings.standings.slice(0, 3).forEach((player, playerIndex) => {
          const div = document.createElement("div");
          div.innerHTML = `<strong>#${playerIndex + 1} ${escapeHtml(player.name)}</strong><span>${formatNumber(player.gained)} gained</span>`;
          topThree.appendChild(div);
        });
      } else {
        topThree.textContent = "No standings yet.";
      }
    }
  } else {
    if (homeTotalGained) homeTotalGained.textContent = "-";
    if (homeTotalGainedLabel) homeTotalGainedLabel.textContent = "Total Gained";
    if (homeClanXp) homeClanXp.textContent = featuredEvent.target ? `${formatNumber(featuredEvent.target)} goal` : "Coming Soon";
    if (featuredStats) featuredStats.innerHTML = "";
    if (topThree) topThree.textContent = "No WOM competition linked yet.";
  }

  setHomeFeaturedControls(homeFeaturedRotationItems, homeFeaturedRotationIndex);
  if (resetTimer) restartHomeFeaturedRotation();
}

async function loadHomeStats() {
  const homeClanXp = document.getElementById("homeClanXp");

  try {
    const events = await fetchCurrentEvents();
    const featuredCandidates = getHomeFeaturedCandidates(events);

    if (!featuredCandidates.length) {
      const archive = await fetchArchive().catch(() => []);
      const latestResult = archive[0];

      if (latestResult) {
        renderHomeLastEventResult(latestResult);
        return;
      }

      if (homeClanXp) homeClanXp.textContent = "No Active Event";

      const eventTitle = document.getElementById("homeEventTitle");
      const eventMeta = document.getElementById("homeEventMeta");
      const topThree = document.getElementById("homeTopThree");
      const featuredStats = document.getElementById("homeFeaturedStats");
      const homeTotalGained = document.getElementById("homeTotalGained");
      const homeTotalGainedLabel = document.getElementById("homeTotalGainedLabel");
      const controls = document.getElementById("homeFeaturedControls");

      if (eventTitle) eventTitle.textContent = "No active event";
      if (eventMeta) eventMeta.textContent = "No previous results found yet.";
      if (topThree) topThree.textContent = "Archive an event to show its final results here.";
      if (featuredStats) featuredStats.innerHTML = "";
      if (homeTotalGained) homeTotalGained.textContent = "-";
      if (homeTotalGainedLabel) homeTotalGainedLabel.textContent = "Total Gained";
      if (controls) controls.innerHTML = "";
      return;
    }

    const standingsList = await Promise.all(
      featuredCandidates.map(event => {
        if (event?.type === "bounties" || event?.id === "bounties") return Promise.resolve(null);
        return fetchEventStandings(event).catch(() => null);
      })
    );

    const bountyDropsList = await Promise.all(
      featuredCandidates.map(async event => {
        if (event?.type !== "bounties" && event?.id !== "bounties") return null;
        try {
          const response = await fetch(`/api/drops/list?eventId=bounties&t=${Date.now()}`, { cache: "no-store" });
          const data = await response.json();
          return response.ok ? (data.drops || []) : [];
        } catch {
          return [];
        }
      })
    );

    homeFeaturedRotationItems = featuredCandidates.map((event, index) => ({
      event,
      standings: standingsList[index],
      bountyDrops: bountyDropsList[index]
    }));

    renderHomeFeaturedRotationItem(0, false);
    restartHomeFeaturedRotation();

    const womResponse = await fetch("https://api.wiseoldman.net/v2/groups/12095");
    const womData = await womResponse.json();

    if (womResponse.ok) {
      const homeClanMembers = document.getElementById("homeClanMembers");
      if (homeClanMembers) homeClanMembers.textContent = womData.memberCount || womData.members?.length || "0";
    }
  } catch (error) {
    if (homeClanXp) homeClanXp.textContent = "Unavailable";

    const eventPercent = document.getElementById("homeEventPercent");
    const eventTitle = document.getElementById("homeEventTitle");
    const eventMeta = document.getElementById("homeEventMeta");
    const topThree = document.getElementById("homeTopThree");
    const controls = document.getElementById("homeFeaturedControls");

    if (eventPercent) eventPercent.textContent = "Unavailable";
    if (eventTitle) eventTitle.textContent = "Could not load event";
    if (eventMeta) eventMeta.textContent = error.message;
    if (topThree) topThree.textContent = "No competitors loaded.";
    if (controls) controls.innerHTML = "";
  }
}

async function loadRecentActivity() {
  const container = document.getElementById("recentActivity");

  if (!container) return;

  try {
    const response = await fetch("/api/recent-activity");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load activity.");
    }

    if (!data.achievements || data.achievements.length === 0) {
      container.innerHTML = `<div class="premium-empty-state"><span>✦</span><strong>No recent clan activity</strong><p>Fresh Wise Old Man achievements will appear here automatically.</p></div>`;
      return;
    }

    container.innerHTML = "";

    data.achievements
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 6)
      .forEach(item => {
      const row = document.createElement("div");
      row.className = "activity-feed-row";

      const player = item.player || "Unknown";
      const achievement = item.name || "Achievement";
      const date = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString("en-US")
        : "Recent";

      row.innerHTML = `
        <div>
          <button type="button" class="activity-player-link" data-member-search="${escapeHtml(player)}">${escapeHtml(player)}</button>
          <span>${escapeHtml(achievement)}</span>
        </div>

        <small>${date}</small>
      `;

      container.appendChild(row);
    });
  } catch {
    container.textContent = "Could not load recent achievements.";
  }
}


document.addEventListener("click", event => {
  const memberButton = event.target.closest("[data-member-search]");
  if (!memberButton) return;
  const trigger = document.getElementById("navGlobalSearchTrigger");
  trigger?.click();
  const input = document.getElementById("globalSearchInput");
  if (input) {
    input.value = memberButton.dataset.memberSearch || "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

function createEventHubCard({ type, href, icon, label, title, description, teaser = "", active = false, ctaLabel = "View Event →" }) {
  const card = document.createElement(href ? "a" : "article");

  card.className = `event-hub-card event-${type}${active ? " is-active" : " is-inactive"}`;

  if (href) {
    card.href = href;
  }

  const activeBadge = active
    ? `<span class="event-active-badge">🟢 ACTIVE</span>`
    : "";

  const titleHtml = title
    ? `<h2>${title}</h2>`
    : "";

  const descriptionHtml = description
    ? `<p>${description}</p>`
    : "";

  const teaserHtml = teaser
    ? `<div class="event-hub-teaser">${teaser}</div>`
    : "";

  let footerHtml = `
    <div class="event-hub-footer event-hub-footer-inactive">
      <span>Not active</span>
    </div>
  `;

  if (href) {
    footerHtml = `
      <div class="event-hub-footer">
        <span>${active ? "Live now" : "Event details"}</span>
        <strong>${ctaLabel}</strong>
      </div>
    `;
  } else if (active) {
    footerHtml = `
      <div class="event-hub-footer event-hub-footer-inactive">
        <span>Not open yet</span>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="event-hub-topline">
      <div class="event-hub-icon">${icon}</div>
      ${activeBadge}
    </div>

    <div>
      <p class="eyebrow">${label}</p>
      ${titleHtml}
      ${descriptionHtml}
      ${teaserHtml}
    </div>

    ${footerHtml}
  `;

  return card;
}

async function fetchBingoSettings() {
  try {
    const response = await fetch(`/api/bingo/settings?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load Bingo settings.");
    }

    return data.settings || { active: false, signupOpen: false, enableViewEvent: false, boardRevealAt: "" };
  } catch {
    return { active: false, signupOpen: false, enableViewEvent: false, boardRevealAt: "" };
  }
}

async function appendBattleshipBingoCard(grid) {
  const settings = await fetchBingoSettings();
  if (settings.showOnEventsPage !== true) return;

  const active = settings.active === true;
  const signupOpen = settings.signupOpen === true;
  const enableViewEvent = settings.enableViewEvent === true;
  const href = enableViewEvent
    ? "/bingo"
    : signupOpen
      ? "bingo-signup.html"
      : "";

  grid.appendChild(createEventHubCard({
    type: "bingo",
    href,
    icon: "🚢",
    label: "BINGO",
    title: active ? (settings.title || "Battleship Bingo") : "Battleship Bingo",
    description: active
      ? enableViewEvent
        ? "Event in progress. Choose your private team board."
        : (settings.description || "Build a board, split into teams, claim tiles, and track summer progress.")
      : "",
    active,
    ctaLabel: enableViewEvent ? "Enter Bingo →" : "Sign Up →"
  }));
}


async function appendGiveawaysHubCard(grid) {
  try {
    const settingsResponse = await fetch(`/api/giveaways/settings?t=${Date.now()}`, { cache: "no-store" });
    const settingsData = await settingsResponse.json().catch(() => ({}));
    if (settingsResponse.ok && settingsData.settings?.showOnEventsPage === false) return;

    const response = await fetch(`/api/giveaways/list?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    const giveaways = Array.isArray(data.giveaways) ? data.giveaways : [];
    const activeGiveaway = giveaways.find(item => item.status === "open") || giveaways.find(item => item.status === "scheduled");
    const completed = giveaways.find(item => item.status === "completed");

    grid.appendChild(createEventHubCard({
      type: "giveaway",
      href: "giveaways.html",
      icon: "🎁",
      label: "Giveaway",
      title: "Guess the KC",
      description: activeGiveaway
        ? `${activeGiveaway.host || "A clan member"} is hosting ${activeGiveaway.drop || "a drop"} KC guesses.`
        : completed
          ? `Latest winner: ${completed.winnerName || "TBD"}`
          : "Guess the kill count of a drop. Closest guess wins.",
      active: Boolean(activeGiveaway),
      ctaLabel: activeGiveaway ? "Submit Guess →" : "View Giveaway →"
    }));
  } catch {
    grid.appendChild(createEventHubCard({
      type: "giveaway",
      href: "giveaways.html",
      icon: "🎁",
      label: "Giveaway",
      title: "Guess the KC",
      description: "Guess the kill count of a drop. Closest guess wins.",
      active: false,
      ctaLabel: "View Giveaway →"
    }));
  }
}

async function loadHomeBingoSignupBanner() {
  const banner = document.getElementById("homeBingoSignupBanner");
  if (!banner) return;

  try {
    const settings = await fetchBingoSettings();
    const title = banner.querySelector("h2");
    const text = banner.querySelector("p:last-of-type");
    const link = banner.querySelector("a");

    if (settings.active === true && settings.enableViewEvent === true) {
      banner.style.display = "flex";
      if (title) title.textContent = "Battleship Bingo is live";
      if (text) text.textContent = "The event has started. Choose your private team board.";
      if (link) {
        link.href = "/bingo";
        link.textContent = "Enter Bingo";
      }
      return;
    }

    if (settings.active === true && settings.signupOpen === true) {
      banner.style.display = "flex";
      if (title) title.textContent = "Registration is open";
      if (text) text.textContent = "Sign up with one click. Teams are auto-balanced between Team 1 and Team 2.";
      if (link) {
        link.href = "bingo-signup.html";
        link.textContent = "Sign Up Now";
      }
      return;
    }

    banner.style.display = "none";
  } catch {
    banner.style.display = "none";
  }
}


function eventHubMetricSuffix(event, standings) {
  const metric = String(standings?.metric || event?.metric || "").toLowerCase();
  if (metric.includes("xp") || String(event?.type || "").includes("skill")) return "XP";
  if (metric.includes("kill") || metric.includes("kc") || String(event?.type || "").includes("boss")) return "KC";
  return "gained";
}

function buildEventHubStandingsTeaser(event, standings) {
  if (!standings) return "";
  const leader = Array.isArray(standings.standings) ? standings.standings[0] : null;
  const suffix = eventHubMetricSuffix(event, standings);
  const total = Number(standings.totalGained || 0);
  const contributors = Number(standings.contributors || 0);
  return `
    <div class="event-teaser-stat"><span>Total</span><strong>${formatNumber(total)} ${suffix}</strong></div>
    <div class="event-teaser-stat"><span>Contributors</span><strong>${formatNumber(contributors)}</strong></div>
    ${leader ? `<div class="event-teaser-leader"><span>Leading</span><strong>${escapeHtml(leader.name || "Unknown")}</strong><small>${formatNumber(leader.gained || 0)} ${suffix}</small></div>` : ""}
  `;
}

async function buildEventHubTeaser(event, type, botwEvents = []) {
  if (type === "botw") {
    const activeBotw = botwEvents.filter(isEventActive);
    if (!activeBotw.length) return "";
    const snapshots = await Promise.all(activeBotw.map(async item => ({
      event: item,
      standings: await fetchEventStandings(item).catch(() => null)
    })));
    return snapshots.map(({ event: item, standings }) => {
      const tier = getBotwTierLabel(item) || "BOTW";
      const leader = standings?.standings?.[0];
      return `<div class="event-teaser-mini"><span>${escapeHtml(tier)}</span><strong>${leader ? escapeHtml(leader.name) : "Awaiting standings"}</strong>${leader ? `<small>${formatNumber(leader.gained || 0)} KC</small>` : ""}</div>`;
    }).join("");
  }

  if (type === "bounties") {
    try {
      const response = await fetch(`/api/drops/list?eventId=bounties&t=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const drops = response.ok && Array.isArray(data.drops) ? data.drops : [];
      const members = new Set(drops.map(item => item.player || item.member || item.rsn || "").filter(Boolean));
      return `<div class="event-teaser-stat"><span>Completed</span><strong>${formatNumber(drops.length)} bounties</strong></div><div class="event-teaser-stat"><span>Hunters</span><strong>${formatNumber(members.size)}</strong></div>`;
    } catch { return ""; }
  }

  if (!event?.womCompetitionId) return "";
  const standings = await fetchEventStandings(event).catch(() => null);
  return buildEventHubStandingsTeaser(event, standings);
}

async function loadEventsHub() {
  const grid = document.getElementById("eventHubGrid");
  if (!grid) return;
  grid.className = "event-hub-grid";
  grid.innerHTML = "";

  try {
    const events = await fetchCurrentEvents();
    const find = id => events.find(event => event.id === id);
    const sotw = find("sotw-current") || events.find(event => event.type === "sotw") || { id:"sotw-current", type:"sotw", label:"SOTW", title:"Skill of the Week", active:false };
    const botwEvents = events.filter(isBotwEvent);
    const clanGoal = find("clan-goal") || events.find(isClanGoalEvent) || { id:"clan-goal", type:"clan-goal-boss", label:"Clan Goal", title:"Clan Goal", active:false };
    const bounties = find("bounties") || { id:"bounties", type:"bounties", label:"Bounties", title:"Clan Bounties", active:false };

    const permanentCards = [
      { event:sotw, type:"sotw", icon:getEventIcon("sotw"), label:"SOTW", fallback:"Skill of the Week" },
      { event:null, type:"botw", icon:getEventIcon("botw"), label:"BOTW", fallback:"Boss of the Week", active:botwEvents.some(isEventActive), href:"event.html?id=botw-current", description:"View Elite and Standard BOTW dashboards in one place." },
      { event:clanGoal, type:"clan-goal", icon:getEventIcon("clan-goal"), label:"Clan Goal", fallback:"Clan Goal" },
      { event:bounties, type:"bounties", icon:getEventIcon("bounties"), label:"Bounties", fallback:"Clan Bounties" }
    ];

    for (const item of permanentCards) {
      const event = item.event;
      const active = item.active ?? isEventActive(event);
      const href = active ? (item.href || getEventPageHref(event)) : "";
      const teaser = active ? await buildEventHubTeaser(event, item.type, botwEvents) : "";
      grid.appendChild(createEventHubCard({
        type:item.type, href, icon:item.icon, label:item.label,
        title: active ? displayEventTitle(event?.title || item.fallback, event?.type || item.type) : item.fallback,
        description: active ? (event?.description || item.description || "View the full Ironkin event dashboard.") : "Not active",
        teaser,
        active
      }));
    }

    await appendBattleshipBingoCard(grid);
    await appendGiveawaysHubCard(grid);
  } catch (error) {
    [
      ["sotw","📊","SOTW","Skill of the Week"],
      ["botw","☠️","BOTW","Boss of the Week"],
      ["clan-goal","🔥","Clan Goal","Clan Goal"],
      ["bounties","🎯","Bounties","Clan Bounties"]
    ].forEach(([type,icon,label,title]) => grid.appendChild(createEventHubCard({ type, icon, label, title, description:"Not active", active:false })));
  }
}


function getBotwEventsForDashboard(events) {
  const botw = events.filter(event => isBotwEvent(event));
  const elite = botw.find(event => event.botwTier === "elite" || event.id === "botw-elite") || null;
  const standard = botw.find(event => event.botwTier === "standard" || event.id === "botw-standard") || null;
  return [elite, standard].filter(Boolean);
}

function renderBotwTierDashboardColumn(event, standings) {
  const tier = getBotwTierLabel(event) || "BOTW";
  const eventHasNotStarted = isBeforeEventStart(standings, event);
  const totalGained = eventHasNotStarted ? 0 : (standings?.totalGained || 0);
  const contributors = standings?.contributors || 0;
  const highestGain = standings?.standings?.[0]?.gained || 0;
  const topContributors = eventHasNotStarted
    ? []
    : (standings?.standings?.filter(player => player.gained > 0).slice(0, 5) || []);
  const eventDateText = standings?.startsAt && standings?.endsAt
    ? `${new Date(standings.startsAt).toLocaleDateString("en-US")} - ${new Date(standings.endsAt).toLocaleDateString("en-US")}`
    : event.startDate && event.endDate
      ? `${new Date(event.startDate).toLocaleDateString("en-US")} - ${new Date(event.endDate).toLocaleDateString("en-US")}`
      : "Dates will appear when tracking is available.";

  return `
    <section class="event-panel botw-tier-panel">
      <div class="botw-tier-header">
        <p class="eyebrow">☠️ BOTW ${escapeHtml(tier)}</p>
        <h2>${displayEventTitle(standings?.title || event.title || `Boss of the Week - ${tier}`, event.type)}</h2>
        <p>${event.description || standings?.metric || "Boss of the Week dashboard."}</p>
        <small><strong>Event Date:</strong> ${eventDateText}</small>
      </div>

      ${eventHasNotStarted ? `
        <div class="event-starting-soon-panel compact">
          <p class="eyebrow">Event Starting Soon</p>
          <h3>Starts in ${getCountdownToStart(standings?.startsAt || event.startDate || event.start)}</h3>
          <p>Progress tracking will begin when the WOM competition starts.</p>
        </div>
      ` : ""}

      <div class="event-kpi-grid botw-tier-kpis">
        <div class="event-kpi">
          <span>Total KC</span>
          <strong>${formatNumber(totalGained)}</strong>
        </div>
        <div class="event-kpi">
          <span>Active Killers</span>
          <strong>${formatNumber(contributors)}</strong>
        </div>
        <div class="event-kpi">
          <span>Highest KC</span>
          <strong>${formatNumber(highestGain)}</strong>
        </div>
      </div>

      <div class="event-detail-grid botw-tier-details">
        <section class="event-panel inner-panel">
          <h3>Leaderboard</h3>
          ${topContributors.length
            ? topContributors.map((player, index) => `
                <div class="event-contributor-row">
                  <strong>#${index + 1} ${escapeHtml(player.name)}</strong>
                  <span>${formatNumber(player.gained)} gained</span>
                </div>
              `).join("")
            : (eventHasNotStarted ? "Leaderboard will appear when the event starts." : "No gained KC yet.")
          }
        </section>
        ${renderCompetitionStats(event, standings)}
      </div>

      ${renderRewardsSection(event)}

      ${event.womCompetitionId && event.womCompetitionId !== "PUT_YOUR_WOM_ID_HERE" ? `
        <a class="btn primary" href="https://wiseoldman.net/competitions/${event.womCompetitionId}" target="_blank" rel="noopener">
          View BOTW ${escapeHtml(tier)} WOM Leaderboard
        </a>
      ` : ""}
    </section>
  `;
}

async function renderBotwDashboard(dashboard, events) {
  const botwEvents = getBotwEventsForDashboard(events);

  if (!botwEvents.length) {
    dashboard.textContent = "BOTW events not found.";
    return;
  }

  const standingsList = await Promise.all(
    botwEvents.map(event => fetchEventStandings(event).catch(() => null))
  );

  dashboard.innerHTML = `
    <section class="event-detail-card botw-dashboard-card">
      <div class="event-detail-hero">
        <div>
          <p class="eyebrow">☠️ BOTW</p>
          <h1>Boss of the Week</h1>
          <p>Elite and Standard competitions are displayed below.</p>
        </div>
      </div>
      <div class="event-detail-body">
        <div class="botw-dashboard-grid">
          ${botwEvents.map((event, index) => renderBotwTierDashboardColumn(event, standingsList[index])).join("")}
        </div>
      </div>
    </section>
  `;

}


async function fetchOwnClanGoalProfile() {
  try {
    const response = await fetch(`/api/profile?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.signedIn ? (data.profile || null) : null;
  } catch {
    return null;
  }
}

function getEventTrackingDates(event, standings) {
  const startRaw = standings?.startsAt || event?.startDate || event?.start || null;
  const endRaw = standings?.endsAt || event?.endDate || event?.end || null;
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null
  };
}

function formatCompactDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "Ended";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.max(1, Math.floor((ms % 3600000) / 60000));
  return `${hours}h ${minutes}m`;
}

function getClanGoalMilestoneData(event, totalGained, goal) {
  const milestones = Array.isArray(event?.milestones) ? event.milestones : [];
  return milestones
    .map(milestone => {
      const percent = Number(milestone.percent || 0);
      const target = goal ? Math.round(goal * (percent / 100)) : 0;
      return {
        ...milestone,
        percent,
        target,
        reached: goal ? totalGained >= target : false
      };
    })
    .sort((a, b) => a.percent - b.percent);
}

function normalizePlayerNameForMatch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getClanGoalBadges(player, rank, totalGained) {
  if (!player) return [];
  const badges = [];
  if (rank === 1) badges.push("👑 MVP");
  else if (rank <= 3) badges.push("🏆 Top 3");
  else if (rank <= 10) badges.push("⚔️ Top 10");
  if (player.gained >= 5000000) badges.push("💎 5M Club");
  else if (player.gained >= 1000000) badges.push("🔥 1M Club");
  if (totalGained > 0 && (player.gained / totalGained) >= 0.05) badges.push("🎯 5% Contributor");
  return badges;
}

async function renderClanGoalDashboard(dashboard, event, standings, eventHasNotStarted) {
  const totalGained = eventHasNotStarted ? 0 : Number(standings?.totalGained || 0);
  const contributors = Number(standings?.contributors || 0);
  const goal = Number(event.target || event.goal || 0);
  const percent = goal ? Math.min((totalGained / goal) * 100, 100) : 0;
  const remaining = goal ? Math.max(goal - totalGained, 0) : 0;
  const tracksXp = eventTracksXp(event, standings);
  const unit = tracksXp ? "XP" : "KC";
  const dates = getEventTrackingDates(event, standings);
  const now = new Date();
  const elapsedDays = dates.start ? Math.max((now - dates.start) / 86400000, 0) : 0;
  const remainingDays = dates.end ? Math.max((dates.end - now) / 86400000, 0) : 0;
  const dailyPace = elapsedDays > 0 ? totalGained / elapsedDays : 0;
  const requiredPace = remainingDays > 0 ? remaining / remainingDays : 0;
  const projectedFinish = dailyPace > 0 && remaining > 0
    ? new Date(now.getTime() + (remaining / dailyPace) * 86400000)
    : null;
  const onPace = goal > 0 && remaining === 0 ? true : dailyPace > 0 && requiredPace > 0 && dailyPace >= requiredPace;
  const eventDateText = dates.start && dates.end
    ? `${dates.start.toLocaleDateString("en-US")} - ${dates.end.toLocaleDateString("en-US")}`
    : "Dates will appear when tracking is available.";

  const rankedPlayers = eventHasNotStarted ? [] : (standings?.standings || [])
    .filter(player => Number(player.gained || 0) > 0)
    .sort((a, b) => Number(b.gained || 0) - Number(a.gained || 0));

  const profile = await fetchOwnClanGoalProfile();
  const playerNameCandidates = [profile?.rsn, profile?.displayName, profile?.username]
    .map(normalizePlayerNameForMatch)
    .filter(Boolean);
  const myIndex = playerNameCandidates.length
    ? rankedPlayers.findIndex(player => playerNameCandidates.includes(normalizePlayerNameForMatch(player.name)))
    : -1;
  const myPlayer = myIndex >= 0 ? rankedPlayers[myIndex] : null;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const nextPlayer = myIndex > 0 ? rankedPlayers[myIndex - 1] : null;
  const toNextRank = myPlayer && nextPlayer ? Math.max(Number(nextPlayer.gained || 0) - Number(myPlayer.gained || 0) + 1, 0) : 0;
  const myShare = myPlayer && totalGained > 0 ? (Number(myPlayer.gained || 0) / totalGained) * 100 : 0;
  const myBadges = getClanGoalBadges(myPlayer, myRank, totalGained);

  const milestones = getClanGoalMilestoneData(event, totalGained, goal);
  const nextMilestone = milestones.find(item => !item.reached) || null;
  const nextMilestoneRemaining = nextMilestone ? Math.max(nextMilestone.target - totalGained, 0) : 0;
  const topThree = rankedPlayers.slice(0, 3);
  const restTopTen = rankedPlayers.slice(3, 10);

  const podiumClass = index => index === 0 ? "first" : index === 1 ? "second" : "third";
  const medal = index => index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";

  dashboard.innerHTML = `
    <section class="event-detail-card clan-goal-dashboard-card">
      <div class="event-detail-hero clan-goal-hero">
        <div>
          <p class="eyebrow">🔥 ${escapeHtml(event.label || "Clan Goal")}</p>
          <h1>${escapeHtml(displayEventTitle(standings?.title || event.title, event.type))}</h1>
          <p>${escapeHtml(event.description || standings?.metric || "Push the clan forward together.")}</p>
          <p class="clan-goal-date"><strong>Event Date:</strong> ${escapeHtml(eventDateText)}</p>
        </div>
        <div class="event-percent-box clan-goal-percent-box">
          <strong>${goal ? `${percent.toFixed(1)}%` : "ACTIVE"}</strong>
          <span>${goal ? "Goal Complete" : "Clan Goal"}</span>
        </div>
      </div>

      <div class="event-detail-body clan-goal-body">
        ${eventHasNotStarted ? `
          <div class="event-starting-soon-panel">
            <p class="eyebrow">Event Starting Soon</p>
            <h2>Starts in ${getCountdownToStart(standings?.startsAt || event.startDate || event.start)}</h2>
            <p>Progress tracking will begin when the Wise Old Man competition starts.</p>
          </div>` : ""}

        <div class="clan-goal-kpi-grid">
          <div class="clan-goal-kpi"><span>Current ${unit}</span><strong>${formatNumber(totalGained)}</strong><small>${goal ? `${formatNumber(goal)} target` : "Live total"}</small></div>
          <div class="clan-goal-kpi"><span>Contributors</span><strong>${formatNumber(contributors)}</strong><small>Clan members contributing</small></div>
          <div class="clan-goal-kpi"><span>Current Pace</span><strong>${formatNumber(Math.round(dailyPace))}</strong><small>${unit} per day</small></div>
          <div class="clan-goal-kpi"><span>Time Remaining</span><strong>${dates.end ? formatCompactDuration(dates.end - now) : "—"}</strong><small>${remainingDays > 0 ? `${formatNumber(Math.ceil(requiredPace))} ${unit}/day needed` : "Goal period complete"}</small></div>
        </div>

        ${goal ? `
          <section class="clan-goal-progress-card">
            <div class="clan-goal-progress-heading">
              <div><span>Clan Progress</span><strong>${formatNumber(totalGained)} / ${formatNumber(goal)} ${unit}</strong></div>
              <strong>${percent.toFixed(1)}%</strong>
            </div>
            <div class="event-progress-bar milestone-bar clan-goal-main-progress">
              <div style="width:${percent}%"></div>
              ${milestones.map(milestone => `
                <span class="milestone-marker ${milestone.reached ? "is-reached" : ""} ${milestone.percent >= 95 ? "milestone-marker--end" : milestone.percent <= 5 ? "milestone-marker--start" : ""}" style="left:${Math.min(Math.max(milestone.percent, 0), 100)}%">
                  <strong>${milestone.percent}%</strong><small>${escapeHtml(milestone.title || "Milestone")}</small>
                </span>`).join("")}
            </div>
            <div class="clan-goal-progress-foot"><span>${formatNumber(remaining)} ${unit} remaining</span><span>${milestones.filter(item => item.reached).length}/${milestones.length} milestones unlocked</span></div>
          </section>` : ""}

        <div class="clan-goal-insight-grid">
          <section class="event-panel clan-goal-next-card">
            <p class="eyebrow">🎯 Next Milestone</p>
            ${nextMilestone ? `
              <h2>${nextMilestone.percent}% — ${escapeHtml(nextMilestone.title || "Milestone")}</h2>
              <strong class="clan-goal-big-number">${formatNumber(nextMilestoneRemaining)} ${unit}</strong>
              <p>remaining to unlock this reward.</p>` : `
              <h2>All Milestones Unlocked</h2><strong class="clan-goal-big-number">Goal rewards cleared</strong><p>The clan has reached every configured milestone.</p>`}
          </section>

          <section class="event-panel clan-goal-pace-card ${onPace ? "is-on-pace" : "is-behind-pace"}">
            <p class="eyebrow">📈 Goal Pace</p>
            <h2>${onPace ? "On Pace" : "Push Needed"}</h2>
            <div class="clan-goal-pace-lines">
              <span><small>Current</small><strong>${formatNumber(Math.round(dailyPace))} ${unit}/day</strong></span>
              <span><small>Required</small><strong>${formatNumber(Math.ceil(requiredPace))} ${unit}/day</strong></span>
            </div>
            <p>${projectedFinish ? `Projected finish: <strong>${projectedFinish.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong>` : "A projection will appear once progress is recorded."}</p>
          </section>
        </div>

        <section class="event-panel clan-goal-personal-card">
          <div class="clan-goal-section-heading"><div><p class="eyebrow">👤 Your Clan Goal</p><h2>${profile ? escapeHtml(profile.rsn || profile.displayName || "Your contribution") : "Your contribution"}</h2></div>${profile ? `<a class="clan-goal-profile-link" href="profile.html">View Profile →</a>` : ""}</div>
          ${profile ? (myPlayer ? `
            <div class="clan-goal-personal-stats">
              <div><span>Your ${unit}</span><strong>${formatNumber(myPlayer.gained)}</strong></div>
              <div><span>Clan Rank</span><strong>#${myRank}</strong></div>
              <div><span>Share of Progress</span><strong>${myShare.toFixed(1)}%</strong></div>
              <div><span>${myRank === 1 ? "Position" : "To Next Rank"}</span><strong>${myRank === 1 ? "MVP" : `${formatNumber(toNextRank)} ${unit}`}</strong></div>
            </div>
            <div class="clan-goal-badges">${myBadges.length ? myBadges.map(badge => `<span>${badge}</span>`).join("") : `<span>⚒️ Contributor</span>`}</div>` : `
            <div class="clan-goal-empty-personal"><strong>No tracked contribution yet.</strong><span>Your personalized stats will appear here as soon as your WOM name records ${unit} in this goal.</span></div>`)
          : `<div class="clan-goal-empty-personal"><strong>Sign in to personalize this dashboard.</strong><span>Your contribution, clan rank, progress share and achievement badges will appear here automatically.</span><a class="btn primary" href="/api/auth/login">Sign in with Discord</a></div>`}
        </section>

        <section class="event-panel clan-goal-mvp-panel">
          <div class="clan-goal-section-heading"><div><p class="eyebrow">🏆 MVP Race</p><h2>Top Contributors</h2></div><span class="clan-goal-live-pill">LIVE</span></div>
          ${topThree.length ? `<div class="clan-goal-podium">${topThree.map((player, index) => `
            <div class="clan-goal-podium-card ${podiumClass(index)} ${myRank === index + 1 ? "is-you" : ""}">
              <span class="clan-goal-medal">${medal(index)}</span><small>#${index + 1}</small><strong>${escapeHtml(player.name)}</strong><span>${formatNumber(player.gained)} ${unit}</span>${myRank === index + 1 ? `<em>YOU</em>` : ""}
            </div>`).join("")}</div>` : `<p>${eventHasNotStarted ? "Leaderboard will appear when the event starts." : "No contribution has been recorded yet."}</p>`}
          ${restTopTen.length ? `<div class="clan-goal-ranking-list">${restTopTen.map((player, index) => {
            const rank = index + 4;
            return `<div class="clan-goal-ranking-row ${myRank === rank ? "is-you" : ""}"><strong><span>#${rank}</span>${escapeHtml(player.name)}${myRank === rank ? `<em>YOU</em>` : ""}</strong><span>${formatNumber(player.gained)} ${unit}</span></div>`;
          }).join("")}</div>` : ""}
          ${myRank && myRank > 10 ? `<div class="clan-goal-your-rank"><span>Your current position</span><strong>#${myRank} · ${escapeHtml(myPlayer.name)}</strong><span>${formatNumber(myPlayer.gained)} ${unit}</span></div>` : ""}
        </section>

        <div class="event-detail-grid clan-goal-lower-grid">
          ${event.dropsEnabled ? renderDropsPanel() : renderCompetitionStats(event, standings)}
          <section class="event-panel clan-goal-participation-panel">
            <p class="eyebrow">👥 Participation</p><h2>Clan Effort</h2>
            <div class="clan-goal-participation-stats"><span><strong>${formatNumber(contributors)}</strong><small>Contributors</small></span><span><strong>${rankedPlayers.length ? formatNumber(Math.round(totalGained / rankedPlayers.length)) : "0"}</strong><small>Avg. ${unit} / contributor</small></span><span><strong>${rankedPlayers[0] ? formatNumber(rankedPlayers[0].gained) : "0"}</strong><small>Top contribution</small></span></div>
          </section>
        </div>

        ${renderRewardsSection(event)}
        ${event.womCompetitionId && event.womCompetitionId !== "PUT_YOUR_WOM_ID_HERE" ? `<a class="btn primary clan-goal-wom-link" href="https://wiseoldman.net/competitions/${event.womCompetitionId}" target="_blank" rel="noopener">View Full WOM Leaderboard</a>` : ""}
      </div>
    </section>`;

  if (event.dropsEnabled) loadDrops();
}

async function loadSingleEventDashboard() {
  const dashboard = document.getElementById("singleEventDashboard");

  if (!dashboard) return;

  const params = new URLSearchParams(window.location.search);
  let eventId = params.get("id");

  if (eventId && /^clan-goal-/i.test(eventId)) {
    eventId = "clan-goal";
    window.history.replaceState({}, "", "event.html?id=clan-goal");
  }

  if (!eventId) {
    dashboard.textContent = "Missing event ID.";
    return;
  }

  try {
    const events = await fetchCurrentEvents();
    if (["botw", "botw-current", "botw-elite", "botw-standard"].includes(eventId)) {
      await renderBotwDashboard(dashboard, events);
      return;
    }

    const event = eventId === "clan-goal"
      ? events.find(item => isClanGoalEvent(item) && isEventActive(item)) ||
        events.find(item => isClanGoalEvent(item))
      : events.find(item => item.id === eventId);

    if (!event) {
      dashboard.textContent = "Event not found.";
      return;
    }

    resolvedSingleEventDropId = isClanGoalEvent(event) ? "clan-goal" : (event.id || eventId);

    if (event.type === "bounties") {
      dashboard.innerHTML = `
        <section class="event-detail-card">
          <div class="event-detail-hero"><div><p class="eyebrow">🎯 Bounties</p><h1>${escapeHtml(event.title || "Clan Bounties")}</h1><p>${escapeHtml(event.description || "Collect selected items and earn Embers for every bounty completed.")}</p></div><div class="event-percent-box"><strong>${event.active ? "ACTIVE" : "INACTIVE"}</strong><span>Bounty Board</span></div></div>
          <div class="event-detail-body">${renderDropsPanel()}</div>
        </section>`;
      loadDrops();
      return;
    }

    const standings = await fetchEventStandings(event).catch(() => null);
    const eventHasNotStarted = isBeforeEventStart(standings, event);

    const totalGained = eventHasNotStarted ? 0 : (standings?.totalGained || 0);
    const contributors = standings?.contributors || 0;
    const goal = event.target || event.goal || null;

    const percent = goal
      ? Math.min((totalGained / goal) * 100, 100)
      : 0;

    const remaining = goal
      ? Math.max(goal - totalGained, 0)
      : null;

    const isSotw = event.type === "sotw";
    const isBotw = event.type === "botw";
    const isClanGoal =
      event.type === "clan-goal" ||
      event.type === "clan-goal-boss" ||
      event.type === "clan-goal-skill" ||
      event.type === "clan_goal";

    if (isClanGoal) {
      await renderClanGoalDashboard(dashboard, event, standings, eventHasNotStarted);
      return;
    }

    const highestGain =
      standings?.standings?.[0]?.gained || 0;

    // Use the same automatic XP/KC detection everywhere on the event page.
    const clanGoalTracksXp = isClanGoal && eventTracksXp(event, standings);

    const totalLabel = isSotw
      ? "Total XP Gained"
      : isBotw
      ? "Total KC"
      : clanGoalTracksXp
      ? "Current XP"
      : "Current KC";

    const contributorsLabel = isSotw
      ? "Active Competitors"
      : isBotw
      ? "Active Killers"
      : "Participants";

    const thirdLabel = isSotw
      ? "Highest Gain"
      : isBotw
      ? "Highest KC"
      : clanGoalTracksXp
      ? "Goal XP"
      : "Goal KC";

    const thirdValue =
      isClanGoal && goal
        ? formatNumber(goal)
        : formatNumber(highestGain);

    const topContributors = eventHasNotStarted
      ? []
      : (standings?.standings
        ?.filter(player => player.gained > 0)
        .slice(0, 5) || []);

    const eventDateText =
      standings?.startsAt && standings?.endsAt
        ? `${new Date(standings.startsAt).toLocaleDateString("en-US")} - ${new Date(standings.endsAt).toLocaleDateString("en-US")}`
        : event.startDate && event.endDate
        ? `${new Date(event.startDate).toLocaleDateString("en-US")} - ${new Date(event.endDate).toLocaleDateString("en-US")}`
        : "Dates will appear when tracking is available.";

    dashboard.innerHTML = `
      <section class="event-detail-card">

        <div class="event-detail-hero">

          <div>
            <p class="eyebrow">
              ${getEventIcon(event.type)}
              ${event.label || formatEventType(event.type)}
            </p>

            <h1>
              ${displayEventTitle(standings?.title || event.title, event.type)}
            </h1>

            <p>
              ${event.description || standings?.metric || "Ironkin event dashboard."}
            </p>

            <p>
              <strong>Event Date:</strong> ${eventDateText}
            </p>
          </div>

          <div class="event-percent-box">

            <strong>
              ${
                goal
                  ? `${percent.toFixed(0)}%`
                  : formatEventType(event.type)
              }
            </strong>

            <span>
              ${goal ? "Complete" : "Active"}
            </span>

          </div>

        </div>

        <div class="event-detail-body">

          ${
            eventHasNotStarted
              ? `
                <div class="event-starting-soon-panel">
                  <p class="eyebrow">Event Starting Soon</p>
                  <h2>Starts in ${getCountdownToStart(standings?.startsAt || event.startDate || event.start)}</h2>
                  <p>Progress tracking will begin when the Wise Old Man competition starts.</p>
                </div>
              `
              : ""
          }

          <div class="event-kpi-grid">

            <div class="event-kpi">
              <span>${totalLabel}</span>
              <strong>${formatNumber(totalGained)}</strong>
            </div>

            <div class="event-kpi">
              <span>${contributorsLabel}</span>
              <strong>${formatNumber(contributors)}</strong>
            </div>

            <div class="event-kpi">
              <span>${thirdLabel}</span>
              <strong>${thirdValue}</strong>
            </div>

          </div>

          ${
            goal
              ? `
                <div class="event-progress-labels">
                  <span>Progress</span>
                  <span>${formatNumber(remaining)} remaining</span>
                </div>

                <div class="event-progress-bar milestone-bar">
                  <div style="width:${percent}%"></div>

                  ${(event.milestones || [])
                    .map(milestone => `
                      <span class="milestone-marker ${milestone.percent >= 95 ? "milestone-marker--end" : milestone.percent <= 5 ? "milestone-marker--start" : ""}" style="left:${Math.min(Math.max(milestone.percent, 0), 100)}%">
                        <strong>${milestone.percent}%</strong>
                        <small>${milestone.title}</small>
                      </span>
                    `)
                    .join("")}
                </div>
              `
              : ""
          }

          <div class="event-detail-grid">

            <section class="event-panel">

              <h2>Leaderboard</h2>

              <div id="singleEventContributors">

                ${
                  topContributors.length
                    ? topContributors.map((player, index) => `
                        <div class="event-contributor-row">
                          <strong>#${index + 1} ${player.name}</strong>
                          <span>${formatNumber(player.gained)} gained</span>
                        </div>
                      `).join("")
                    : (eventHasNotStarted ? "Leaderboard will appear when the event starts." : "No gained KC/XP yet.")
                }

              </div>

            </section>

            ${
              isClanGoal && event.dropsEnabled
                ? renderDropsPanel()
                : renderCompetitionStats(event, standings)
            }

          </div>

          ${renderRewardsSection(event)}

          ${
            event.womCompetitionId && event.womCompetitionId !== "PUT_YOUR_WOM_ID_HERE"
              ? `
                <a
                  class="btn primary"
                  href="https://wiseoldman.net/competitions/${event.womCompetitionId}"
                  target="_blank"
                  rel="noopener"
                >
                  View WOM Leaderboard
                </a>
              `
              : ""
          }

        </div>

      </section>
    `;

    loadDrops();

  } catch (error) {
    dashboard.textContent =
      `Could not load event: ${error.message}`;
  }
}

async function loadHomeEventWidgets() {
  const activeGrid = document.getElementById("homeActiveEventsGrid");
  const clanGoalWidget = document.getElementById("homeClanGoalWidget");

  if (!activeGrid && !clanGoalWidget) return;

  try {
    const events = await fetchCurrentEvents();
    const activeEvents = events.filter(event => isEventActive(event));

    if (activeGrid) {
      activeGrid.innerHTML = "";

      if (activeEvents.length === 0) {
        activeGrid.textContent = "No active events right now.";
      } else {
        activeEvents.slice(0, 3).forEach(event => {
          const row = document.createElement("a");
          row.className = "home-active-event-row";
          row.href = getEventPageHref(event);
          row.innerHTML = `
            <span>${getEventIcon(event.type)}</span>
            <div>
              <strong>${displayEventTitle(event.title, event.type)}</strong>
              <small>${event.label || formatEventType(event.type)}</small>
            </div>
            <em>View →</em>
          `;
          activeGrid.appendChild(row);
        });
      }
    }

    if (clanGoalWidget) {
      const clanGoal = activeEvents.find(event => event.type?.includes("clan-goal"));

      if (!clanGoal) {
        clanGoalWidget.innerHTML = `
          <p class="eyebrow">Active Clan Goal</p>
          <h2>No clan goal active</h2>
          <p>The next clan goal will appear here.</p>
        `;
        return;
      }

      const standings = await fetchEventStandings(clanGoal).catch(() => null);
      const current = standings?.totalGained || 0;
      const target = clanGoal.target || 0;
      const percent = target ? Math.min((current / target) * 100, 100) : 0;
      const nextMilestone = (clanGoal.milestones || []).find(milestone => milestone.percent > percent);

      clanGoalWidget.innerHTML = `
        <p class="eyebrow">${getEventIcon(clanGoal.type)} Active Clan Goal</p>
        <h2>${displayEventTitle(clanGoal.title, clanGoal.type)}</h2>
        <p>${clanGoal.description || "Clan-wide progress event."}</p>

        <div class="mini-progress-labels">
          <span>${formatNumber(current)} / ${formatNumber(target)}</span>
          <strong>${percent.toFixed(0)}%</strong>
        </div>

        <div class="mini-progress-bar">
          <div style="width:${percent}%"></div>
        </div>

        <p class="next-milestone">
          Next reward: <strong>${nextMilestone ? `${nextMilestone.percent}% ${nextMilestone.title}` : "All rewards unlocked"}</strong>
        </p>

        <a class="btn primary" href="event.html?id=clan-goal">View Clan Goal</a>
      `;
    }
  } catch (error) {
    if (activeGrid) activeGrid.textContent = `Could not load active events: ${error.message}`;
    if (clanGoalWidget) clanGoalWidget.querySelector("p")?.remove();
  }
}


function getArchiveWinner(entry) {
  return entry?.winner || entry?.topFive?.[0] || entry?.leaderboard?.[0] || null;
}

function getArchiveWinnerText(entry) {
  const winner = getArchiveWinner(entry);

  if (!winner) return "No winner recorded";

  const metric = getEventMetricLabel(entry);
  return `${winner.name} · ${formatNumber(winner.gained)} ${metric}`;
}

function renderArchivedTopFive(entry) {
  const topFive = entry.topFive?.length ? entry.topFive : entry.leaderboard || [];

  if (!topFive.length) {
    return `<p class="admin-muted">No leaderboard snapshot available.</p>`;
  }

  const metric = getEventMetricLabel(entry);

  return topFive
    .map((player, index) => `
      <div class="archive-result-row">
        <strong>#${index + 1} ${player.name}</strong>
        <span>${formatNumber(player.gained)} ${metric}</span>
      </div>
    `)
    .join("");
}


function renderArchivedDrops(entry) {
  const drops = Array.isArray(entry?.drops)
    ? entry.drops.filter(drop => Number(drop?.count || 0) > 0)
    : [];

  if (!drops.length) return "";

  return `
    <div class="archive-drops-list">
      <h3>Unique Drops Received</h3>
      ${drops
        .map(drop => `
          <div class="archive-result-row">
            <strong>${escapeHtml(drop.name)}</strong>
            <span>x${formatNumber(drop.count)}</span>
          </div>
        `)
        .join("")}
    </div>
  `;
}

async function fetchArchive() {
  const response = await fetch("/api/archive/list");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load archive.");
  }

  return data.archive || [];
}


async function fetchBingoArchive() {
  const response = await fetch("/api/bingo/archive/list", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load Bingo archive.");
  return data.archive || [];
}

async function deleteArchiveEntry(archiveId) {
  if (!archiveId) return;

  const confirmed = confirm("Delete this archived event? This cannot be undone.");

  if (!confirmed) return;

  const response = await fetch("/api/admin/archive/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: archiveId })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    alert(data.error || "Could not delete archive entry.");
    return;
  }

  await loadArchivePage();
}

async function loadArchivePage() {
  const grid = document.getElementById("archiveGrid");

  if (!grid) return;

  try {
    const [archive, bingoArchive, currentUser] = await Promise.all([
      fetchArchive(),
      fetchBingoArchive(),
      getCurrentAuthUser()
    ]);

    const canDeleteArchive = isStaffUser(currentUser);

    grid.className = "archive-grid";
    grid.innerHTML = "";

    if (!archive.length && !bingoArchive.length) {
      grid.innerHTML = `
        <article class="card archive-card">
          <p class="eyebrow">No Results Yet</p>
          <h2>Archive is empty</h2>
          <p>Use the admin dashboard's End Event button to save completed events here.</p>
        </article>
      `;
      return;
    }

    bingoArchive.forEach(entry => {
      const card = document.createElement("article");
      card.className = "card archive-card";
      const dateText = entry.archivedAt ? new Date(entry.archivedAt).toLocaleDateString("en-US") : "Archived";
      const winner = entry.winner === "ember"
        ? entry.summary?.emberName
        : entry.winner === "ash"
          ? entry.summary?.ashName
          : entry.winner === "tie" ? "Tie" : "Not recorded";
      card.innerHTML = `
        <p class="eyebrow">Battleship Bingo · ${dateText}</p>
        <h2>${escapeHtml(entry.title || "Battleship Bingo")}</h2>
        <p><strong>Winner:</strong> ${escapeHtml(winner || "Not recorded")}</p>
        <div class="archive-results-list">
          <div class="archive-result-row"><strong>${escapeHtml(entry.summary?.emberName || "Team 1")}</strong><span>${Number(entry.summary?.emberCompleted || 0)} tiles</span></div>
          <div class="archive-result-row"><strong>${escapeHtml(entry.summary?.ashName || "Team 2")}</strong><span>${Number(entry.summary?.ashCompleted || 0)} tiles</span></div>
          <div class="archive-result-row"><strong>Saved records</strong><span>${Number(entry.summary?.proofCount || 0)} proofs · ${Number(entry.summary?.attackCount || 0)} attacks</span></div>
        </div>
        <div class="archive-card-actions">
          <a class="btn secondary" href="/bingo-archive?id=${encodeURIComponent(entry.id)}">View All Four Boards</a>
        </div>`;
      grid.appendChild(card);
    });

    archive.forEach(entry => {
      const card = document.createElement("article");
      card.className = "card archive-card";

      const dateText = entry.endedAt
        ? new Date(entry.endedAt).toLocaleDateString("en-US")
        : "Archived";

      card.innerHTML = `
        <p class="eyebrow">${entry.label || formatEventType(entry.type)} · ${dateText}</p>

        <h2>${displayEventTitle(entry.title, entry.type)}</h2>

        <p>
          <strong>Winner:</strong> ${getArchiveWinnerText(entry)}
        </p>

        <div class="archive-results-list">
          ${renderArchivedTopFive(entry)}
        </div>

        ${renderArchivedDrops(entry)}

        <div class="archive-card-actions">
          ${
            entry.womCompetitionId
              ? `
                <a
                  class="text-link"
                  href="https://wiseoldman.net/competitions/${entry.womCompetitionId}"
                  target="_blank"
                  rel="noopener"
                >
                  View WOM →
                </a>
              `
              : ""
          }

          ${
            canDeleteArchive
              ? `<button class="btn secondary danger archive-delete-btn" type="button" data-archive-id="${entry.id}">Delete Archive</button>`
              : ""
          }
        </div>
      `;

      grid.appendChild(card);
    });

    grid.querySelectorAll(".archive-delete-btn").forEach(button => {
      button.addEventListener("click", () => {
        deleteArchiveEntry(button.dataset.archiveId);
      });
    });
  } catch (error) {
    grid.innerHTML = `
      <article class="card archive-card">
        <p>Could not load archive: ${error.message}</p>
      </article>
    `;
  }
}



function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanDiscordText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\;/g, ";")
    .replace(/\\,/g, ",")
    .trim();
}

function extractFirstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : "";
}

function stripUrls(value) {
  return String(value || "").replace(/https?:\/\/\S+/gi, "").trim();
}

function parseMarkdownLink(value) {
  const text = cleanDiscordText(value);
  const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/);

  if (!match) {
    return {
      text: stripUrls(text),
      url: extractFirstUrl(text)
    };
  }

  return {
    text: match[1].trim(),
    url: match[2].trim()
  };
}

function parseWinnerSummary(description) {
  return cleanDiscordText(description)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // Discord entries historically use an em dash, but older and manually
      // edited entries may use an en dash or a spaced regular hyphen.
      const match = line.match(/^(.+?)\s*(?:\u2014|\u2013|\s-\s)\s*(.+)$/);
      const eventName = match?.[1]?.trim() || line;
      const resultText = match?.[2]?.trim() || "";
      const link = parseMarkdownLink(resultText);
      const winnerParts = link.text.split(":");
      const winner = winnerParts.shift()?.trim() || link.text;
      const score = winnerParts.join(":").trim();

      return {
        eventName,
        winner,
        score,
        url: link.url
      };
    });
}

function renderWinnerTable(entry) {
  const rows = parseWinnerSummary(entry.description);

  if (!rows.length) {
    return `<p class="admin-muted">No records listed yet.</p>`;
  }

  return `
    <div class="hof-table">
      <div class="hof-table-head">
        <span>Event</span>
        <span>Winner</span>
        <span>Score</span>
        <span></span>
      </div>

      ${rows.map(row => `
        <div class="hof-table-row">
          <strong>${escapeHtml(row.eventName)}</strong>
          <span>${escapeHtml(row.winner)}</span>
          <span>${escapeHtml(row.score)}</span>
          <span>
            ${row.url ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener" title="View proof">🔗</a>` : ""}
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function parseSpeedRecordRows(description) {
  const lines = cleanDiscordText(description)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const rows = [];
  const medalRegex = /^(🥇|🥈|🥉|🎖️?)\s*•?\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const medalMatch = line.match(medalRegex);

    if (!medalMatch) continue;

    const medal = medalMatch[1];
    let text = medalMatch[2] || "";
    let url = extractFirstUrl(text);

    if (!url && lines[i + 1] && /^https?:\/\//i.test(lines[i + 1])) {
      url = extractFirstUrl(lines[i + 1]);
      i += 1;
    }

    text = stripUrls(text)
      .replace(/\s+-\s*$/g, "")
      .trim();

    if (!text) continue;

    rows.push({ medal, text, url });
  }

  return rows;
}

function renderSpeedRecordCard(entry) {
  const rows = parseSpeedRecordRows(entry.description);

  return `
    <article class="card flame-card hof-record-card">
      <h2>${escapeHtml(entry.title)}</h2>

      ${rows.length
        ? `
          <div class="hof-record-list">
            ${rows.map(row => `
              <div class="hof-record-row">
                <span class="hof-medal">${row.medal}</span>
                <strong>${escapeHtml(row.text)}</strong>
                ${row.url ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener" title="View proof">🔗</a>` : ""}
              </div>
            `).join("")}
          </div>
        `
        : `<p class="admin-muted">No record holders listed yet.</p>`
      }
    </article>
  `;
}


function formatDiscordNewsText(value = "") {
  return escapeHtml(String(value))
    .replace(/&lt;@!?\d+&gt;/g, "@member")
    .replace(/&lt;#\d+&gt;/g, "#channel")
    .replace(/\n/g, "<br>");
}

function getClanNewsPreview(entry) {
  const embed = entry.embeds?.[0] || null;
  const source = entry.content || embed?.description || embed?.fields?.[0]?.value || "";
  const plain = String(source)
    .replace(/<@!?\d+>/g, "@member")
    .replace(/<#\d+>/g, "#channel")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`~>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 220 ? `${plain.slice(0, 217).trim()}…` : plain;
}

function renderClanNewsEntry(entry) {
  const embed = entry.embeds?.[0] || null;
  const title = embed?.title || "Clan Update";
  const preview = getClanNewsPreview(entry);
  const date = entry.createdAt
    ? new Date(entry.createdAt).toLocaleDateString("en-CA", { dateStyle: "medium" })
    : "";
  const messageUrl = entry.messageUrl || `https://discord.com/channels/1364728339469832313/1364729142796619846/${entry.id}`;

  return `
    <article class="clan-news-entry clan-news-preview-entry">
      <div class="clan-news-meta">
        ${entry.avatar ? `<img src="${escapeHtml(entry.avatar)}" alt="" loading="lazy">` : ""}
        <span><strong>${escapeHtml(entry.author || "Ironkin Staff")}</strong><small>${escapeHtml(date)}</small></span>
      </div>
      <div class="clan-news-preview-copy">
        <h3>${escapeHtml(title)}</h3>
        ${preview ? `<p>${escapeHtml(preview)}</p>` : ""}
      </div>
      <a class="clan-news-message-link" href="${escapeHtml(messageUrl)}" target="_blank" rel="noopener">Read announcement on Discord →</a>
    </article>`;
}

async function loadClanNews() {
  const feed = document.getElementById("clanNewsFeed");
  if (!feed) return;

  try {
    const response = await fetch("/api/clan-news", { cache: "no-cache" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load clan news.");
    const entries = Array.isArray(data.entries) ? data.entries : [];
    feed.innerHTML = entries.length
      ? entries.slice(0, 4).map(renderClanNewsEntry).join("")
      : `<p class="admin-muted">No clan news has been posted yet.</p>`;
  } catch (error) {
    feed.innerHTML = `<p class="admin-muted">Could not load clan news: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadHallOfFlamePage() {
  const grid = document.getElementById("hallOfFlameGrid");
  if (!grid) return;

  try {
    const response = await fetch("/api/hall-of-flame/discord");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load Hall of Flame.");
    }

    const entries = data.entries || [];

    const sotw = entries.find(entry => entry.title === "Skill of the Week");
    const botw = entries.find(entry => entry.title === "Boss of the Week");

    const records = entries.filter(entry =>
      entry.title &&
      ![
        "Boss of the Week",
        "Skill of the Week",
        "Hall Of Flame Quick Links!"
      ].includes(entry.title)
    );

    grid.innerHTML = `
      <section class="hof-section hof-section-wide">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Competition Winners</p>
            <h2>Event Champions</h2>
          </div>
        </div>

        <div class="hof-winner-grid">
          ${sotw ? `
            <article class="card flame-card hof-summary-card">
              <h2>${escapeHtml(sotw.title)}</h2>
              ${renderWinnerTable(sotw)}
            </article>
          ` : ""}

          ${botw ? `
            <article class="card flame-card hof-summary-card">
              <h2>${escapeHtml(botw.title)}</h2>
              ${renderWinnerTable(botw)}
            </article>
          ` : ""}
        </div>
      </section>

      <section class="hof-section hof-section-wide">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Speed Records</p>
            <h2>Record Boards</h2>
          </div>
        </div>

        <div class="hof-record-grid">
          ${records.length
            ? records.map(renderSpeedRecordCard).join("")
            : `<article class="card"><p>No Discord Hall of Flame records found.</p></article>`
          }
        </div>
      </section>
    `;
  } catch (error) {
    grid.innerHTML = `<article class="card"><p>Could not load Hall of Flame: ${escapeHtml(error.message)}</p></article>`;
  }
}



async function loadDropsForEvent(eventId, listId = "dropsList") {
  const dropsList = document.getElementById(listId);

  if (!dropsList) return;

  try {
    const authResponse = await fetch("/api/auth/me");
    const authData = await authResponse.json();

    const staffRoles = [
      "1364734283356569620",
      "1365445491776815104"
    ];

    const isStaff =
      authData.signedIn &&
      authData.user?.roles?.some(roleId => staffRoles.includes(roleId));

    const response = await fetch(
      `/api/drops/list?eventId=${encodeURIComponent(eventId)}`
    );
    const data = await response.json();

    dropsList.innerHTML = "";

    const drops = data.drops || [];

    if (drops.length === 0) {
      dropsList.textContent = "No drops tracked yet.";
      return;
    }

    drops.forEach(drop => {
      const row = document.createElement("div");
      row.className = "drop-row";

      row.innerHTML = `
        <div class="bounty-drop-main">
          ${drop.image ? `<img src="${escapeHtml(drop.image)}" alt="">` : ""}
          <span><strong>${escapeHtml(drop.name)}</strong>${drop.rewardEmbers ? `<small>${formatNumber(drop.rewardEmbers)} Embers each</small>` : ""}</span>
        </div>

        <div class="drop-controls">
          <strong>${formatNumber(drop.count)}</strong>
        </div>
      `;

      dropsList.appendChild(row);
    });

  } catch {
    dropsList.innerHTML = "";
  }
}

async function changeDropForEvent(eventId, name, direction, listId = "dropsList") {
  const endpoint =
    direction > 0
      ? "/api/drops/increment"
      : "/api/drops/decrement";

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      eventId,
      name
    })
  });

  loadDropsForEvent(eventId, listId);
}

async function loadDrops() {
  const dropsList = document.getElementById("dropsList");

  if (!dropsList) return;

  try {
    const authResponse = await fetch("/api/auth/me");
    const authData = await authResponse.json();

    const staffRoles = [
      "1364734283356569620",
      "1365445491776815104"
    ];

    const isStaff =
      authData.signedIn &&
      authData.user?.roles?.some(roleId => staffRoles.includes(roleId));

    const params = new URLSearchParams(window.location.search);
    const requestedEventId = params.get("id") || "global";
    const eventId =
      requestedEventId === "clan-goal" && resolvedSingleEventDropId
        ? resolvedSingleEventDropId
        : requestedEventId;

    const response = await fetch(
      `/api/drops/list?eventId=${encodeURIComponent(eventId)}`
    );
    const data = await response.json();

    dropsList.innerHTML = "";

    const drops = data.drops || [];

    if (drops.length === 0) {
      dropsList.textContent = "No drops tracked yet.";
      return;
    }

    drops.forEach(drop => {
      const row = document.createElement("div");
      row.className = "drop-row";

      row.innerHTML = `
        <div class="bounty-drop-main">
          ${drop.image ? `<img src="${escapeHtml(drop.image)}" alt="">` : ""}
          <span><strong>${escapeHtml(drop.name)}</strong>${drop.rewardEmbers ? `<small>${formatNumber(drop.rewardEmbers)} Embers each</small>` : ""}</span>
        </div>

        <div class="drop-controls">
          <strong>${formatNumber(drop.count)}</strong>
        </div>
      `;

      dropsList.appendChild(row);
    });

  } catch {
    dropsList.innerHTML = "";
  }
}

async function changeDrop(name, direction) {
  const endpoint =
    direction > 0
      ? "/api/drops/increment"
      : "/api/drops/decrement";

  const requestedEventId =
    new URLSearchParams(window.location.search).get("id") ||
    "global";
  const eventId =
    requestedEventId === "clan-goal" && resolvedSingleEventDropId
      ? resolvedSingleEventDropId
      : requestedEventId;

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      eventId,
      name
    })
  });

  loadDrops();
}

let calendarFilter = "all";

function getCalendarEventType(event) {
  if (event?.eventType) {
    const type = String(event.eventType);
    if (type === "normal") return "other";
    if (type === "clan-goal-skill") return "challenge";
    if (type === "clan-goal-boss") return "mass";
    return type;
  }
  if (event?.category) return String(event.category);

  const title = String(event.title || "").toLowerCase();
  const description = String(event.description || "").toLowerCase();
  const text = `${title} ${description}`;

  if (
    text.includes("sotw") ||
    text.includes("skill of the week")
  ) {
    return "sotw";
  }

  if (
    text.includes("botw") ||
    text.includes("boss of the week")
  ) {
    return "botw";
  }

  if (
    text.includes("mass") ||
    text.includes("huey") ||
    text.includes("barbarian assault") ||
    text.includes("zalcano") ||
    text.includes("callisto") ||
    text.includes("vetion") ||
    text.includes("cox") ||
    text.includes("toa")
  ) {
    return "mass";
  }

  if (
    text.includes("giveaway") ||
    text.includes("bond")
  ) {
    return "giveaway";
  }

  if (
    text.includes("challenge") ||
    text.includes("race") ||
    text.includes("hunt") ||
    text.includes("gambit") ||
    text.includes("crucible") ||
    text.includes("plunder") ||
    text.includes("prop hunt")
  ) {
    return "challenge";
  }

  return "other";
}

function setupCalendarFilters() {
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.onclick = () => {
      calendarFilter = button.dataset.filter || "all";

      document.querySelectorAll("[data-filter]").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");
      loadCalendar();
    };
  });
}

let calendarDate = new Date();
let calendarEventsCache = [];
let calendarView = "month";
let calendarDragStartDate = null;
let calendarDragEndDate = null;
let resolvedSingleEventDropId = null;

function getCalendarEventStart(event) {
  return event?.start || event?.startDate || event?.date || "";
}

function getCalendarEventEnd(event) {
  return event?.end || event?.endDate || getCalendarEventStart(event);
}

function getDateOnlyKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    return String(value).slice(0, 10);
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCalendarEventOnDate(event, dateKey) {
  const startKey = getDateOnlyKey(getCalendarEventStart(event));
  const endKey = getDateOnlyKey(getCalendarEventEnd(event));

  if (!startKey) return false;
  return dateKey >= startKey && dateKey <= (endKey || startKey);
}

function getMultiDayCalendarTitle(event, dateKey) {
  const rawTitle = String(event?.title || "Untitled Event").trim();
  const cleanTitle = rawTitle
    .replace(/\s+(Begins|Ends)$/i, "")
    .trim() || rawTitle;

  const startKey = getDateOnlyKey(getCalendarEventStart(event));
  const endKey = getDateOnlyKey(getCalendarEventEnd(event));

  if (!startKey || !endKey || startKey === endKey) {
    return cleanTitle;
  }

  if (dateKey === startKey) return `${cleanTitle} Begins`;
  if (dateKey === endKey) return `${cleanTitle} Ends`;
  return cleanTitle;
}

function isCalendarEventCancelled(event) {
  return String(event?.status || "").toLowerCase() === "cancelled";
}


function getCalendarEventIcon(event) {
  const type = getCalendarEventType(event);
  const icons = {
    sotw: "📘",
    botw: "💀",
    mass: "⚔️",
    giveaway: "🎁",
    challenge: "📸",
    other: "📅"
  };
  return icons[type] || "📅";
}

function getEventsForDate(events, dateKey) {
  return (Array.isArray(events) ? events : [])
    .filter(event => isCalendarEventOnDate(event, dateKey))
    .sort((a, b) => new Date(getCalendarEventStart(a) || 0) - new Date(getCalendarEventStart(b) || 0));
}

function getEventsForCurrentMonth(events) {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  return (Array.isArray(events) ? events : []).filter(event => {
    const start = new Date(getCalendarEventStart(event));
    const end = new Date(getCalendarEventEnd(event));
    if (!Number.isFinite(start.getTime())) return false;
    const monthStart = new Date(year, month, 1).getTime();
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59).getTime();
    const eventStart = start.getTime();
    const eventEnd = Number.isFinite(end.getTime()) ? end.getTime() : eventStart;
    return eventEnd >= monthStart && eventStart <= monthEnd;
  });
}

function setCalendarMonthCount(events) {
  const countEl = document.getElementById("calendarMonthCount");
  if (!countEl) return;
  const count = getEventsForCurrentMonth(events).length;
  countEl.textContent = `${count} event${count === 1 ? "" : "s"} this month`;
}

function openCalendarEventForm() {
  const panel = document.getElementById("calendarAdminPanel");
  if (!panel || !calendarCurrentUserIsStaff) return;
  panel.hidden = false;
  panel.classList.add("open");
  document.body.classList.add("calendar-modal-active");
}

function closeCalendarEventForm() {
  const panel = document.getElementById("calendarAdminPanel");
  if (!panel) return;
  panel.classList.remove("open");
  document.body.classList.remove("calendar-modal-active");
}

function showCalendarDayEvents(dateKey, dayEvents) {
  closeCalendarEventDetails();
  const backdrop = document.createElement("div");
  backdrop.id = "calendarEventDetailsBackdrop";
  backdrop.className = "calendar-event-details-backdrop";
  const formattedDate = new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  backdrop.innerHTML = `
    <div class="calendar-event-details-card calendar-day-events-card" role="dialog" aria-modal="true">
      <div class="calendar-event-details-header">
        <div>
          <p class="eyebrow">Calendar Day</p>
          <h2>${escapeHtml(formattedDate)}</h2>
        </div>
        <button class="calendar-modal-close" type="button" aria-label="Close day events">×</button>
      </div>
      <div class="calendar-day-event-list">
        ${dayEvents.length ? dayEvents.map(event => `
          <button type="button" class="calendar-day-event-row" data-event-id="${escapeHtml(event.id)}">
            <span>${getCalendarEventIcon(event)}</span>
            <strong>${escapeHtml(getMultiDayCalendarTitle(event, dateKey))}</strong>
            <em>${escapeHtml(formatCalendarTime(getCalendarEventStart(event)) || "All day")}</em>
          </button>
        `).join("") : `<p class="admin-muted">No events on this day.</p>`}
      </div>
      <div class="calendar-event-details-actions">
        ${calendarCurrentUserIsStaff ? `<button class="btn primary" id="calendarCreateFromDayBtn" type="button">Create Event</button>` : ""}
        <button class="btn secondary" id="calendarCloseEventBtn" type="button">Close</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector(".calendar-modal-close")?.addEventListener("click", closeCalendarEventDetails);
  backdrop.querySelector("#calendarCloseEventBtn")?.addEventListener("click", closeCalendarEventDetails);
  backdrop.querySelector("#calendarCreateFromDayBtn")?.addEventListener("click", () => { closeCalendarEventDetails(); selectCalendarAdminDate(dateKey); });
  backdrop.querySelectorAll("[data-event-id]").forEach(button => {
    button.addEventListener("click", () => {
      const event = calendarEventsCache.find(item => item.id === button.dataset.eventId);
      if (event) showCalendarEventDetails(event);
    });
  });
  backdrop.addEventListener("click", clickEvent => {
    if (clickEvent.target === backdrop) closeCalendarEventDetails();
  });
}

function renderCalendarAgenda(events) {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  const now = Date.now();
  const upcoming = (Array.isArray(events) ? events : [])
    .filter(event => !isCalendarEventCancelled(event))
    .filter(event => new Date(getCalendarEventEnd(event) || getCalendarEventStart(event)).getTime() >= now - 86400000)
    .sort((a, b) => new Date(getCalendarEventStart(a) || 0) - new Date(getCalendarEventStart(b) || 0))
    .slice(0, 40);

  grid.className = "calendar-agenda";
  grid.innerHTML = upcoming.length ? upcoming.map(event => `
    <button class="calendar-agenda-row calendar-event-${getCalendarEventType(event)}" type="button" data-event-id="${escapeHtml(event.id)}">
      <span class="calendar-agenda-date">${escapeHtml(formatShortDateTime(getCalendarEventStart(event)))}</span>
      <strong>${getCalendarEventIcon(event)} ${escapeHtml(event.title || "Untitled Event")}</strong>
      <em>${escapeHtml(getEventTypeLabelForCalendar(event))}</em>
    </button>
  `).join("") : `<p class="admin-muted">No upcoming events found.</p>`;

  grid.querySelectorAll("[data-event-id]").forEach(button => {
    button.addEventListener("click", () => {
      const event = calendarEventsCache.find(item => item.id === button.dataset.eventId);
      if (event) showCalendarEventDetails(event);
    });
  });
}

function getEventTypeLabelForCalendar(event) {
  const type = getCalendarEventType(event);
  const labels = { sotw: "SOTW", botw: "BOTW", mass: "Clan Mass / Goal", giveaway: "Giveaway", challenge: "Challenge", other: "Event" };
  return labels[type] || "Event";
}

function renderCalendarMonth(events = calendarEventsCache) {
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarMonthTitle");
  const prevBtn = document.getElementById("prevMonthBtn");
  const nextBtn = document.getElementById("nextMonthBtn");

  if (!grid || !title) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  title.textContent = calendarDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const safeEvents = Array.isArray(events) ? events : [];
  const filteredEvents =
    calendarFilter === "all"
      ? safeEvents
      : safeEvents.filter(event => getCalendarEventType(event) === calendarFilter);

  setCalendarMonthCount(filteredEvents);

  if (calendarView === "agenda") {
    renderCalendarAgenda(filteredEvents);
    return;
  }

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  grid.className = "calendar-grid";
  grid.innerHTML = "";

  for (let i = 0; i < startDay; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day calendar-empty";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";

    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const dayEvents = filteredEvents.filter(event => isCalendarEventOnDate(event, dateKey));

    if (calendarCurrentUserIsStaff) {
      cell.classList.add("calendar-staff-create");
      cell.title = "Click to create an event on this day";
      cell.addEventListener("click", () => selectCalendarAdminDate(dateKey));
      cell.addEventListener("mousedown", event => {
        if (event.button !== 0) return;
        calendarDragStartDate = dateKey;
        calendarDragEndDate = dateKey;
      });
      cell.addEventListener("mouseenter", () => {
        if (calendarDragStartDate) calendarDragEndDate = dateKey;
      });
      cell.addEventListener("mouseup", () => {
        if (calendarDragStartDate && calendarDragEndDate && calendarDragStartDate !== calendarDragEndDate) {
          const ordered = [calendarDragStartDate, calendarDragEndDate].sort();
          selectCalendarAdminDate(ordered[0]);
          const endInput = document.getElementById("calendarEventEndDateInput");
          if (endInput) endInput.value = ordered[1];
        }
        calendarDragStartDate = null;
        calendarDragEndDate = null;
      });
    }

    cell.innerHTML = `
      <strong>${day}</strong>
      <div class="calendar-events"></div>
    `;

    const eventBox = cell.querySelector(".calendar-events");

    const visibleEvents = dayEvents.slice(0, 3);
    visibleEvents.forEach(event => {
      const eventEl = document.createElement("div");
      const sourceClass = event.source === "ironkin-admin" ? " calendar-event-source-ironkin-admin" : "";
      const cancelledClass = isCalendarEventCancelled(event) ? " calendar-event-cancelled" : "";
      eventEl.className = `calendar-event calendar-event-${getCalendarEventType(event)}${sourceClass}${cancelledClass}`;
      const timeText = String(getDateOnlyKey(getCalendarEventStart(event)) || "") === dateKey ? formatCalendarTime(getCalendarEventStart(event)) : "↔";
      const label = `${timeText ? `${timeText} · ` : ""}${getCalendarEventIcon(event)} ${getMultiDayCalendarTitle(event, dateKey)}`;
      eventEl.textContent = label;
      eventEl.title = label;
      eventEl.addEventListener("click", clickEvent => {
        clickEvent.stopPropagation();
        showCalendarEventDetails(event);
      });
      eventBox.appendChild(eventEl);
    });

    if (dayEvents.length > visibleEvents.length) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "calendar-more-events";
      moreBtn.textContent = `+${dayEvents.length - visibleEvents.length} more`;
      moreBtn.addEventListener("click", clickEvent => {
        clickEvent.stopPropagation();
        showCalendarDayEvents(dateKey, dayEvents);
      });
      eventBox.appendChild(moreBtn);
    }

    grid.appendChild(cell);
  }

  if (prevBtn) {
    prevBtn.onclick = () => {
      calendarDate = new Date(year, month - 1, 1);
      renderCalendarMonth();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      calendarDate = new Date(year, month + 1, 1);
      renderCalendarMonth();
    };
  }
}

async function loadCalendar() {
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarMonthTitle");

  if (!grid || !title) return;

  if (!calendarEventsCache.length) {
    grid.textContent = "Loading calendar...";
  } else {
    renderCalendarMonth();
  }

  try {
    const response = await fetch(`/api/calendar/events?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not load calendar.");
    }

    calendarEventsCache = Array.isArray(data.events) ? data.events : [];
    renderCalendarMonth(calendarEventsCache);
    renderCalendarHealthCheck();
  } catch (error) {
    console.warn("Calendar load failed", error);
    renderCalendarMonth(calendarEventsCache);

    const status = document.getElementById("calendarEventFormStatus");
    if (status && calendarCurrentUserIsStaff) {
      status.textContent = `Calendar refresh failed: ${error.message}`;
    }
  }
}

function formatShortDateTime(value) {
  if (!value) return "TBD";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "TBD";

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function formatCalendarTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

async function fetchEmberLeaderboard() {
  const response = await fetch(`/api/embers/leaderboard`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load Ember leaderboard.");
  }

  return data.leaderboard || [];
}

function renderEmberRows(leaders, compact = false) {
  if (!leaders.length) {
    return `<p class="admin-muted">No matching members found.</p>`;
  }

  return leaders.map(player => {
    const rankClass =
      player.rank === 1
        ? "gold"
        : player.rank === 2
        ? "silver"
        : player.rank === 3
        ? "bronze"
        : "";

    const tag = player.user_id ? "a" : "div";
    const href = player.user_id ? ` href="/profile.html?id=${encodeURIComponent(player.user_id)}"` : "";
    return `
      <${tag}${href} class="ember-leader-row ${compact ? "compact" : ""} ${rankClass}">
        <strong>#${player.rank} ${escapeHtml(player.display_name)}</strong>
        <span>${formatNumber(player.balance)} Embers</span>
      </${tag}>
    `;
  }).join("");
}

async function loadEmberLeaderboard() {
  const container = document.getElementById("emberLeaderboard");

  if (!container) return;

  try {
    const leaders = await fetchEmberLeaderboard();

    if (!leaders.length) {
      container.innerHTML = `<p class="admin-muted">No Ember balances found yet.</p>`;
      return;
    }

    const totalEmbers = leaders.reduce(
      (sum, player) => sum + Number(player.balance || 0),
      0
    );

    const highest = leaders[0];

    container.innerHTML = `
      <div class="ember-summary-grid">
        <div>
          <strong>${formatNumber(totalEmbers)}</strong>
          <span>Total Embers</span>
        </div>

        <div>
          <strong>${formatNumber(leaders.length)}</strong>
          <span>Members Ranked</span>
        </div>

        <div>
          <strong>${formatNumber(highest.balance)}</strong>
          <span>Highest Balance</span>
        </div>
      </div>

      <div class="ember-podium" aria-label="Top three Ember holders">
        ${leaders.slice(0, 3).map(player => `
          <a class="ember-podium-card place-${player.rank}" href="/profile.html?id=${encodeURIComponent(player.user_id || "")}">
            <span class="ember-podium-medal">${player.rank === 1 ? "🥇" : player.rank === 2 ? "🥈" : "🥉"}</span>
            <strong>${escapeHtml(player.display_name)}</strong>
            <span>${formatNumber(player.balance)} Embers</span>
            <small>#${player.rank}</small>
          </a>
        `).join("")}
      </div>

      <input
        id="emberSearchInput"
        class="ember-search"
        type="text"
        placeholder="Search member..."
      />

      <div id="emberLeaderboardRows">
        ${renderEmberRows(leaders.slice(3))}
      </div>
    `;

    const searchInput = document.getElementById("emberSearchInput");
    const rowsContainer = document.getElementById("emberLeaderboardRows");

    searchInput.addEventListener("input", () => {
      const search = searchInput.value.toLowerCase().trim();

      const filtered = leaders.filter(player =>
        String(player.display_name || "")
          .toLowerCase()
          .includes(search)
      );

      rowsContainer.innerHTML = renderEmberRows(search ? filtered : leaders.slice(3));
    });
  } catch (error) {
    container.textContent = error.message;
  }
}

async function loadHomeEmberLeaders() {
  const container = document.getElementById("homeEmberLeaders");

  if (!container) return;

  try {
    const leaders = await fetchEmberLeaderboard(3);
    container.innerHTML = renderEmberRows(leaders.slice(0, 3), true);
  } catch (error) {
    container.textContent = "Could not load Embers.";
  }
}

async function loadDiscordStats() {
  const pill = document.getElementById("navDiscordStats");

  if (!pill) return;

  try {
    const response = await fetch("/api/discord/stats");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load Discord stats.");
    }

    pill.innerHTML = `
      <strong>${formatNumber(data.members || 0)}</strong>
      Members
      <span>${formatNumber(data.online || 0)} Online</span>
    `;
  } catch {
    pill.textContent = "";
  }
}


async function loadHomeStatusRail() {
  const members = document.getElementById("homeDiscordMembers");
  const online = document.getElementById("homeDiscordOnline");
  const active = document.getElementById("homeActiveEvents");
  const next = document.getElementById("homeNextEvent");
  if (!members && !online && !active && !next) return;

  try {
    const [discordResponse, eventsResponse, calendarResponse] = await Promise.all([
      fetch("/api/discord/stats"),
      fetch("/api/current-events"),
      fetch("/api/calendar/events")
    ]);
    const discord = await discordResponse.json().catch(() => ({}));
    const eventData = await eventsResponse.json().catch(() => ({}));
    const calendar = await calendarResponse.json().catch(() => ({}));

    if (members) members.textContent = discordResponse.ok ? formatNumber(discord.members || 0) : "—";
    if (online) online.textContent = discordResponse.ok ? formatNumber(discord.online || 0) : "—";
    if (active) {
      const count = (eventData.events || []).filter(event => isEventCurrentlyActiveByDates(event)).length;
      active.textContent = formatNumber(count);
    }
    if (next) {
      const now = Date.now();
      const upcoming = (calendar.events || []).filter(event => getEventStartTime(event) > now).sort((a,b) => getEventStartTime(a)-getEventStartTime(b))[0];
      next.textContent = upcoming ? new Date(upcoming.start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "None";
      if (upcoming) next.title = upcoming.title || "Upcoming event";
    }
  } catch {
    [members, online, active, next].forEach(el => { if (el && el.textContent === "—") el.textContent = "—"; });
  }
}

async function loadUpcomingEventsWidget() {
  const container = document.getElementById("homeUpcomingEvents");

  if (!container) return;

  try {
    const response = await fetch("/api/calendar/events");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load upcoming events.");
    }

    const now = Date.now();
    const upcoming = (data.events || [])
      .filter(event => event.start && new Date(event.start).getTime() >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 4);

    if (!upcoming.length) {
      container.innerHTML = `<div class="premium-empty-state"><span>◇</span><strong>No upcoming events</strong><p>New clan events will appear here as soon as they are scheduled.</p><a href="events.html">Explore events →</a></div>`;
      return;
    }

    container.innerHTML = upcoming.map(event => `
      <div class="upcoming-event-row">
        <div>
          <strong>${displayEventTitle(event.title, event.type)}</strong>
          <span>${formatShortDateTime(event.start)}</span>
        </div>
        <small>${getCalendarEventType(event)}</small>
      </div>
    `).join("");
  } catch (error) {
    container.textContent = "Could not load upcoming events.";
  }
}

function incrementRecord(map, name, amount = 1) {
  if (!name) return;
  map.set(name, (map.get(name) || 0) + amount);
}

function renderRecordRows(entries, suffix = "") {
  if (!entries.length) {
    return `<p class="admin-muted">No records available yet.</p>`;
  }

  return entries.slice(0, 10).map(([name, value], index) => `
    <div class="record-row">
      <strong>#${index + 1} ${name}</strong>
      <span>${formatNumber(value)}${suffix}</span>
    </div>
  `).join("");
}

async function loadRecordsPage() {
  const grid = document.getElementById("recordsGrid");

  if (!grid) return;

  try {
    const archive = await fetchArchive().catch(() => []);
    const emberLeaders = await fetchEmberLeaderboard(10).catch(() => []);

    const wins = new Map();
    const topThreeFinishes = new Map();
    let highestSotw = null;
    let highestBotw = null;

    archive.forEach(entry => {
      if (entry.winner?.name) {
        incrementRecord(wins, entry.winner.name);
      }

      (entry.topFive || []).slice(0, 3).forEach(player => {
        incrementRecord(topThreeFinishes, player.name);
      });

      const winnerGain = Number(entry.winner?.gained || 0);

      if (entry.type === "sotw" && winnerGain) {
        if (!highestSotw || winnerGain > highestSotw.value) {
          highestSotw = { name: entry.winner.name, value: winnerGain, title: entry.title };
        }
      }

      if (entry.type === "botw" && winnerGain) {
        if (!highestBotw || winnerGain > highestBotw.value) {
          highestBotw = { name: entry.winner.name, value: winnerGain, title: entry.title };
        }
      }
    });

    const winRows = [...wins.entries()].sort((a, b) => b[1] - a[1]);
    const topThreeRows = [...topThreeFinishes.entries()].sort((a, b) => b[1] - a[1]);

    grid.innerHTML = `
      <article class="card record-card">
        <p class="eyebrow">Events</p>
        <h2>Most Event Wins</h2>
        ${renderRecordRows(winRows, " wins")}
      </article>

      <article class="card record-card">
        <p class="eyebrow">Events</p>
        <h2>Most Top 3 Finishes</h2>
        ${renderRecordRows(topThreeRows, " finishes")}
      </article>

      <article class="card record-card">
        <p class="eyebrow">SOTW</p>
        <h2>Highest Single Event XP</h2>
        ${highestSotw ? `
          <div class="record-highlight">
            <strong>${highestSotw.name}</strong>
            <span>${formatNumber(highestSotw.value)} XP</span>
            <small>${highestSotw.title}</small>
          </div>
        ` : `<p class="admin-muted">No SOTW archive records yet.</p>`}
      </article>

      <article class="card record-card">
        <p class="eyebrow">BOTW</p>
        <h2>Highest Single Event KC</h2>
        ${highestBotw ? `
          <div class="record-highlight">
            <strong>${highestBotw.name}</strong>
            <span>${formatNumber(highestBotw.value)} KC</span>
            <small>${highestBotw.title}</small>
          </div>
        ` : `<p class="admin-muted">No BOTW archive records yet.</p>`}
      </article>

      <article class="card record-card records-wide">
        <p class="eyebrow">Embers</p>
        <h2>Richest Kin</h2>
        ${renderEmberRows(emberLeaders.slice(0, 5), true)}
      </article>
    `;
  } catch (error) {
    grid.innerHTML = `<article class="card"><p>Could not load records: ${error.message}</p></article>`;
  }
}


const WOM_SKILL_OPTIONS = [
  ["attack", "Attack"],
  ["strength", "Strength"],
  ["defence", "Defence"],
  ["ranged", "Ranged"],
  ["prayer", "Prayer"],
  ["magic", "Magic"],
  ["runecrafting", "Runecrafting"],
  ["construction", "Construction"],
  ["hitpoints", "Hitpoints"],
  ["agility", "Agility"],
  ["herblore", "Herblore"],
  ["thieving", "Thieving"],
  ["crafting", "Crafting"],
  ["fletching", "Fletching"],
  ["slayer", "Slayer"],
  ["hunter", "Hunter"],
  ["mining", "Mining"],
  ["smithing", "Smithing"],
  ["fishing", "Fishing"],
  ["cooking", "Cooking"],
  ["firemaking", "Firemaking"],
  ["woodcutting", "Woodcutting"],
  ["farming", "Farming"]
];

const WOM_BOSS_OPTIONS = [
  ["abyssal_sire", "Abyssal Sire"],
  ["alchemical_hydra", "Alchemical Hydra"],
  ["amoxliatl", "Amoxliatl"],
  ["araxxor", "Araxxor"],
  ["artio", "Artio"],
  ["barrows_chests", "Barrows Chests"],
  ["bryophyta", "Bryophyta"],
  ["callisto", "Callisto"],
  ["calvarion", "Calvar'ion"],
  ["cerberus", "Cerberus"],
  ["chambers_of_xeric", "Chambers of Xeric"],
  ["chambers_of_xeric_challenge_mode", "Chambers of Xeric CM"],
  ["chaos_elemental", "Chaos Elemental"],
  ["chaos_fanatic", "Chaos Fanatic"],
  ["commander_zilyana", "Commander Zilyana"],
  ["corporeal_beast", "Corporeal Beast"],
  ["crazy_archaeologist", "Crazy Archaeologist"],
  ["dagannoth_prime", "Dagannoth Prime"],
  ["dagannoth_rex", "Dagannoth Rex"],
  ["dagannoth_supreme", "Dagannoth Supreme"],
  ["deranged_archaeologist", "Deranged Archaeologist"],
  ["duke_sucellus", "Duke Sucellus"],
  ["general_graardor", "General Graardor"],
  ["giant_mole", "Giant Mole"],
  ["grotesque_guardians", "Grotesque Guardians"],
  ["hespori", "Hespori"],
  ["hueycoatl", "Hueycoatl"],
  ["kalphite_queen", "Kalphite Queen"],
  ["king_black_dragon", "King Black Dragon"],
  ["kraken", "Kraken"],
  ["kreearra", "Kree'arra"],
  ["kril_tsutsaroth", "K'ril Tsutsaroth"],
  ["lunar_chests", "Lunar Chests"],
  ["mimic", "Mimic"],
  ["nex", "Nex"],
  ["nightmare", "Nightmare"],
  ["phosanis_nightmare", "Phosani's Nightmare"],
  ["obor", "Obor"],
  ["phantom_muspah", "Phantom Muspah"],
  ["sarachnis", "Sarachnis"],
  ["scorpia", "Scorpia"],
  ["scurrius", "Scurrius"],
  ["skotizo", "Skotizo"],
  ["sol_heredit", "Sol Heredit"],
  ["spindel", "Spindel"],
  ["tempoross", "Tempoross"],
  ["the_gauntlet", "The Gauntlet"],
  ["the_corrupted_gauntlet", "The Corrupted Gauntlet"],
  ["the_leviathan", "The Leviathan"],
  ["the_whisperer", "The Whisperer"],
  ["theatre_of_blood", "Theatre of Blood"],
  ["theatre_of_blood_hard_mode", "Theatre of Blood HM"],
  ["thermonuclear_smoke_devil", "Thermonuclear Smoke Devil"],
  ["tombs_of_amascut", "Tombs of Amascut"],
  ["tombs_of_amascut_expert", "Tombs of Amascut Expert"],
  ["tzkal_zuk", "TzKal-Zuk"],
  ["tztok_jad", "TzTok-Jad"],
  ["vardorvis", "Vardorvis"],
  ["venenatis", "Venenatis"],
  ["vetion", "Vet'ion"],
  ["vorkath", "Vorkath"],
  ["wintertodt", "Wintertodt"],
  ["yama", "Yama"],
  ["zalcano", "Zalcano"],
  ["zulrah", "Zulrah"]
];

let calendarCurrentUserIsStaff = false;
let calendarSelectedDate = null;
let calendarEditingEventId = null;
let calendarEditingEvent = null;


const IRONKIN_ADMIN_TIME_ZONE = "America/Toronto";

function getTimeZoneOffsetMs(date, timeZone = IRONKIN_ADMIN_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date).reduce((map, part) => {
    if (part.type !== "literal") map[part.type] = part.value;
    return map;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function parseCalendarTwelveHourTime(value, meridiem = "PM") {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3] || String(meridiem || "PM").toUpperCase();

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (suffix === "PM" && hour !== 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;

  return { hour, minute };
}

function calendarEasternWallTimeToUtcIso(dateKey, timeValue, meridiem) {
  if (!dateKey) return "";

  const parsed = parseCalendarTwelveHourTime(timeValue, meridiem);
  if (!parsed) return "";

  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return "";

  const wallTimeAsUtc = Date.UTC(year, month - 1, day, parsed.hour, parsed.minute, 0);
  let utcDate = new Date(wallTimeAsUtc - getTimeZoneOffsetMs(new Date(wallTimeAsUtc)));

  const correctedOffset = getTimeZoneOffsetMs(utcDate);
  utcDate = new Date(wallTimeAsUtc - correctedOffset);

  return utcDate.toISOString();
}

function formatCalendarAdminDateTime(value) {
  if (!value) return { date: "", time: "", meridiem: "PM" };

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: "", time: "", meridiem: "PM" };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IRONKIN_ADMIN_TIME_ZONE,
    hour12: true,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).formatToParts(date).reduce((map, part) => {
    if (part.type !== "literal") map[part.type] = part.value;
    return map;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${Number(parts.hour)}:${parts.minute}`,
    meridiem: parts.dayPeriod || "PM"
  };
}

function setMeridiemValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = String(value || "PM").toUpperCase();
}

function normalizeCalendarTimeInput(inputId, meridiemId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const raw = String(input.value || "").trim().toUpperCase();
  const suffixMatch = raw.match(/\b(AM|PM)\b/);
  if (suffixMatch) {
    setMeridiemValue(meridiemId, suffixMatch[1]);
  }

  const parsed = parseCalendarTwelveHourTime(raw.replace(/\b(AM|PM)\b/g, ""), document.getElementById(meridiemId)?.value || "PM");
  if (!parsed) return;

  const displayHour24 = parsed.hour;
  const meridiem = displayHour24 >= 12 ? "PM" : "AM";
  const hour12 = displayHour24 % 12 || 12;
  const minute = String(parsed.minute).padStart(2, "0");

  input.value = `${hour12}:${minute}`;
  setMeridiemValue(meridiemId, meridiem);
}


function fillCalendarMetricDropdowns() {
  const skillSelect = document.getElementById("calendarSkillMetricInput");
  const bossSelect = document.getElementById("calendarBossMetricInput");

  if (skillSelect && !skillSelect.dataset.loaded) {
    skillSelect.innerHTML = WOM_SKILL_OPTIONS
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
    skillSelect.dataset.loaded = "true";
  }

  if (bossSelect && !bossSelect.dataset.loaded) {
    bossSelect.innerHTML = WOM_BOSS_OPTIONS
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
    bossSelect.dataset.loaded = "true";
  }
}

function setCalendarDateAndTime(dateKey = null) {
  const pad = value => String(value).padStart(2, "0");
  const now = new Date();
  const fallbackDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const selectedDate = dateKey || fallbackDate;

  const startDate = document.getElementById("calendarEventStartDateInput");
  const startTime = document.getElementById("calendarEventStartTimeInput");
  const endDateInput = document.getElementById("calendarEventEndDateInput");
  const endTime = document.getElementById("calendarEventEndTimeInput");

  if (startDate) startDate.value = selectedDate;
  if (startTime) startTime.value = "7:00";
  setMeridiemValue("calendarEventStartMeridiemInput", "PM");

  if (endDateInput) endDateInput.value = selectedDate;
  if (endTime) endTime.value = "8:00";
  setMeridiemValue("calendarEventEndMeridiemInput", "PM");
}

function selectCalendarAdminDate(dateKey = null) {
  calendarSelectedDate = dateKey;
  fillCalendarMetricDropdowns();
  if (!calendarEditingEventId) setCalendarDateAndTime(dateKey);

  const status = document.getElementById("calendarEventFormStatus");
  if (status) status.textContent = dateKey ? `Selected ${dateKey}. Fill in the event details and save.` : "";
  if (dateKey) openCalendarEventForm();
}

function setCalendarFormTitle(text) {
  const title = document.getElementById("calendarAdminFormTitle");
  if (title) title.textContent = text;
}

function clearCalendarEventForm() {
  const form = document.getElementById("calendarEventForm");
  const status = document.getElementById("calendarEventFormStatus");
  if (form) form.reset();
  calendarSelectedDate = null;
  calendarEditingEventId = null;
  calendarEditingEvent = null;
  if (status) status.textContent = "";
  setCalendarFormTitle("Create Event");
  setCalendarDateAndTime();
  const recurringInput = document.getElementById("calendarRecurringInput");
  const discordEventInput = document.getElementById("calendarCreateDiscordEventInput");
  const pingEveryoneInput = document.getElementById("calendarPingEveryoneInput");
  const templateInput = document.getElementById("calendarEventTemplateInput");
  const multiDayInput = document.getElementById("calendarMultiDayInput");
  if (recurringInput) recurringInput.value = "none";
  if (discordEventInput) discordEventInput.checked = true;
  // Announcements historically pinged @everyone, so keep that as the default
  // while allowing staff to opt out per event in Advanced Options.
  if (pingEveryoneInput) pingEveryoneInput.checked = true;
  if (templateInput) templateInput.value = "";
  if (multiDayInput) multiDayInput.checked = false;
  updateCalendarMultiDayFields();
  updateCalendarWomFields();
}

function splitCalendarDateTime(value) {
  return formatCalendarAdminDateTime(value);
}

function getCalendarDateTimeValue(dateId, timeId, meridiemId) {
  const date = document.getElementById(dateId)?.value || "";
  const time = document.getElementById(timeId)?.value || "";
  const meridiem = document.getElementById(meridiemId)?.value || "PM";
  return calendarEasternWallTimeToUtcIso(date, time, meridiem);
}

function isCalendarBotwEventType(eventType) {
  return eventType === "botw" || eventType === "botw-elite" || eventType === "botw-standard";
}

function getCalendarEventTypeInputValue(event) {
  const type = event?.eventType || event?.category || "normal";
  if (type === "botw") {
    return event?.botwTier === "standard" ? "botw-standard" : "botw-elite";
  }
  return type;
}


function updateCalendarMultiDayFields() {
  const multiDayInput = document.getElementById("calendarMultiDayInput");
  const endDateField = document.getElementById("calendarEndDateField");
  const startDateInput = document.getElementById("calendarEventStartDateInput");
  const endDateInput = document.getElementById("calendarEventEndDateInput");
  const isMultiDay = multiDayInput?.checked === true;

  if (endDateField) endDateField.hidden = !isMultiDay;
  if (endDateInput) endDateInput.required = isMultiDay;
  if (!isMultiDay && startDateInput && endDateInput) endDateInput.value = startDateInput.value;
}

function setCalendarAdvancedOptionsOpen(open = false) {
  const advanced = document.querySelector(".calendar-advanced-options");
  if (advanced) advanced.open = open;
}

function updateCalendarWomFields() {
  const createWomInput = document.getElementById("calendarCreateWomInput");
  const eventTypeInput = document.getElementById("calendarEventTypeInput");
  const competitionTypeInput = document.getElementById("calendarCompetitionTypeInput");
  const panel = document.getElementById("calendarWomPanel");
  const competitionTypeField = document.getElementById("calendarCompetitionTypeField");
  const skillField = document.getElementById("calendarSkillMetricField");
  const bossField = document.getElementById("calendarBossMetricField");
  const targetField = document.getElementById("calendarTargetField");
  const targetLabel = document.getElementById("calendarTargetLabel");
  const womAlreadyLinked = document.getElementById("calendarWomAlreadyLinked");

  const createWom = createWomInput?.checked === true;
  const eventType = eventTypeInput?.value || "normal";
  const isClanGoal = eventType === "clan-goal";
  const hasExistingWom = Boolean(calendarEditingEvent?.womCompetitionId);

  let competitionType = competitionTypeInput?.value || "boss-kc";
  if (eventType === "sotw") competitionType = "skill-xp";
  if (isCalendarBotwEventType(eventType) || eventType === "mass") competitionType = "boss-kc";
  if (competitionTypeInput) competitionTypeInput.value = competitionType;

  const needsSkill = competitionType === "skill-xp";
  const needsBoss = competitionType === "boss-kc";

  if (panel) panel.hidden = !createWom && !hasExistingWom;
  if (competitionTypeField) competitionTypeField.hidden = !createWom || hasExistingWom || eventType === "sotw" || isCalendarBotwEventType(eventType) || eventType === "mass";
  if (skillField) skillField.hidden = !createWom || hasExistingWom || !needsSkill;
  if (bossField) bossField.hidden = !createWom || hasExistingWom || !needsBoss;
  if (targetField) targetField.hidden = (!createWom && !hasExistingWom) || !isClanGoal;
  if (targetLabel) targetLabel.textContent = needsSkill ? "Target XP" : "Target KC";
  if (womAlreadyLinked) {
    womAlreadyLinked.hidden = !hasExistingWom;
    womAlreadyLinked.textContent = hasExistingWom ? `WOM already linked: #${calendarEditingEvent.womCompetitionId}. Saving will not create a duplicate.` : "";
  }
}

function getCalendarCompetitionTypeForForm() {
  const eventType = document.getElementById("calendarEventTypeInput")?.value || "normal";
  if (eventType === "sotw") return "skill-xp";
  if (isCalendarBotwEventType(eventType) || eventType === "mass") return "boss-kc";
  return document.getElementById("calendarCompetitionTypeInput")?.value || "boss-kc";
}

function getCalendarWomMetricForForm() {
  const competitionType = getCalendarCompetitionTypeForForm();
  if (competitionType === "skill-xp") {
    return document.getElementById("calendarSkillMetricInput")?.value || "";
  }
  return document.getElementById("calendarBossMetricInput")?.value || "";
}


const DEFAULT_CALENDAR_EVENT_TEMPLATES = {
  "botw-elite": { label: "BOTW Elite", title: "Boss of the Week - Elite", type: "botw-elite", start: "7:00", end: "7:00", durationDays: 7, wom: true, discord: true, description: "" },
  "botw-standard": { label: "BOTW Standard", title: "Boss of the Week", type: "botw-standard", start: "7:00", end: "7:00", durationDays: 7, wom: true, discord: true, description: "" },
  sotw: { label: "SOTW", title: "Skill of the Week", type: "sotw", start: "7:00", end: "7:00", durationDays: 7, wom: true, discord: true, description: "" },
  "clan-goal": { label: "Clan Goal", title: "Clan Goal - ", type: "clan-goal", start: "3:00", end: "3:00", durationDays: 30, wom: true, discord: true, description: "" },
  mass: { label: "Clan Mass", title: "Clan Mass", type: "mass", start: "3:00", end: "4:00", durationDays: 0, wom: false, discord: true, description: "" },
  giveaway: { label: "Giveaway", title: "Giveaway", type: "giveaway", start: "7:00", end: "8:00", durationDays: 0, wom: false, discord: true, description: "" },
  challenge: { label: "Photo/Clan Challenge", title: "Photo Challenge", type: "challenge", start: "7:00", end: "7:00", durationDays: 1, wom: false, discord: true, description: "" },
  "clog-week": { label: "CLog Week", title: "CLog Week", type: "normal", start: "7:00", end: "7:00", durationDays: 7, wom: false, discord: true, description: "" }
};

let CALENDAR_EVENT_TEMPLATES = { ...DEFAULT_CALENDAR_EVENT_TEMPLATES };
let calendarTemplateEditorSelectedKey = "";

function normalizeCalendarTemplateKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeCalendarTemplate(value = {}, fallbackKey = "") {
  const label = String(value.label || value.name || value.title || fallbackKey || "Template").trim();
  const key = normalizeCalendarTemplateKey(value.key || fallbackKey || label);
  return {
    key,
    label,
    title: String(value.title || label || "Event").trim(),
    type: String(value.type || value.eventType || "normal").trim() || "normal",
    start: String(value.start || "7:00").trim(),
    end: String(value.end || "8:00").trim(),
    durationDays: Math.max(0, Math.min(Number(value.durationDays || 0), 365)),
    wom: value.wom === true,
    discord: value.discord === true,
    description: String(value.description || "").trim()
  };
}

function getCalendarTemplatesPayload() {
  return Object.entries(CALENDAR_EVENT_TEMPLATES).reduce((map, [key, value]) => {
    const normalized = normalizeCalendarTemplate(value, key);
    if (normalized.key) map[normalized.key] = normalized;
    return map;
  }, {});
}

function renderCalendarTemplateOptions() {
  const select = document.getElementById("calendarEventTemplateInput");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">No template</option>`;
  Object.entries(CALENDAR_EVENT_TEMPLATES).forEach(([key, template]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = template.label || template.title || key;
    select.appendChild(option);
  });
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

async function loadCalendarEventTemplates() {
  try {
    const response = await fetch("/api/admin/calendar/templates", { credentials: "include" });
    if (!response.ok) throw new Error("Could not load templates.");
    const data = await response.json();
    CALENDAR_EVENT_TEMPLATES = data.templates && typeof data.templates === "object"
      ? data.templates
      : { ...DEFAULT_CALENDAR_EVENT_TEMPLATES };
  } catch {
    CALENDAR_EVENT_TEMPLATES = { ...DEFAULT_CALENDAR_EVENT_TEMPLATES };
  }
  renderCalendarTemplateOptions();
}

async function saveCalendarEventTemplates() {
  const status = document.getElementById("calendarTemplateManagerStatus");
  if (status) status.textContent = "Saving templates...";
  const response = await fetch("/api/admin/calendar/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ templates: getCalendarTemplatesPayload() })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not save templates.");
  CALENDAR_EVENT_TEMPLATES = data.templates || getCalendarTemplatesPayload();
  renderCalendarTemplateOptions();
  renderCalendarTemplateManager();
  if (status) status.textContent = "Templates saved.";
}

function openCalendarTemplateManager() {
  const panel = document.getElementById("calendarTemplateManagerPanel");
  if (!panel) return;
  panel.hidden = false;
  panel.classList.add("open");
  renderCalendarTemplateManager();
}

function closeCalendarTemplateManager() {
  const panel = document.getElementById("calendarTemplateManagerPanel");
  if (!panel) return;
  panel.classList.remove("open");
  panel.hidden = true;
}

function renderCalendarTemplateManager() {
  const list = document.getElementById("calendarTemplateList");
  if (!list) return;
  const entries = Object.entries(CALENDAR_EVENT_TEMPLATES);
  if (!calendarTemplateEditorSelectedKey || !CALENDAR_EVENT_TEMPLATES[calendarTemplateEditorSelectedKey]) {
    calendarTemplateEditorSelectedKey = entries[0]?.[0] || "";
  }

  list.innerHTML = "";
  entries.forEach(([key, template]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-template-list-item${key === calendarTemplateEditorSelectedKey ? " active" : ""}`;
    button.textContent = template.label || template.title || key;
    button.addEventListener("click", () => {
      calendarTemplateEditorSelectedKey = key;
      renderCalendarTemplateManager();
    });
    list.appendChild(button);
  });

  fillCalendarTemplateEditor(calendarTemplateEditorSelectedKey);
}

function fillCalendarTemplateEditor(key) {
  const template = CALENDAR_EVENT_TEMPLATES[key] || normalizeCalendarTemplate({}, key);
  const setValue = (id, value) => {
    const field = document.getElementById(id);
    if (field) field.value = value ?? "";
  };
  setValue("templateEditorLabel", template.label || "");
  setValue("templateEditorKey", key || template.key || "");
  setValue("templateEditorTitle", template.title || "");
  setValue("templateEditorType", template.type || "normal");
  setValue("templateEditorDurationDays", template.durationDays || 0);
  setValue("templateEditorStart", template.start || "7:00");
  setValue("templateEditorEnd", template.end || "8:00");
  setValue("templateEditorDescription", template.description || "");
  const wom = document.getElementById("templateEditorWom");
  const discord = document.getElementById("templateEditorDiscord");
  if (wom) wom.checked = template.wom === true;
  if (discord) discord.checked = template.discord === true;
}

function readCalendarTemplateEditor() {
  const label = document.getElementById("templateEditorLabel")?.value || "";
  const key = normalizeCalendarTemplateKey(document.getElementById("templateEditorKey")?.value || label);
  const template = normalizeCalendarTemplate({
    key,
    label,
    title: document.getElementById("templateEditorTitle")?.value || label,
    type: document.getElementById("templateEditorType")?.value || "normal",
    durationDays: document.getElementById("templateEditorDurationDays")?.value || 0,
    start: document.getElementById("templateEditorStart")?.value || "7:00",
    end: document.getElementById("templateEditorEnd")?.value || "8:00",
    description: document.getElementById("templateEditorDescription")?.value || "",
    wom: document.getElementById("templateEditorWom")?.checked === true,
    discord: document.getElementById("templateEditorDiscord")?.checked === true
  }, key);
  return { key, template };
}

async function handleCalendarTemplateEditorSubmit(event) {
  event.preventDefault();
  const { key, template } = readCalendarTemplateEditor();
  if (!key) {
    const status = document.getElementById("calendarTemplateManagerStatus");
    if (status) status.textContent = "Template key is required.";
    return;
  }

  if (calendarTemplateEditorSelectedKey && calendarTemplateEditorSelectedKey !== key) {
    delete CALENDAR_EVENT_TEMPLATES[calendarTemplateEditorSelectedKey];
  }

  CALENDAR_EVENT_TEMPLATES[key] = template;
  calendarTemplateEditorSelectedKey = key;
  try {
    await saveCalendarEventTemplates();
  } catch (error) {
    const status = document.getElementById("calendarTemplateManagerStatus");
    if (status) status.textContent = error.message || "Could not save templates.";
  }
}


function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dateKey;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function applyCalendarTemplate() {
  const key = document.getElementById("calendarEventTemplateInput")?.value || "";
  const template = CALENDAR_EVENT_TEMPLATES[key];
  if (!template) return;

  const startDate = document.getElementById("calendarEventStartDateInput")?.value || calendarSelectedDate || getDateOnlyKey(new Date().toISOString());
  const titleInput = document.getElementById("calendarEventTitleInput");
  const typeInput = document.getElementById("calendarEventTypeInput");
  const descriptionInput = document.getElementById("calendarEventDescriptionInput");
  const startTime = document.getElementById("calendarEventStartTimeInput");
  const endTime = document.getElementById("calendarEventEndTimeInput");
  const endDate = document.getElementById("calendarEventEndDateInput");
  const createWom = document.getElementById("calendarCreateWomInput");
  const createDiscordEvent = document.getElementById("calendarCreateDiscordEventInput");
  const multiDayInput = document.getElementById("calendarMultiDayInput");

  if (titleInput && !titleInput.value.trim()) titleInput.value = template.title || template.label || "";
  if (descriptionInput && !descriptionInput.value.trim() && template.description) descriptionInput.value = template.description;
  if (typeInput) typeInput.value = template.type || "normal";
  if (startTime) startTime.value = template.start || "7:00";
  if (endTime) endTime.value = template.end || "8:00";
  if (endDate) endDate.value = addDaysToDateKey(startDate, Number(template.durationDays || 0));
  if (createWom) createWom.checked = template.wom === true;
  if (createDiscordEvent) createDiscordEvent.checked = template.discord === true;
  if (multiDayInput) multiDayInput.checked = Number(template.durationDays || 0) > 0;
  setCalendarAdvancedOptionsOpen(template.wom === true || template.discord === true);
  updateCalendarMultiDayFields();
  setMeridiemValue("calendarEventStartMeridiemInput", "PM");
  setMeridiemValue("calendarEventEndMeridiemInput", "PM");
  updateCalendarWomFields();
}

function getCalendarRecurrenceForForm() {
  const value = document.getElementById("calendarRecurringInput")?.value || "none";
  if (value === "weekly-4") return { frequency: "weekly", count: 4 };
  if (value === "weekly-8") return { frequency: "weekly", count: 8 };
  if (value === "biweekly-4") return { frequency: "biweekly", count: 4 };
  if (value === "monthly-3") return { frequency: "monthly", count: 3 };
  return { frequency: "none", count: 1 };
}

function setCalendarEventFormFromEvent(event, { duplicate = false } = {}) {
  closeCalendarEventDetails();
  fillCalendarMetricDropdowns();

  calendarEditingEventId = duplicate ? null : event.id;
  calendarEditingEvent = duplicate ? null : event;

  const titleInput = document.getElementById("calendarEventTitleInput");
  const typeInput = document.getElementById("calendarEventTypeInput");
  const descInput = document.getElementById("calendarEventDescriptionInput");
  const createWomInput = document.getElementById("calendarCreateWomInput");
  const createDiscordEventInput = document.getElementById("calendarCreateDiscordEventInput");
  const pingEveryoneInput = document.getElementById("calendarPingEveryoneInput");
  const multiDayInput = document.getElementById("calendarMultiDayInput");
  const featuredInput = document.getElementById("calendarFeaturedInput");
  const targetInput = document.getElementById("calendarTargetInput");
  const skillInput = document.getElementById("calendarSkillMetricInput");
  const bossInput = document.getElementById("calendarBossMetricInput");
  const competitionInput = document.getElementById("calendarCompetitionTypeInput");
  const startDateInput = document.getElementById("calendarEventStartDateInput");
  const startTimeInput = document.getElementById("calendarEventStartTimeInput");
  const startMeridiemInput = document.getElementById("calendarEventStartMeridiemInput");
  const endDateInput = document.getElementById("calendarEventEndDateInput");
  const endTimeInput = document.getElementById("calendarEventEndTimeInput");
  const endMeridiemInput = document.getElementById("calendarEventEndMeridiemInput");
  const status = document.getElementById("calendarEventFormStatus");

  if (titleInput) titleInput.value = duplicate ? `${event.title || "Untitled Event"} Copy` : (event.title || "");
  if (typeInput) typeInput.value = getCalendarEventTypeInputValue(event);
  if (descInput) descInput.value = event.description || "";
  if (featuredInput) featuredInput.checked = event.featured === true;
  if (targetInput) targetInput.value = event.target || "";
  if (createWomInput) createWomInput.checked = duplicate ? false : Boolean(event.womCompetitionId);
  if (createDiscordEventInput) createDiscordEventInput.checked = duplicate ? false : Boolean(event.discordScheduledEventId);
  // Legacy events predate this setting and should retain the old @everyone behavior.
  if (pingEveryoneInput) pingEveryoneInput.checked = event.pingEveryone !== false;
  setCalendarAdvancedOptionsOpen(Boolean(event.womCompetitionId || event.discordScheduledEventId || event.pingEveryone === false));

  const goalKind = event.goalKind || (event.eventType === "sotw" ? "skill-xp" : "boss-kc");
  if (competitionInput) competitionInput.value = goalKind;
  if (goalKind === "skill-xp" && skillInput && event.womMetric) skillInput.value = event.womMetric;
  if (goalKind !== "skill-xp" && bossInput && event.womMetric) bossInput.value = event.womMetric;

  const start = splitCalendarDateTime(event.start);
  const end = splitCalendarDateTime(event.end);
  if (startDateInput) startDateInput.value = start.date;
  if (startTimeInput) startTimeInput.value = start.time;
  if (startMeridiemInput) startMeridiemInput.value = start.meridiem;
  if (endDateInput) endDateInput.value = end.date;
  if (multiDayInput) multiDayInput.checked = start.date !== end.date;
  updateCalendarMultiDayFields();
  if (endTimeInput) endTimeInput.value = end.time;
  if (endMeridiemInput) endMeridiemInput.value = end.meridiem;

  setCalendarFormTitle(duplicate ? "Duplicate Event" : "Edit Event");
  updateCalendarWomFields();
  if (status) status.textContent = duplicate ? "Duplicating this event. Adjust anything needed, then save." : "Editing existing event. Save to update the calendar and Discord.";
  openCalendarEventForm();
}

async function saveCalendarEventForm(event) {
  event.preventDefault();

  const status = document.getElementById("calendarEventFormStatus");
  const createWomInput = document.getElementById("calendarCreateWomInput");
  const eventType = document.getElementById("calendarEventTypeInput")?.value || "mass";
  const targetValue = document.getElementById("calendarTargetInput")?.value || "";
  const alreadyHasWom = Boolean(calendarEditingEvent?.womCompetitionId);
  const createWom = createWomInput?.checked === true && !alreadyHasWom;
  const isMultiDay = document.getElementById("calendarMultiDayInput")?.checked === true;
  if (!isMultiDay) {
    const startDateValue = document.getElementById("calendarEventStartDateInput")?.value || "";
    const endDateInput = document.getElementById("calendarEventEndDateInput");
    if (endDateInput) endDateInput.value = startDateValue;
  }

  const payload = {
    id: calendarEditingEventId || undefined,
    title: document.getElementById("calendarEventTitleInput")?.value.trim(),
    description: document.getElementById("calendarEventDescriptionInput")?.value.trim(),
    location: "",
    start: getCalendarDateTimeValue("calendarEventStartDateInput", "calendarEventStartTimeInput", "calendarEventStartMeridiemInput"),
    end: getCalendarDateTimeValue("calendarEventEndDateInput", "calendarEventEndTimeInput", "calendarEventEndMeridiemInput"),
    eventType,
    category: isCalendarBotwEventType(eventType) ? "botw" : eventType,
    botwTier: eventType === "botw-standard" ? "standard" : (eventType === "botw-elite" ? "elite" : undefined),
    createWom,
    womMetric: (createWom || alreadyHasWom) ? getCalendarWomMetricForForm() : "",
    womCompetitionId: alreadyHasWom ? calendarEditingEvent.womCompetitionId : "",
    target: (createWom || alreadyHasWom) && targetValue ? Number(targetValue) : null,
    goalKind: getCalendarCompetitionTypeForForm(),
    featured: document.getElementById("calendarFeaturedInput")?.checked === true,
    dropsEnabled: eventType === "clan-goal",
    status: calendarEditingEvent?.status || "scheduled",
    recurrence: getCalendarRecurrenceForForm(),
    createDiscordScheduledEvent: document.getElementById("calendarCreateDiscordEventInput")?.checked === true,
    pingEveryone: document.getElementById("calendarPingEveryoneInput")?.checked === true,
    removeDiscordScheduledEvent: document.getElementById("calendarCreateDiscordEventInput")?.checked !== true && Boolean(calendarEditingEvent?.discordScheduledEventId),
    discordScheduledEventId: calendarEditingEvent?.discordScheduledEventId || ""
  };

  const createDiscordScheduledEvent = document.getElementById("calendarCreateDiscordEventInput")?.checked === true;
  if (status) {
    status.textContent = createWom
      ? "Saving event and creating WOM competition..."
      : (createDiscordScheduledEvent ? "Saving event and creating Discord scheduled event..." : (calendarEditingEventId ? "Updating event..." : "Saving event..."));
  }

  const response = await fetch("/api/admin/calendar/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (status) status.textContent = data.error || "Could not save event.";
    return;
  }

  const savedEvents = Array.isArray(data.events) && data.events.length ? data.events : (data.event ? [data.event] : []);
  if (savedEvents.length) {
    const savedIds = new Set(savedEvents.map(item => item.id));
    calendarEventsCache = [
      ...calendarEventsCache.filter(item => !savedIds.has(item.id)),
      ...savedEvents
    ].sort((a, b) => new Date(getCalendarEventStart(a) || 0) - new Date(getCalendarEventStart(b) || 0));
    renderCalendarMonth(calendarEventsCache);
  }

  const discordEventMessage = data.event?.discordScheduledEventId ? " Discord scheduled event linked." : "";
  const discordEventWarning = data.discordScheduledEvent && data.discordScheduledEvent.synced === false
    ? ` Discord scheduled event was not created: ${data.discordScheduledEvent.reason || "check bot permissions/settings"}.`
    : "";
  const announcementMessage = data.event?.discordAnnouncementMessageId ? " Announcement posted." : "";
  const announcementWarning = data.discordAnnouncement && data.discordAnnouncement.synced === false
    ? ` Announcement was not posted: ${data.discordAnnouncement.reason || "check bot permissions/settings"}.`
    : "";
  const message = data.event?.womCompetitionId
    ? `Event saved instantly. WOM competition #${data.event.womCompetitionId} linked.${discordEventMessage}${announcementMessage}${discordEventWarning}${announcementWarning} Discord calendar board will sync in the background.`
    : `Event saved instantly.${discordEventMessage}${announcementMessage}${discordEventWarning}${announcementWarning} Discord calendar board will sync in the background.`;

  clearCalendarEventForm();
  closeCalendarEventForm();
  if (status) status.textContent = message;

  loadCalendar();
  loadUpcomingEventsWidget();
  loadHomeEventWidgets();
}

function getCalendarEventSource(event) {
  return String(event?.source || event?.calendarSource || "ironkin-admin");
}

function canManageCalendarEvent(event) {
  return calendarCurrentUserIsStaff && getCalendarEventSource(event) === "ironkin-admin" && Boolean(event?.id);
}

function canDeleteCalendarEvent(event) {
  return canManageCalendarEvent(event);
}

function closeCalendarEventDetails() {
  document.getElementById("calendarEventDetailsBackdrop")?.remove();
}

async function deleteCalendarEvent(eventId) {
  const confirmed = confirm("Delete this calendar event? This cannot be undone.");

  if (!confirmed) return;

  const deleteButton = document.getElementById("calendarDeleteEventBtn");
  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.textContent = "Deleting...";
  }

  try {
    const response = await fetch("/api/admin/calendar/event", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not delete event.");
    }

    calendarEventsCache = calendarEventsCache.filter(event => event.id !== eventId);
    closeCalendarEventDetails();
    renderCalendarMonth(calendarEventsCache);
    loadCalendar();
    loadUpcomingEventsWidget();
    loadHomeEventWidgets();
  } catch (error) {
    alert(error.message || "Could not delete event.");

    if (deleteButton) {
      deleteButton.disabled = false;
      deleteButton.textContent = "Delete Event";
    }
  }
}

async function cancelCalendarEvent(eventId) {
  const confirmed = confirm("Cancel this calendar event? It will stay on the site as cancelled and be removed from Discord scheduled events.");
  if (!confirmed) return;

  const cancelButton = document.getElementById("calendarCancelEventBtn");
  if (cancelButton) {
    cancelButton.disabled = true;
    cancelButton.textContent = "Cancelling...";
  }

  try {
    const event = calendarEventsCache.find(item => item.id === eventId);
    if (!event) throw new Error("Event not found.");

    const response = await fetch("/api/admin/calendar/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, status: "cancelled", createWom: false })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not cancel event.");

    calendarEventsCache = [
      ...calendarEventsCache.filter(item => item.id !== data.event.id),
      data.event
    ];
    closeCalendarEventDetails();
    renderCalendarMonth(calendarEventsCache);
    loadCalendar();
  } catch (error) {
    alert(error.message || "Could not cancel event.");
    if (cancelButton) {
      cancelButton.disabled = false;
      cancelButton.textContent = "Cancel Event";
    }
  }
}


async function syncCalendarDiscordScheduledEvent(eventId) {
  const event = calendarEventsCache.find(item => item.id === eventId);
  if (!event) return;
  const button = document.getElementById("calendarSyncDiscordEventBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Syncing...";
  }
  try {
    const response = await fetch("/api/admin/calendar/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, createWom: false, createDiscordScheduledEvent: true })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not sync Discord scheduled event.");
    if (data.event?.discordScheduledEventId) {
      alert("Discord scheduled event synced.");
    } else {
      const reason = data.discordScheduledEvent?.reason || "Discord did not return a scheduled event ID.";
      throw new Error(`Discord scheduled event was not created: ${reason}`);
    }
    loadCalendar();
  } catch (error) {
    alert(error.message || "Could not sync Discord scheduled event.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = event.discordScheduledEventId ? "Update Discord Event" : "Create Discord Event";
    }
  }
}

function showCalendarEventDetails(event) {
  closeCalendarEventDetails();

  const starts = event.start ? formatShortDateTime(event.start) : "TBD";
  const ends = event.end ? formatShortDateTime(event.end) : "TBD";
  const source = getCalendarEventSource(event);
  const isSiteEvent = source === "ironkin-admin";
  const canManage = canManageCalendarEvent(event);
  const showDelete = canDeleteCalendarEvent(event);
  const cancelled = isCalendarEventCancelled(event);

  const womLink = event.womCompetitionId
    ? `
      <a class="text-link" href="https://wiseoldman.net/competitions/${escapeHtml(event.womCompetitionId)}" target="_blank" rel="noopener">
        View WOM Leaderboard →
      </a>
    `
    : "";

  const backdrop = document.createElement("div");
  backdrop.id = "calendarEventDetailsBackdrop";
  backdrop.className = "calendar-event-details-backdrop";

  backdrop.innerHTML = `
    <div class="calendar-event-details-card" role="dialog" aria-modal="true" aria-labelledby="calendarEventDetailsTitle">
      <div class="calendar-event-details-header">
        <div>
          <p class="eyebrow">${cancelled ? "Cancelled Event" : "Ironkin Calendar Event"}</p>
          <h2 id="calendarEventDetailsTitle">${escapeHtml(event.title || "Untitled Event")}</h2>
        </div>

        <button class="calendar-modal-close" type="button" aria-label="Close event details">×</button>
      </div>

      <div class="calendar-event-details-meta">
        <div>
          <span>Starts</span>
          <strong>${escapeHtml(starts)}</strong>
        </div>

        <div>
          <span>Ends</span>
          <strong>${escapeHtml(ends)}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>${escapeHtml(cancelled ? "Cancelled" : (event.status || "Scheduled"))}</strong>
        </div>

        ${event.womCompetitionId ? `
          <div>
            <span>WOM</span>
            <strong>#${escapeHtml(event.womCompetitionId)}</strong>
          </div>
        ` : ""}
      </div>

      ${event.description ? `<p class="calendar-event-details-description">${escapeHtml(event.description)}</p>` : ""}

      ${womLink}

      <div class="calendar-event-details-actions">
        ${canManage ? `<button class="btn secondary" id="calendarEditEventBtn" type="button">Edit Event</button>` : ""}
        ${canManage ? `<button class="btn secondary" id="calendarSyncDiscordEventBtn" type="button">${event.discordScheduledEventId ? "Update Discord Event" : "Create Discord Event"}</button>` : ""}
        ${canManage && !cancelled ? `<button class="btn secondary danger" id="calendarCancelEventBtn" type="button">Cancel Event</button>` : ""}
        ${showDelete ? `<button class="btn secondary danger" id="calendarDeleteEventBtn" type="button">Delete Event</button>` : ""}
        <button class="btn primary" id="calendarCloseEventBtn" type="button">Close</button>
      </div>

      <p class="admin-muted">Times are shown in your local timezone.</p>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector(".calendar-modal-close")?.addEventListener("click", closeCalendarEventDetails);
  backdrop.querySelector("#calendarCloseEventBtn")?.addEventListener("click", closeCalendarEventDetails);
  backdrop.querySelector("#calendarDeleteEventBtn")?.addEventListener("click", () => deleteCalendarEvent(event.id));
  backdrop.querySelector("#calendarCancelEventBtn")?.addEventListener("click", () => cancelCalendarEvent(event.id));
  backdrop.querySelector("#calendarEditEventBtn")?.addEventListener("click", () => setCalendarEventFormFromEvent(event));
  backdrop.querySelector("#calendarSyncDiscordEventBtn")?.addEventListener("click", () => syncCalendarDiscordScheduledEvent(event.id));
  backdrop.addEventListener("click", clickEvent => {
    if (clickEvent.target === backdrop) closeCalendarEventDetails();
  });
}


async function renderCalendarHealthCheck() {
  const card = document.getElementById("calendarHealthCheck");
  if (!card || !calendarCurrentUserIsStaff) return;

  card.hidden = false;
  const now = Date.now();
  const calendarActive = calendarEventsCache.filter(event => {
    const start = new Date(getCalendarEventStart(event)).getTime();
    const end = new Date(getCalendarEventEnd(event)).getTime();
    return !isCalendarEventCancelled(event) && start <= now && end >= now;
  });
  const featured = calendarEventsCache.find(event => event.featured === true && !isCalendarEventCancelled(event));

  let apiEvents = [];
  try {
    const response = await fetch(`/api/current-events?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    apiEvents = Array.isArray(data.events) ? data.events : [];
  } catch {}

  card.innerHTML = `
    <div>
      <p class="eyebrow">Current Event Health Check</p>
      <h2>Event Sync Status</h2>
    </div>
    <div class="calendar-health-grid">
      <div><span>Website current events</span><strong>${apiEvents.length || "None"}</strong></div>
      <div><span>Calendar active now</span><strong>${calendarActive.length || "None"}</strong></div>
      <div><span>Manual featured</span><strong>${featured ? escapeHtml(featured.title || "Untitled") : "None"}</strong></div>
      <div><span>Next calendar event</span><strong>${escapeHtml((calendarEventsCache.find(event => new Date(getCalendarEventStart(event)).getTime() > now && !isCalendarEventCancelled(event)) || {}).title || "None")}</strong></div>
    </div>
  `;
}

async function setupCalendarAdminTools() {
  const panel = document.getElementById("calendarAdminPanel");
  if (!panel) return;

  const user = await getCurrentAuthUser();
  calendarCurrentUserIsStaff = isStaffUser(user);
  panel.hidden = !calendarCurrentUserIsStaff;
  document.getElementById("calendarQuickCreateBtn")?.toggleAttribute("hidden", !calendarCurrentUserIsStaff);
  document.getElementById("calendarManageTemplatesBtn")?.toggleAttribute("hidden", !calendarCurrentUserIsStaff);
  renderCalendarHealthCheck();

  if (!calendarCurrentUserIsStaff) return;

  await loadCalendarEventTemplates();
  fillCalendarMetricDropdowns();

  selectCalendarAdminDate();
  document.getElementById("clearCalendarEventBtn")?.addEventListener("click", clearCalendarEventForm);
  document.getElementById("cancelCalendarFormBtn")?.addEventListener("click", () => { clearCalendarEventForm(); closeCalendarEventForm(); });
  document.getElementById("closeCalendarEventFormBtn")?.addEventListener("click", () => { clearCalendarEventForm(); closeCalendarEventForm(); });
  document.getElementById("calendarQuickCreateBtn")?.addEventListener("click", () => { selectCalendarAdminDate(); openCalendarEventForm(); });
  document.getElementById("calendarManageTemplatesBtn")?.addEventListener("click", openCalendarTemplateManager);
  document.getElementById("closeCalendarTemplateManagerBtn")?.addEventListener("click", closeCalendarTemplateManager);
  document.getElementById("addCalendarTemplateBtn")?.addEventListener("click", () => {
    const baseKey = "new-template";
    let key = baseKey;
    let counter = 2;
    while (CALENDAR_EVENT_TEMPLATES[key]) key = `${baseKey}-${counter++}`;
    CALENDAR_EVENT_TEMPLATES[key] = normalizeCalendarTemplate({ key, label: "New Template", title: "New Event" }, key);
    calendarTemplateEditorSelectedKey = key;
    renderCalendarTemplateManager();
  });
  document.getElementById("deleteCalendarTemplateBtn")?.addEventListener("click", async () => {
    if (!calendarTemplateEditorSelectedKey) return;
    if (!confirm("Delete this event template?")) return;
    delete CALENDAR_EVENT_TEMPLATES[calendarTemplateEditorSelectedKey];
    calendarTemplateEditorSelectedKey = Object.keys(CALENDAR_EVENT_TEMPLATES)[0] || "";
    try {
      await saveCalendarEventTemplates();
    } catch (error) {
      const status = document.getElementById("calendarTemplateManagerStatus");
      if (status) status.textContent = error.message || "Could not delete template.";
    }
  });
  document.getElementById("resetCalendarTemplatesBtn")?.addEventListener("click", async () => {
    if (!confirm("Reset all templates to the default Ironkin set?")) return;
    CALENDAR_EVENT_TEMPLATES = { ...DEFAULT_CALENDAR_EVENT_TEMPLATES };
    calendarTemplateEditorSelectedKey = Object.keys(CALENDAR_EVENT_TEMPLATES)[0] || "";
    try {
      await saveCalendarEventTemplates();
    } catch (error) {
      const status = document.getElementById("calendarTemplateManagerStatus");
      if (status) status.textContent = error.message || "Could not reset templates.";
    }
  });
  document.getElementById("calendarTemplateEditorForm")?.addEventListener("submit", handleCalendarTemplateEditorSubmit);
  document.getElementById("calendarEventTemplateInput")?.addEventListener("change", applyCalendarTemplate);
  document.querySelectorAll("[data-calendar-view]").forEach(button => {
    button.addEventListener("click", () => {
      calendarView = button.dataset.calendarView || "month";
      document.querySelectorAll("[data-calendar-view]").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      renderCalendarMonth(calendarEventsCache);
    });
  });
  document.getElementById("calendarCreateWomInput")?.addEventListener("change", updateCalendarWomFields);
  document.getElementById("calendarEventTypeInput")?.addEventListener("change", updateCalendarWomFields);
  document.getElementById("calendarMultiDayInput")?.addEventListener("change", updateCalendarMultiDayFields);
  document.getElementById("calendarEventStartDateInput")?.addEventListener("change", updateCalendarMultiDayFields);
  document.getElementById("calendarCompetitionTypeInput")?.addEventListener("change", updateCalendarWomFields);
  document.getElementById("calendarEventStartTimeInput")?.addEventListener("blur", () => normalizeCalendarTimeInput("calendarEventStartTimeInput", "calendarEventStartMeridiemInput"));
  document.getElementById("calendarEventEndTimeInput")?.addEventListener("blur", () => normalizeCalendarTimeInput("calendarEventEndTimeInput", "calendarEventEndMeridiemInput"));
  document.getElementById("calendarEventForm")?.addEventListener("submit", saveCalendarEventForm);
  loadCalendar();
}


function formatGiveawayDate(value) {
  if (!value) return "No deadline set";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No deadline set";
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function getGiveawayStatusLabel(giveaway) {
  if (giveaway?.status === "completed") return "Completed";
  if (giveaway?.status === "cancelled") return "Cancelled";
  if (giveaway?.status === "scheduled") return "Scheduled";
  return "Open";
}

function getClosestGiveawayRows(giveaway) {
  const actual = Number(giveaway?.actualKc || 0);
  const submissions = Array.isArray(giveaway?.submissions) ? giveaway.submissions : [];
  if (!actual) return submissions.slice().sort((a, b) => Number(a.kc || 0) - Number(b.kc || 0));

  return submissions
    .slice()
    .sort((a, b) => {
      const diff = Math.abs(Number(a.kc || 0) - actual) - Math.abs(Number(b.kc || 0) - actual);
      if (diff !== 0) return diff;
      return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
    });
}

async function loadGiveawaysPage() {
  const root = document.getElementById("giveawaysApp");
  if (!root) return;

  const [user, response] = await Promise.all([
    getCurrentAuthUser(),
    fetch(`/api/giveaways/list?t=${Date.now()}`, { cache: "no-store" })
  ]);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    root.innerHTML = `<article class="card"><p>Could not load giveaways: ${escapeHtml(data.error || "Unknown error")}</p></article>`;
    return;
  }

  const giveaways = Array.isArray(data.giveaways) ? data.giveaways : [];
  const isStaff = isStaffUser(user);
  const active = giveaways.find(item => item.status === "open") || giveaways.find(item => item.status === "scheduled");
  const current = active || giveaways[0] || null;

  root.innerHTML = `
    <div class="giveaway-layout">
      <section class="giveaway-main card">
        <p class="eyebrow">Clan KC Guess Giveaway</p>
        ${
          current
            ? renderGiveawayUserPanel(current, data.currentUserId)
            : `
              <h2>No giveaway active</h2>
              <p class="muted">A staff member can create the next KC guess giveaway from the Admin tab.</p>
            `
        }
      </section>

      <section class="giveaway-side card">
        <div class="giveaway-tabs">
          <button class="active" type="button" data-giveaway-tab="user">Users</button>
          ${isStaff ? `<button type="button" data-giveaway-tab="admin">Admin</button>` : ""}
        </div>

        <div id="giveawayUserTab" class="giveaway-tab-panel">
          ${renderGiveawayHistory(giveaways)}
        </div>

        ${isStaff ? `
          <div id="giveawayAdminTab" class="giveaway-tab-panel" hidden>
            ${renderGiveawayAdminPanel(current)}
          </div>
        ` : ""}
      </section>
    </div>
  `;

  setupGiveawayHandlers(current, isStaff);
}

function renderGiveawayUserPanel(giveaway, currentUserId) {
  const submissions = Array.isArray(giveaway.submissions) ? giveaway.submissions : [];
  const ownSubmission = submissions.find(item => item.discordId === currentUserId);
  const closed = giveaway.status === "completed" || giveaway.status === "cancelled";
  const completed = giveaway.status === "completed";
  const winnerText = completed
    ? `${giveaway.winnerName || "No winner"}${giveaway.actualKc ? ` won with ${formatNumber(giveaway.winnerKc)} KC. Actual KC: ${formatNumber(giveaway.actualKc)}.` : ""}`
    : "";

  return `
    <div class="giveaway-hero">
      <div>
        <h2>${escapeHtml(giveaway.title || "KC Guess Giveaway")}</h2>
        <p>${escapeHtml(giveaway.description || "Guess the kill count where the drop will land. Closest guess wins, whether lower or higher.")}</p>
      </div>
      <span class="giveaway-status">${escapeHtml(getGiveawayStatusLabel(giveaway))}</span>
    </div>

    <div class="giveaway-detail-grid">
      <div><span>Host</span><strong>${escapeHtml(giveaway.host || "TBD")}</strong></div>
      <div><span>Drop</span><strong>${escapeHtml(giveaway.drop || "TBD")}</strong></div>
      <div><span>Guesses</span><strong>${formatNumber(submissions.length)}</strong></div>
      <div><span>Closes</span><strong>${escapeHtml(formatGiveawayDate(giveaway.closesAt))}</strong></div>
    </div>

    ${completed ? `<div class="giveaway-winner-box">🏆 ${escapeHtml(winnerText)}</div>` : ""}

    ${
      closed
        ? `<p class="admin-muted">This giveaway is closed.</p>`
        : ownSubmission
          ? `
            <div class="giveaway-locked-guess">
              <strong>Your guess is locked in:</strong>
              <span>${escapeHtml(ownSubmission.rsn || "Your RSN")} - ${formatNumber(ownSubmission.kc)} KC</span>
              <small>Guesses cannot be changed after submitting.</small>
            </div>
            <p id="giveawayGuessStatus" class="admin-muted"></p>
          `
          : `
            <form id="giveawayGuessForm" class="giveaway-guess-form">
              <label>
                Your KC Guess
                <input id="giveawayKcInput" type="number" min="0" step="1" required placeholder="Example: 417" />
              </label>
              <button class="btn primary" type="submit">Submit Guess</button>
            </form>
            <p id="giveawayGuessStatus" class="admin-muted">
              Your submission will show as: Your RSN - KC
            </p>
          `
    }

    <section class="giveaway-rules">
      <h3>How it works</h3>
      <ul>
        <li>One guess per member. Guesses cannot be changed after submitting.</li>
        <li>Closest KC wins, whether the guess is lower or higher than the actual drop KC.</li>
        <li>If two guesses are equally close, the earlier submission wins.</li>
        <li>Staff can manually add member guesses from the Admin tab.</li>
        <li>Staff marks the giveaway completed once the drop is obtained.</li>
      </ul>
    </section>
  `;
}

function renderGiveawayHistory(giveaways) {
  if (!giveaways.length) {
    return `<p class="admin-muted">No KC guess giveaways have been created yet.</p>`;
  }

  return `
    <h3>Giveaways</h3>
    <div class="giveaway-history-list">
      ${giveaways.map(item => `
        <div class="giveaway-history-row">
          <strong>${escapeHtml(item.title || "KC Guess Giveaway")}</strong>
          <span>${escapeHtml(item.drop || "Drop TBD")} · ${escapeHtml(getGiveawayStatusLabel(item))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGiveawayAdminPanel(giveaway) {
  const rows = giveaway ? getClosestGiveawayRows(giveaway) : [];
  return `
    <h3>Admin</h3>

    <form id="giveawayAdminForm" class="giveaway-admin-form">
      <input type="hidden" id="giveawayAdminId" value="${escapeHtml(giveaway?.id || "")}" />

      <label>Giveaway Title
        <input id="giveawayAdminTitle" type="text" value="${escapeHtml(giveaway?.title || "")}" placeholder="Example: Vet'ion Ring of the Gods Guess" required />
      </label>

      <label>Host
        <input id="giveawayAdminHost" type="text" value="${escapeHtml(giveaway?.host || "")}" placeholder="Host RSN or Discord name" required />
      </label>

      <label>Drop
        <input id="giveawayAdminDrop" type="text" value="${escapeHtml(giveaway?.drop || "")}" placeholder="Example: Dragon Pickaxe" required />
      </label>

      <label>Description
        <textarea id="giveawayAdminDescription" rows="3" placeholder="Optional giveaway details">${escapeHtml(giveaway?.description || "")}</textarea>
      </label>

      <label>Guessing Closes
        <input id="giveawayAdminClosesAt" type="datetime-local" value="${escapeHtml(formatDateTimeLocalForInput(giveaway?.closesAt))}" />
      </label>

      <label class="checkbox-row">
        <input id="giveawayAdminOpen" type="checkbox" ${!giveaway || giveaway.status === "open" ? "checked" : ""} />
        Open for guesses
      </label>

      <button class="btn primary" type="submit">${giveaway ? "Save Giveaway" : "Create Giveaway"}</button>
      <p id="giveawayAdminStatus" class="admin-muted"></p>
    </form>

    ${giveaway ? `
      <div class="giveaway-complete-box giveaway-manual-entry-box">
        <h3>Add Someone's Guess</h3>
        <p class="admin-muted">Use this for members who gave their RSN and KC guess in Discord instead of submitting on the site.</p>
        <form id="giveawayManualGuessForm" class="giveaway-admin-form giveaway-manual-guess-form">
          <label>RSN
            <input id="giveawayManualRsnInput" type="text" maxlength="40" placeholder="Example: Loote Goblin" required />
          </label>
          <label>KC Guess
            <input id="giveawayManualKcInput" type="number" min="0" step="1" placeholder="Example: 4067" required />
          </label>
          <button class="btn secondary" type="submit">Add Guess</button>
          <p id="giveawayManualGuessStatus" class="admin-muted"></p>
        </form>
      </div>

      <div class="giveaway-complete-box">
        <h3>Complete Giveaway</h3>
        <label>Actual Drop KC
          <input id="giveawayActualKcInput" type="number" min="0" step="1" placeholder="Actual KC" value="${giveaway.actualKc || ""}" />
        </label>
        <button class="btn primary" id="giveawayCompleteBtn" type="button">Mark Completed & Pick Winner</button>
        <button class="btn secondary danger" id="giveawayDeleteBtn" type="button">Delete Giveaway</button>
      </div>

      <h3>Submissions</h3>
      <div class="giveaway-submission-list">
        ${
          rows.length
            ? rows.map((item, index) => `
              <div class="giveaway-submission-row">
                <strong>#${index + 1} ${escapeHtml(item.rsn || item.displayName || "Unknown")}</strong>
                <div class="giveaway-submission-actions">
                  <span>${formatNumber(item.kc)} KC</span>
                  <button
                    class="giveaway-remove-submission-btn"
                    type="button"
                    title="Remove submission"
                    aria-label="Remove ${escapeHtml(item.rsn || item.displayName || "submission")}'s guess"
                    data-giveaway-id="${escapeHtml(giveaway.id || "") }"
                    data-submission-id="${escapeHtml(item.discordId || "") }"
                    data-submitted-at="${escapeHtml(item.submittedAt || "") }"
                    data-rsn="${escapeHtml(item.rsn || item.displayName || "") }"
                  >×</button>
                </div>
              </div>
            `).join("")
            : `<p class="admin-muted">No guesses submitted yet.</p>`
        }
      </div>
    ` : ""}
  `;
}

function formatDateTimeLocalForInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setupGiveawayHandlers(current, isStaff) {
  document.querySelectorAll("[data-giveaway-tab]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-giveaway-tab]").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById("giveawayUserTab").hidden = button.dataset.giveawayTab !== "user";
      const adminTab = document.getElementById("giveawayAdminTab");
      if (adminTab) adminTab.hidden = button.dataset.giveawayTab !== "admin";
    });
  });

  document.getElementById("giveawayGuessForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const status = document.getElementById("giveawayGuessStatus");
    const kc = Number(document.getElementById("giveawayKcInput")?.value || 0);
    if (!current?.id || !Number.isFinite(kc) || kc < 0) return;

    if (status) status.textContent = "Submitting guess...";
    const response = await fetch("/api/giveaways/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giveawayId: current.id, kc })
    });
    const data = await response.json().catch(() => ({}));
    if (status) status.textContent = response.ok ? "Guess saved." : (data.error || "Could not save guess.");
    if (response.ok) setTimeout(loadGiveawaysPage, 500);
  });

  if (!isStaff) return;

  document.getElementById("giveawayAdminForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const status = document.getElementById("giveawayAdminStatus");
    if (status) status.textContent = "Saving giveaway...";

    const payload = {
      id: document.getElementById("giveawayAdminId")?.value || undefined,
      title: document.getElementById("giveawayAdminTitle")?.value || "",
      host: document.getElementById("giveawayAdminHost")?.value || "",
      drop: document.getElementById("giveawayAdminDrop")?.value || "",
      description: document.getElementById("giveawayAdminDescription")?.value || "",
      closesAt: document.getElementById("giveawayAdminClosesAt")?.value || "",
      status: document.getElementById("giveawayAdminOpen")?.checked ? "open" : "scheduled"
    };

    const response = await fetch("/api/admin/giveaways/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (status) status.textContent = response.ok ? "Giveaway saved." : (data.error || "Could not save giveaway.");
    if (response.ok) setTimeout(loadGiveawaysPage, 500);
  });

  document.getElementById("giveawayManualGuessForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const status = document.getElementById("giveawayManualGuessStatus");
    const rsn = document.getElementById("giveawayManualRsnInput")?.value || "";
    const kc = Number(document.getElementById("giveawayManualKcInput")?.value || 0);

    if (!current?.id || !rsn.trim() || !Number.isFinite(kc) || kc < 0 || !Number.isInteger(kc)) {
      if (status) status.textContent = "Enter an RSN and a valid whole-number KC.";
      return;
    }

    if (status) status.textContent = "Adding guess...";

    const response = await fetch("/api/admin/giveaways/submission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giveawayId: current.id, rsn, kc })
    });

    const data = await response.json().catch(() => ({}));
    if (status) status.textContent = response.ok ? "Guess added." : (data.error || "Could not add guess.");
    if (response.ok) setTimeout(loadGiveawaysPage, 500);
  });

  document.querySelectorAll(".giveaway-remove-submission-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const giveawayId = button.dataset.giveawayId || current?.id;
      const rsn = button.dataset.rsn || "this member";
      const confirmed = confirm(`Remove ${rsn}'s KC guess?`);
      if (!confirmed || !giveawayId) return;

      button.disabled = true;
      button.textContent = "…";

      const response = await fetch("/api/admin/giveaways/submission", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giveawayId,
          submissionId: button.dataset.submissionId || "",
          submittedAt: button.dataset.submittedAt || "",
          rsn: button.dataset.rsn || ""
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || "Could not remove submission.");
        button.disabled = false;
        button.textContent = "×";
        return;
      }

      loadGiveawaysPage();
    });
  });

  document.getElementById("giveawayCompleteBtn")?.addEventListener("click", async () => {
    const actualKc = Number(document.getElementById("giveawayActualKcInput")?.value || 0);
    if (!current?.id || !Number.isFinite(actualKc) || actualKc < 0) return;
    const confirmed = confirm("Mark this giveaway completed and pick the closest winner?");
    if (!confirmed) return;

    await fetch("/api/admin/giveaways/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giveawayId: current.id, actualKc })
    });
    loadGiveawaysPage();
  });

  document.getElementById("giveawayDeleteBtn")?.addEventListener("click", async () => {
    if (!current?.id) return;
    const confirmed = confirm("Delete this giveaway and all KC guesses?");
    if (!confirmed) return;

    await fetch("/api/admin/giveaways/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giveawayId: current.id })
    });

    loadGiveawaysPage();
  });
}

loadSiteNav();
loadHomeStats();
loadHomeBingoSignupBanner();
loadRecentActivity();
if (document.getElementById("recentActivity")) setInterval(loadRecentActivity, 60000);
loadClanNews();
if (document.getElementById("clanNewsFeed")) setInterval(loadClanNews, 60000);
loadHomeEventWidgets();
loadEventsHub();
loadSingleEventDashboard();
loadArchivePage();
loadHallOfFlamePage();
setupCalendarFilters();
setupCalendarAdminTools();
loadCalendar();
loadUpcomingEventsWidget();
loadHomeStatusRail();
loadHomeEmberLeaders();
loadEmberLeaderboard();
loadDiscordStats();
loadRecordsPage();

if (document.getElementById("giveawaysApp")) {
  loadGiveawaysPage();
}
/* ===== Premium UI enhancements ===== */
function initPremiumUi() {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.premium-nav-links > a').forEach(link => {
    const href = (link.getAttribute('href') || '').split('?')[0];
    if (href === currentPage || (currentPage === '' && href === 'index.html')) link.setAttribute('aria-current', 'page');
  });

  document.querySelectorAll('.home-panel, .home-news-section, .event-hub-card, .premium-stat-rail, .event-panel').forEach(el => el.classList.add('reveal-on-scroll'));
  const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); }
  }), { threshold: .08 });
  document.querySelectorAll('.reveal-on-scroll').forEach(el => reveal.observe(el));

  const countObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = Number(el.dataset.count || 0);
    const started = performance.now();
    const duration = 850;
    const tick = now => {
      const p = Math.min((now - started) / duration, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    countObserver.unobserve(el);
  }), { threshold: .5 });
  document.querySelectorAll('.premium-count[data-count]').forEach(el => countObserver.observe(el));

  const filterBar = document.querySelector('.event-filter-bar');
  filterBar?.addEventListener('click', event => {
    const button = event.target.closest('[data-event-filter]');
    if (!button) return;
    filterBar.querySelectorAll('[data-event-filter]').forEach(item => item.classList.toggle('is-active', item === button));
    const filter = button.dataset.eventFilter;
    document.querySelectorAll('#eventHubGrid .event-hub-card').forEach(card => {
      const inactive = card.classList.contains('is-inactive') || /not active/i.test(card.textContent || '');
      card.classList.toggle('is-filter-hidden', filter === 'active' ? inactive : filter === 'inactive' ? !inactive : false);
    });
  });

  const hub = document.getElementById('eventHubGrid');
  if (hub) {
    new MutationObserver(() => {
      hub.querySelectorAll('.event-hub-card').forEach((card, index) => {
        card.style.setProperty('--card-index', index);
        card.classList.add('reveal-on-scroll', 'is-visible');
      });
    }).observe(hub, { childList:true });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPremiumUi);
else initPremiumUi();


// Ironkin Games promotional visibility (controlled from Admin > Ironkin Games).
(async function loadIronkinGamesPromoVisibility(){
  const home = document.getElementById("ironkinGamesPromoHome");
  const events = document.getElementById("ironkinGamesPromoEvents");
  if (!home && !events) return;

  // Fail closed: promos stay hidden unless the API explicitly enables them.
  const setPromoVisible = (el, visible) => {
    if (!el) return;
    el.hidden = !visible;
    el.style.setProperty("display", visible ? "block" : "none", "important");
  };

  setPromoVisible(home, false);
  setPromoVisible(events, false);

  try {
    const response = await fetch(`/api/ironkin-games/state?_=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) return;
    const state = await response.json();
    const signupActive = Boolean(state.signupOpen && !state.rosterLocked);
    [home, events].filter(Boolean).forEach(el => {
      const eyebrow = el.querySelector("[data-games-promo-eyebrow]");
      const copy = el.querySelector("[data-games-promo-copy]");
      const cta = el.querySelector("[data-games-promo-cta]");
      if (signupActive) {
        if (eyebrow) eyebrow.textContent = "Registration Open";
        if (copy) copy.textContent = "Signups are now open! Join the competition and get ready to represent your team across five weeks of challenges.";
        if (cta) { cta.textContent = "Sign Up Now"; cta.href = "/ironkin-games-signup.html"; }
      } else {
        if (eyebrow) eyebrow.textContent = "Season Competition";
        if (copy) copy.textContent = "A multi-week team competition with timed challenge reveals, flexible team slots, private proof, and a points leaderboard.";
        if (cta) { cta.textContent = "Open Ironkin Games"; cta.href = "/ironkin-games.html"; }
      }
    });
    setPromoVisible(home, Boolean(state.enabled && state.showOnHome));
    setPromoVisible(events, Boolean(state.enabled && state.showOnEvents));
  } catch (_) {
    // Leave both promos hidden if settings cannot be loaded.
  }
})();
