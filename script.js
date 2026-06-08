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

function getEventPageHref(event) {
  if (isClanGoalEvent(event)) return "event.html?id=clan-goal";
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


function getEventMetricLabel(event) {
  if (event?.type === "sotw") return "XP";
  if (event?.type === "botw") return "KC";
  if (event?.type?.includes("clan-goal")) return "KC";
  return "Gained";
}

function getDefaultRewards(event) {
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
  const isSkillEvent = event?.type === "sotw";
  const densityThreshold = isSkillEvent ? 100000 : 10;
  const densityCount = activeRows.filter(player => Number(player.gained || 0) >= densityThreshold).length;
  const density = activeCount ? Math.round((densityCount / activeCount) * 100) : 0;
  const metricLabel = getEventMetricLabel(event);

  return {
    average: activeCount ? Math.round(totalGained / activeCount) : 0,
    topFiveCombined,
    leaderAdvantage,
    density,
    densityLabel: isSkillEvent ? "100K+ XP" : "10+ KC",
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

function renderDropsPanel() {
  return `
    <section class="event-panel">
      <h2>Unique Drops Received</h2>
      <p>Drops tracked throughout this event.</p>
      <div id="dropsList"></div>
    </section>
  `;
}

function renderRewardsSection(event) {
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
    "clan-goal": "Clan Goal"
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
    "clan-goal": "🔥"
  };

  return icons[type] || "🔥";
}

async function fetchCurrentEvents() {
  const response = await fetch("/api/current-events");
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


async function loadDiscordUser() {
  const loginBtn = document.getElementById("discordLoginBtn");
  const logoutBtn = document.getElementById("discordLogoutBtn");
  const adminNavLink = document.getElementById("adminNavLink");
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

    const navSearch = document.getElementById("navMemberSearch");
    if (navSearch) {
      navSearch.style.display = "block";
      setupMemberSearch();
    }

    if (profileNavLink) {
      profileNavLink.style.display = "none";
    }

    if (isStaffUser(data.user) && adminNavLink) {
      adminNavLink.style.display = "inline-block";
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
    const response = await fetch("nav.html");

    if (!response.ok) {
      throw new Error("Could not load navigation.");
    }

    navMount.innerHTML = await response.text();
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
        <strong>${winner ? escapeHtml(winner.name) : "—"}</strong>
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

async function loadHomeStats() {
  const homeClanXp = document.getElementById("homeClanXp");

  try {
    const events = await fetchCurrentEvents();

    const activeEvents = events.filter(event =>
      hasLiveFeaturedData(event) ||
      isEventCurrentlyActiveByDates(event) ||
      isEventUpcomingByDates(event)
    );
    const featuredEvent = chooseFeaturedEvent(activeEvents);

    if (!featuredEvent) {
      const archive = await fetchArchive().catch(() => []);
      const latestResult = archive[0];

      if (latestResult) {
        renderHomeLastEventResult(latestResult);
        return;
      }

      if (homeClanXp) {
        homeClanXp.textContent = "No Active Event";
      }

      const eventTitle = document.getElementById("homeEventTitle");
      const eventMeta = document.getElementById("homeEventMeta");
      const topThree = document.getElementById("homeTopThree");
      const featuredStats = document.getElementById("homeFeaturedStats");
      const homeTotalGained = document.getElementById("homeTotalGained");
      const homeTotalGainedLabel = document.getElementById("homeTotalGainedLabel");

      if (eventTitle) eventTitle.textContent = "No active event";
      if (eventMeta) eventMeta.textContent = "No previous results found yet.";
      if (topThree) topThree.textContent = "Archive an event to show its final results here.";
      if (featuredStats) featuredStats.innerHTML = "";
      if (homeTotalGained) homeTotalGained.textContent = "—";
      if (homeTotalGainedLabel) homeTotalGainedLabel.textContent = "Total Gained";

      return;
    }

    const standings = await fetchEventStandings(featuredEvent).catch(() => null);
    const eventHasNotStarted = isBeforeEventStart(standings, featuredEvent);

   if (eventHasNotStarted) {
  const eventPercent = document.getElementById("homeEventPercent");
  const eventTitle = document.getElementById("homeEventTitle");
  const eventMeta = document.getElementById("homeEventMeta");
  const topThree = document.getElementById("homeTopThree");
  const featuredStats = document.getElementById("homeFeaturedStats");
  const homeTotalGained = document.getElementById("homeTotalGained");
  const homeTotalGainedLabel = document.getElementById("homeTotalGainedLabel");
  const homeClanXp = document.getElementById("homeClanXp");

  const startText = getCountdownToStart(
    standings?.startsAt || featuredEvent.startDate || featuredEvent.start
  );

  if (eventPercent) eventPercent.textContent = formatEventType(featuredEvent.type);

  if (eventTitle) {
    eventTitle.textContent = displayEventTitle(
      standings?.title || featuredEvent.title,
      featuredEvent.type
    );
  }

  if (eventMeta) {
    eventMeta.textContent = standings?.startsAt
      ? `Starts ${new Date(standings.startsAt).toLocaleString("en-US")}`
      : "Tracking will begin once the event starts.";
  }

  if (homeTotalGained) {
    homeTotalGained.textContent = "Event Starting Soon";
  }

  // This removes the duplicate text under Event Starting Soon
  if (homeTotalGainedLabel) {
    homeTotalGainedLabel.textContent = "";
  }

  if (homeClanXp) {
    homeClanXp.textContent = `Starts in ${startText}`;
  }

  if (featuredStats) {
    featuredStats.innerHTML = `
      <div class="featured-stat featured-stat-countdown">
        <strong>${startText}</strong>
        <span>Until Start</span>
      </div>
    `;
  }

  // Important: only blank this during pre-start.
  // Do not change the active-event leaderboard code later in the file.
  if (topThree) {
    topThree.innerHTML = "";
  }

  return;
}

    const eventPercent = document.getElementById("homeEventPercent");
    const eventTitle = document.getElementById("homeEventTitle");
    const eventMeta = document.getElementById("homeEventMeta");
    const topThree = document.getElementById("homeTopThree");
    const featuredStats = document.getElementById("homeFeaturedStats");
const homeTotalGained =
  document.getElementById("homeTotalGained");
const homeTotalGainedLabel =
  document.getElementById("homeTotalGainedLabel");
    if (eventPercent) {
      eventPercent.textContent = formatEventType(featuredEvent.type);
    }

    if (eventTitle) {
      eventTitle.textContent = displayEventTitle(standings?.title || featuredEvent.title, featuredEvent.type);
    }

    if (eventMeta) {
      eventMeta.textContent =
        standings?.endsAt
          ? `${standings.metric || "Competition"} • Ends ${new Date(standings.endsAt).toLocaleDateString("en-US")}`
          : featuredEvent.description || "Event details coming soon.";
    }

    if (standings) {
      if (homeTotalGained) {
  homeTotalGained.textContent =
    formatNumber(standings.totalGained);
}
      if (homeTotalGainedLabel) {
        homeTotalGainedLabel.textContent = "Total Gained";
      }
      if (homeClanXp) {
        homeClanXp.textContent =
          `${formatNumber(standings.totalGained)} gained`;
      }

      if (featuredStats) {
        const topPlayer = standings.standings?.[0];

        const timeRemaining = standings.endsAt
          ? getTimeRemaining(standings.endsAt)
          : "TBD";

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
          standings.standings.slice(0, 3).forEach((player, index) => {
            const div = document.createElement("div");

            div.innerHTML =
              `<strong>#${index + 1} ${player.name}</strong><span>${formatNumber(player.gained)} gained</span>`;

            topThree.appendChild(div);
          });
        } else {
          topThree.textContent = "No standings yet.";
        }
      }
    } else {
      if (homeTotalGainedLabel) {
        homeTotalGainedLabel.textContent = "Total Gained";
      }

      if (homeClanXp) {
        homeClanXp.textContent = featuredEvent.target
          ? `${formatNumber(featuredEvent.target)} goal`
          : "Coming Soon";
      }

      if (featuredStats) {
        featuredStats.innerHTML = "";
      }

      if (topThree) {
        topThree.textContent = "No WOM competition linked yet.";
      }
    }

    const womResponse =
      await fetch("https://api.wiseoldman.net/v2/groups/12095");

    const womData =
      await womResponse.json();

    if (womResponse.ok) {
      const homeClanMembers = document.getElementById("homeClanMembers");

      if (homeClanMembers) {
        homeClanMembers.textContent =
          womData.memberCount ||
          womData.members?.length ||
          "0";
      }
    }
  } catch (error) {
    if (homeClanXp) {
      homeClanXp.textContent = "Unavailable";
    }

    const eventPercent = document.getElementById("homeEventPercent");
    const eventTitle = document.getElementById("homeEventTitle");
    const eventMeta = document.getElementById("homeEventMeta");
    const topThree = document.getElementById("homeTopThree");

    if (eventPercent) eventPercent.textContent = "Unavailable";
    if (eventTitle) eventTitle.textContent = "Could not load event";
    if (eventMeta) eventMeta.textContent = error.message;
    if (topThree) topThree.textContent = "No competitors loaded.";
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
      container.textContent = "No recent achievements found yet.";
      return;
    }

    container.innerHTML = "";

    data.achievements.slice(0, 6).forEach(item => {
      const row = document.createElement("div");
      row.className = "activity-feed-row";

      const player = item.player || "Unknown";
      const achievement = item.name || "Achievement";
      const date = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString("en-US")
        : "Recent";

      row.innerHTML = `
        <span class="activity-feed-icon">✦</span>

        <div>
          <strong>${player}</strong>
          <span>${achievement}</span>
        </div>

        <small>${date}</small>
      `;

      container.appendChild(row);
    });
  } catch {
    container.textContent = "Could not load recent achievements.";
  }
}

function createEventHubCard({ type, href, icon, label, title, description, active = false, ctaLabel = "View Event →" }) {
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

  let footerHtml = `
    <div class="event-hub-footer event-hub-footer-inactive">
      <span>Not active</span>
    </div>
  `;

  if (href) {
    footerHtml = `
      <div class="event-hub-footer">
        <span>Dashboard</span>
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

    return data.settings || { active: false, signupOpen: false, enableViewEvent: false };
  } catch {
    return { active: false, signupOpen: false, enableViewEvent: false };
  }
}

async function appendBattleshipBingoCard(grid) {
  const settings = await fetchBingoSettings();
  const active = settings.active === true;
  const signupOpen = settings.signupOpen === true;
  const enableViewEvent = settings.enableViewEvent === true;
  const href = enableViewEvent
    ? "battleship-bingo.html"
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
        ? "Event in progress. View the live Battleship Bingo board."
        : (settings.description || "Build a board, split into teams, claim tiles, and track summer progress.")
      : "",
    active,
    ctaLabel: enableViewEvent ? "View Event →" : "Sign Up →"
  }));
}


async function appendGiveawaysHubCard(grid) {
  try {
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
      if (text) text.textContent = "The event has started. Jump straight to the live board.";
      if (link) {
        link.href = "battleship-bingo.html";
        link.textContent = "View Board";
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

async function loadEventsHub() {
  const grid = document.getElementById("eventHubGrid");

  if (!grid) return;

  try {
    const events = await fetchCurrentEvents();

    grid.innerHTML = "";

    if (!events.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No Ironkin events found.";
      grid.appendChild(empty);
      await appendBattleshipBingoCard(grid);
      await appendGiveawaysHubCard(grid);
      return;
    }

    events.forEach(event => {
      const active = isEventActive(event);

      grid.appendChild(createEventHubCard({
        type: event.type,
        href: active ? getEventPageHref(event) : "",
        icon: getEventIcon(event.type),
        label: event.label || formatEventType(event.type),
        title: active ? displayEventTitle(event.title, event.type) : formatInactiveEventTitle(event),
        description: active
          ? (event.description || "View the full Ironkin event dashboard.")
          : formatInactiveEventDescription(event),
        active
      }));
    });

    await appendBattleshipBingoCard(grid);
    await appendGiveawaysHubCard(grid);
  } catch (error) {
    grid.textContent = `Could not load events: ${error.message}`;
  }
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
    const event = eventId === "clan-goal"
      ? events.find(item => isClanGoalEvent(item) && isEventActive(item)) ||
        events.find(item => isClanGoalEvent(item))
      : events.find(item => item.id === eventId);

    if (!event) {
      dashboard.textContent = "Event not found.";
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

    const highestGain =
      standings?.standings?.[0]?.gained || 0;

    const totalLabel = isSotw
      ? "Total XP Gained"
      : isBotw
      ? "Total KC"
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
                      <span class="milestone-marker" style="left:${Math.min(milestone.percent, 97)}%">
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
              isClanGoal
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

async function fetchArchive() {
  const response = await fetch("/api/archive/list");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load archive.");
  }

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
    const [archive, currentUser] = await Promise.all([
      fetchArchive(),
      getCurrentAuthUser()
    ]);

    const canDeleteArchive = isStaffUser(currentUser);

    grid.innerHTML = "";

    if (!archive.length) {
      grid.innerHTML = `
        <article class="card archive-card">
          <p class="eyebrow">No Results Yet</p>
          <h2>Archive is empty</h2>
          <p>Use the admin dashboard's End Event button to save completed events here.</p>
        </article>
      `;
      return;
    }

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
      const separator = line.includes("—") ? "—" : "-";
      const parts = line.split(separator);
      const eventName = parts.shift()?.trim() || "Record";
      const resultText = parts.join(separator).trim();
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
    const eventId = params.get("id") || "global";

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
        <span>${drop.name}</span>

        <div class="drop-controls">
          <strong>${drop.count}</strong>

          ${
            isStaff
              ? `
                <button onclick="changeDrop('${drop.name}', 1)">+</button>
                <button onclick="changeDrop('${drop.name}', -1)">−</button>
              `
              : ""
          }
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

  const eventId =
    new URLSearchParams(window.location.search).get("id") ||
    "global";

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
loadUpcomingEventsWidget();
loadHomeEmberLeaders();
loadEmberLeaderboard();
loadDiscordStats();
loadRecordsPage();
    };
  });
}

let calendarDate = new Date();
let calendarEventsCache = [];

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

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

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
    }

    cell.innerHTML = `
      <strong>${day}</strong>
      <div class="calendar-events"></div>
    `;

    const eventBox = cell.querySelector(".calendar-events");

    dayEvents.forEach(event => {
      const eventEl = document.createElement("div");
      const sourceClass = event.source === "ironkin-admin" ? " calendar-event-source-ironkin-admin" : "";
      const cancelledClass = isCalendarEventCancelled(event) ? " calendar-event-cancelled" : "";
      eventEl.className = `calendar-event calendar-event-${getCalendarEventType(event)}${sourceClass}${cancelledClass}`;
      const timeText = String(getDateOnlyKey(getCalendarEventStart(event)) || "") === dateKey ? formatCalendarTime(getCalendarEventStart(event)) : "↔";
      eventEl.textContent = `${timeText ? `${timeText} · ` : ""}${getMultiDayCalendarTitle(event, dateKey)}`;
      eventEl.addEventListener("click", clickEvent => {
        clickEvent.stopPropagation();
        showCalendarEventDetails(event);
      });
      eventBox.appendChild(eventEl);
    });

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

    return `
      <div class="ember-leader-row ${compact ? "compact" : ""} ${rankClass}">
        <strong>#${player.rank} ${player.display_name}</strong>
        <span>${formatNumber(player.balance)} Embers</span>
      </div>
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

      <input
        id="emberSearchInput"
        class="ember-search"
        type="text"
        placeholder="Search member..."
      />

      <div id="emberLeaderboardRows">
        ${renderEmberRows(leaders)}
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

      rowsContainer.innerHTML = renderEmberRows(filtered);
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
      container.innerHTML = `<p class="admin-muted">No upcoming events found.</p>`;
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
  if (eventType === "botw" || eventType === "mass") competitionType = "boss-kc";
  if (competitionTypeInput) competitionTypeInput.value = competitionType;

  const needsSkill = competitionType === "skill-xp";
  const needsBoss = competitionType === "boss-kc";

  if (panel) panel.hidden = !createWom && !hasExistingWom;
  if (competitionTypeField) competitionTypeField.hidden = !createWom || hasExistingWom || eventType === "sotw" || eventType === "botw" || eventType === "mass";
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
  if (eventType === "botw" || eventType === "mass") return "boss-kc";
  return document.getElementById("calendarCompetitionTypeInput")?.value || "boss-kc";
}

function getCalendarWomMetricForForm() {
  const competitionType = getCalendarCompetitionTypeForForm();
  if (competitionType === "skill-xp") {
    return document.getElementById("calendarSkillMetricInput")?.value || "";
  }
  return document.getElementById("calendarBossMetricInput")?.value || "";
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
  if (typeInput) typeInput.value = event.eventType || event.category || "normal";
  if (descInput) descInput.value = event.description || "";
  if (featuredInput) featuredInput.checked = event.featured === true;
  if (targetInput) targetInput.value = event.target || "";
  if (createWomInput) createWomInput.checked = duplicate ? false : Boolean(event.womCompetitionId);

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
  if (endTimeInput) endTimeInput.value = end.time;
  if (endMeridiemInput) endMeridiemInput.value = end.meridiem;

  setCalendarFormTitle(duplicate ? "Duplicate Event" : "Edit Event");
  updateCalendarWomFields();
  if (status) status.textContent = duplicate ? "Duplicating this event. Adjust anything needed, then save." : "Editing existing event. Save to update the calendar and Discord.";
}

async function saveCalendarEventForm(event) {
  event.preventDefault();

  const status = document.getElementById("calendarEventFormStatus");
  const createWomInput = document.getElementById("calendarCreateWomInput");
  const eventType = document.getElementById("calendarEventTypeInput")?.value || "mass";
  const targetValue = document.getElementById("calendarTargetInput")?.value || "";
  const alreadyHasWom = Boolean(calendarEditingEvent?.womCompetitionId);
  const createWom = createWomInput?.checked === true && !alreadyHasWom;

  const payload = {
    id: calendarEditingEventId || undefined,
    title: document.getElementById("calendarEventTitleInput")?.value.trim(),
    description: document.getElementById("calendarEventDescriptionInput")?.value.trim(),
    location: "",
    start: getCalendarDateTimeValue("calendarEventStartDateInput", "calendarEventStartTimeInput", "calendarEventStartMeridiemInput"),
    end: getCalendarDateTimeValue("calendarEventEndDateInput", "calendarEventEndTimeInput", "calendarEventEndMeridiemInput"),
    eventType,
    category: eventType,
    createWom,
    womMetric: (createWom || alreadyHasWom) ? getCalendarWomMetricForForm() : "",
    womCompetitionId: alreadyHasWom ? calendarEditingEvent.womCompetitionId : "",
    target: (createWom || alreadyHasWom) && targetValue ? Number(targetValue) : null,
    goalKind: getCalendarCompetitionTypeForForm(),
    featured: document.getElementById("calendarFeaturedInput")?.checked === true,
    dropsEnabled: true,
    status: calendarEditingEvent?.status || "scheduled"
  };

  if (status) status.textContent = createWom ? "Saving event and creating WOM competition..." : (calendarEditingEventId ? "Updating event..." : "Saving event...");

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

  if (data.event) {
    calendarEventsCache = [
      ...calendarEventsCache.filter(item => item.id !== data.event.id),
      data.event
    ].sort((a, b) => new Date(getCalendarEventStart(a) || 0) - new Date(getCalendarEventStart(b) || 0));
    renderCalendarMonth(calendarEventsCache);
  }

  const message = data.event?.womCompetitionId
    ? `Event saved instantly. WOM competition #${data.event.womCompetitionId} linked. Discord will sync in the background.`
    : "Event saved instantly. Discord will sync in the background.";

  clearCalendarEventForm();
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
        ${canManage ? `<button class="btn secondary" id="calendarDuplicateEventBtn" type="button">Duplicate</button>` : ""}
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
  backdrop.querySelector("#calendarDuplicateEventBtn")?.addEventListener("click", () => setCalendarEventFormFromEvent(event, { duplicate: true }));
  backdrop.addEventListener("click", clickEvent => {
    if (clickEvent.target === backdrop) closeCalendarEventDetails();
  });
}

async function setupCalendarAdminTools() {
  const panel = document.getElementById("calendarAdminPanel");
  if (!panel) return;

  const user = await getCurrentAuthUser();
  calendarCurrentUserIsStaff = isStaffUser(user);
  panel.hidden = !calendarCurrentUserIsStaff;

  if (!calendarCurrentUserIsStaff) return;

  fillCalendarMetricDropdowns();

  selectCalendarAdminDate();
  document.getElementById("clearCalendarEventBtn")?.addEventListener("click", clearCalendarEventForm);
  document.getElementById("calendarCreateWomInput")?.addEventListener("change", updateCalendarWomFields);
  document.getElementById("calendarEventTypeInput")?.addEventListener("change", updateCalendarWomFields);
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
        : `
          <form id="giveawayGuessForm" class="giveaway-guess-form">
            <label>
              Your KC Guess
              <input id="giveawayKcInput" type="number" min="0" step="1" required placeholder="Example: 417" value="${ownSubmission ? Number(ownSubmission.kc || 0) : ""}" />
            </label>
            <button class="btn primary" type="submit">${ownSubmission ? "Update Guess" : "Submit Guess"}</button>
          </form>
          <p id="giveawayGuessStatus" class="admin-muted">
            Your submission will show as: ${escapeHtml(ownSubmission?.rsn || "Your RSN")} - ${ownSubmission ? formatNumber(ownSubmission.kc) : "KC"}
          </p>
        `
    }

    <section class="giveaway-rules">
      <h3>How it works</h3>
      <ul>
        <li>One guess per member. You can update your guess while the giveaway is open.</li>
        <li>Closest KC wins, whether the guess is lower or higher than the actual drop KC.</li>
        <li>If two guesses are equally close, the earlier submission wins.</li>
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
                <span>${formatNumber(item.kc)} KC</span>
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
loadHomeEventWidgets();
loadEventsHub();
loadSingleEventDashboard();
loadArchivePage();
loadHallOfFlamePage();
setupCalendarFilters();
setupCalendarAdminTools();
loadCalendar();
loadUpcomingEventsWidget();
loadHomeEmberLeaders();
loadEmberLeaderboard();
loadDiscordStats();
loadRecordsPage();

if (document.getElementById("giveawaysApp")) {
  loadGiveawaysPage();
}