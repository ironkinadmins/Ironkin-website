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

async function loadEventsHub() {
  const grid = document.getElementById("eventHubGrid");

  if (!grid) return;

  try {
    const events = await fetchCurrentEvents();

    if (!events.length) {
      grid.textContent = "No Ironkin events found.";
      return;
    }

    grid.innerHTML = "";

    events.forEach(event => {
      const card = document.createElement("a");

      card.className = `event-hub-card event-${event.type}`;
      card.href = `event.html?id=${encodeURIComponent(event.id)}`;

      card.innerHTML = `
        <div class="event-hub-icon">${getEventIcon(event.type)}</div>

        <div>
          <p class="eyebrow">${event.label || formatEventType(event.type)}</p>
          <h2>${event.title}</h2>
          <p>${event.description || "View the full Ironkin event dashboard."}</p>
        </div>

        <div class="event-hub-footer">
          <span>Dashboard</span>
          <strong>View Event →</strong>
        </div>
      `;

      grid.appendChild(card);
    });
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

async function loadHallOfFlamePage() {
  const grid = document.getElementById("hallOfFlameGrid");

  if (!grid) return;

  try {
    const archive = await fetchArchive();
    const completedWithWinners = archive.filter(entry => entry.winner);

    const botw = completedWithWinners.filter(entry => entry.type === "botw");
    const sotw = completedWithWinners.filter(entry => entry.type === "sotw");
    const clanGoals = completedWithWinners.filter(entry =>
      String(entry.type || "").includes("clan-goal")
    );

    function buildFlameCard(title, entries, emptyText) {
      return `
        <article class="card flame-card">
          <h2>${title}</h2>

          <div class="flame-list">
            ${
              entries.length
                ? entries.slice(0, 12).map(entry => `
                    <div>
                      <strong>${entry.title}</strong>
                      <span>${getArchiveWinnerText(entry)}</span>
                    </div>
                  `).join("")
                : `<p class="admin-muted">${emptyText}</p>`
            }
          </div>
        </article>
      `;
    }

    grid.innerHTML = `
      ${buildFlameCard("Boss of the Week", botw, "No BOTW winners archived yet.")}
      ${buildFlameCard("Skill of the Week", sotw, "No SOTW winners archived yet.")}
      ${buildFlameCard("Clan Goals", clanGoals, "No clan goal completions archived yet.")}
    `;
  } catch (error) {
    grid.innerHTML = `
      <article class="card">
        <p>Could not load Hall of Flame: ${error.message}</p>
      </article>
    `;
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

      const dateKey = new Date(year, month, day).toISOString().slice(0, 10);

      const dayEvents = events.filter(event =>
        event.start && event.start.slice(0, 10) === dateKey
      );

      cell.innerHTML = `
        <strong>${day}</strong>
        <div class="calendar-events"></div>
      `;

      const eventBox = cell.querySelector(".calendar-events");

      dayEvents.forEach(event => {
        const eventEl = document.createElement("div");
        eventEl.className = "calendar-event";
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
loadDiscordUser();
loadHomeStats();
loadRecentActivity();
loadHomeEventWidgets();
loadEventsHub();
loadSingleEventDashboard();
loadArchivePage();
loadHallOfFlamePage();
loadCalendar();