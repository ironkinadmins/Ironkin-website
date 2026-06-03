function toggleMenu() {
  const navLinks = document.getElementById("navLinks");

  if (navLinks) {
    navLinks.classList.toggle("show");
  }
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
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

async function loadDiscordUser() {
  const loginBtn = document.getElementById("discordLoginBtn");
  const logoutBtn = document.getElementById("discordLogoutBtn");

  if (!loginBtn) return;

  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();

    if (!data.signedIn) return;

    loginBtn.textContent =
      `Signed in as ${data.user.global_name || data.user.username}`;

    loginBtn.href = "#";

    if (data.user.inGuild) {
      loginBtn.title = "Verified Ironkin Discord member";
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

async function loadHomeStats() {
  const homeClanXp = document.getElementById("homeClanXp");

  try {
    const events = await fetchCurrentEvents();

    const featuredEvent =
      events.find(event => event.featured) ||
      events.find(event => event.womCompetitionId) ||
      events[0];

    if (!featuredEvent) {
      if (homeClanXp) {
        homeClanXp.textContent = "No Active Event";
      }

      const eventTitle = document.getElementById("homeEventTitle");
      const eventMeta = document.getElementById("homeEventMeta");
      const topThree = document.getElementById("homeTopThree");

      if (eventTitle) eventTitle.textContent = "No active event";
      if (eventMeta) eventMeta.textContent = "No event is currently featured.";
      if (topThree) topThree.textContent = "No competitors loaded.";

      return;
    }

    const standings = await fetchEventStandings(featuredEvent).catch(() => null);

    const eventPercent = document.getElementById("homeEventPercent");
    const eventTitle = document.getElementById("homeEventTitle");
    const eventMeta = document.getElementById("homeEventMeta");
    const topThree = document.getElementById("homeTopThree");
    const featuredStats = document.getElementById("homeFeaturedStats");
const homeTotalGained =
  document.getElementById("homeTotalGained");
    if (eventPercent) {
      eventPercent.textContent = formatEventType(featuredEvent.type);
    }

    if (eventTitle) {
      eventTitle.textContent = standings?.title || featuredEvent.title;
    }

    if (eventMeta) {
      eventMeta.textContent =
        standings?.endsAt
          ? `${standings.metric || "Competition"} • Ends ${new Date(standings.endsAt).toLocaleDateString()}`
          : featuredEvent.description || "Event details coming soon.";
    }

    if (standings) {
      if (homeTotalGained) {
  homeTotalGained.textContent =
    formatNumber(standings.totalGained);
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
        ? new Date(item.createdAt).toLocaleDateString()
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

function createEventHubCard({ type, href, icon, label, title, description }) {
  const card = document.createElement("a");

  card.className = `event-hub-card event-${type}`;
  card.href = href;

  card.innerHTML = `
    <div class="event-hub-icon">${icon}</div>

    <div>
      <p class="eyebrow">${label}</p>
      <h2>${title}</h2>
      <p>${description}</p>
    </div>

    <div class="event-hub-footer">
      <span>Dashboard</span>
      <strong>View Event →</strong>
    </div>
  `;

  return card;
}

function appendBattleshipBingoCard(grid) {
  grid.appendChild(createEventHubCard({
    type: "bingo",
    href: "battleship-bingo.html",
    icon: "🚢",
    label: "BINGO",
    title: "Battleship Bingo",
    description: "Build a board, split into teams, claim tiles, and track summer progress."
  }));
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
      appendBattleshipBingoCard(grid);
      return;
    }

    events.forEach(event => {
      grid.appendChild(createEventHubCard({
        type: event.type,
        href: `event.html?id=${encodeURIComponent(event.id)}`,
        icon: getEventIcon(event.type),
        label: event.label || formatEventType(event.type),
        title: event.title,
        description: event.description || "View the full Ironkin event dashboard."
      }));
    });

    appendBattleshipBingoCard(grid);
  } catch (error) {
    grid.textContent = `Could not load events: ${error.message}`;
  }
}

async function loadSingleEventDashboard() {
  const dashboard = document.getElementById("singleEventDashboard");

  if (!dashboard) return;

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId) {
    dashboard.textContent = "Missing event ID.";
    return;
  }

  try {
    const events = await fetchCurrentEvents();
    const event = events.find(item => item.id === eventId);

    if (!event) {
      dashboard.textContent = "Event not found.";
      return;
    }

    const standings = await fetchEventStandings(event).catch(() => null);

    const totalGained = standings?.totalGained || 0;
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

    const topContributors = standings?.standings
      ?.filter(player => player.gained > 0)
      .slice(0, 5) || [];

    const eventDateText =
      standings?.startsAt && standings?.endsAt
        ? `${new Date(standings.startsAt).toLocaleDateString()} - ${new Date(standings.endsAt).toLocaleDateString()}`
        : event.startDate && event.endDate
        ? `${new Date(event.startDate).toLocaleDateString()} - ${new Date(event.endDate).toLocaleDateString()}`
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
              ${standings?.title || event.title}
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
                    : "No gained KC/XP yet."
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
    const activeEvents = events.filter(event => event.active !== false);

    if (activeGrid) {
      activeGrid.innerHTML = "";

      if (activeEvents.length === 0) {
        activeGrid.textContent = "No active events right now.";
      } else {
        activeEvents.slice(0, 3).forEach(event => {
          const row = document.createElement("a");
          row.className = "home-active-event-row";
          row.href = `event.html?id=${encodeURIComponent(event.id)}`;
          row.innerHTML = `
            <span>${getEventIcon(event.type)}</span>
            <div>
              <strong>${event.title}</strong>
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
        <h2>${clanGoal.title}</h2>
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

        <a class="btn primary" href="event.html?id=${encodeURIComponent(clanGoal.id)}">View Clan Goal</a>
      `;
    }
  } catch (error) {
    if (activeGrid) activeGrid.textContent = `Could not load active events: ${error.message}`;
    if (clanGoalWidget) clanGoalWidget.querySelector("p")?.remove();
  }
}


function getArchiveWinnerText(entry) {
  if (!entry?.winner) return "No winner recorded";

  const metric = getEventMetricLabel(entry);
  return `${entry.winner.name} · ${formatNumber(entry.winner.gained)} ${metric}`;
}

function renderArchivedTopFive(entry) {
  const topFive = entry.topFive || [];

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

async function loadArchivePage() {
  const grid = document.getElementById("archiveGrid");

  if (!grid) return;

  try {
    const archive = await fetchArchive();

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
        ? new Date(entry.endedAt).toLocaleDateString()
        : "Archived";

      card.innerHTML = `
        <p class="eyebrow">${entry.label || formatEventType(entry.type)} · ${dateText}</p>

        <h2>${entry.title}</h2>

        <p>
          <strong>Winner:</strong> ${getArchiveWinnerText(entry)}
        </p>

        <div class="archive-results-list">
          ${renderArchivedTopFive(entry)}
        </div>

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
      `;

      grid.appendChild(card);
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

async function loadCalendar() {
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

  try {
    const response = await fetch("/api/calendar/events");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load calendar.");
    }

    const events = data.events || [];

    const filteredEvents =
      calendarFilter === "all"
        ? events
        : events.filter(event => getCalendarEventType(event) === calendarFilter);

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

      const dayEvents = filteredEvents.filter(event =>
        event.start && event.start.slice(0, 10) === dateKey
      );

      cell.innerHTML = `
        <strong>${day}</strong>
        <div class="calendar-events"></div>
      `;

      const eventBox = cell.querySelector(".calendar-events");

      dayEvents.forEach(event => {
        const eventEl = document.createElement("div");
        eventEl.className = `calendar-event calendar-event-${getCalendarEventType(event)}`;
        eventEl.textContent = event.title;
        eventBox.appendChild(eventEl);
      });

      grid.appendChild(cell);
    }
  } catch (error) {
    grid.textContent = error.message;
  }

  if (prevBtn) {
    prevBtn.onclick = () => {
      calendarDate = new Date(year, month - 1, 1);
      loadCalendar();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      calendarDate = new Date(year, month + 1, 1);
      loadCalendar();
    };
  }
}


function formatShortDateTime(value) {
  if (!value) return "TBD";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
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
          <strong>${event.title}</strong>
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

loadSiteNav();
loadHomeStats();
loadRecentActivity();
loadHomeEventWidgets();
loadEventsHub();
loadSingleEventDashboard();
loadArchivePage();
loadHallOfFlamePage();
setupCalendarFilters();
loadCalendar();
loadUpcomingEventsWidget();
loadHomeEmberLeaders();
loadEmberLeaderboard();
loadDiscordStats();
loadRecordsPage();