function toggleMenu() {
  const navLinks = document.getElementById("navLinks");

  if (navLinks) {
    navLinks.classList.toggle("show");
  }
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
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

  if (!homeClanXp) return;

  try {
    const events = await fetchCurrentEvents();

    const featuredEvent =
      events.find(event => event.featured) ||
      events.find(event => event.womCompetitionId) ||
      events[0];

    if (!featuredEvent) {
      homeClanXp.textContent = "No Active Event";
      return;
    }

    const standings = await fetchEventStandings(featuredEvent).catch(() => null);

    const eventPercent = document.getElementById("homeEventPercent");
    const eventTitle = document.getElementById("homeEventTitle");
    const eventMeta = document.getElementById("homeEventMeta");
    const topThree = document.getElementById("homeTopThree");

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
      homeClanXp.textContent =
        `${formatNumber(standings.totalGained)} gained`;

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
      homeClanXp.textContent = featuredEvent.target
        ? `${formatNumber(featuredEvent.target)} goal`
        : "Coming Soon";

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
    homeClanXp.textContent = "Unavailable";

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

    container.innerHTML = `<div class="activity-track"></div>`;

    const track = container.querySelector(".activity-track");
    const doubled = [...data.achievements, ...data.achievements];

    doubled.forEach(item => {
      const card = document.createElement("div");

      card.className = "achievement-pill";

      const player = item.player || "Unknown";
      const achievement = item.name || "Achievement";
      const date = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString()
        : "Recent";

      card.innerHTML = `
        <strong>${player}</strong>
        <span>${achievement}</span>
        <small>${date}</small>
      `;

      track.appendChild(card);
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

                  <span class="milestone-marker" style="left:25%">
                    <strong>25%</strong>
                    <small>Clan Mass</small>
                  </span>

                  <span class="milestone-marker" style="left:50%">
                    <strong>50%</strong>
                    <small>Bond Giveaway</small>
                  </span>

                  <span class="milestone-marker" style="left:75%">
                    <strong>75%</strong>
                    <small>Bonus Embers</small>
                  </span>

                  <span class="milestone-marker" style="left:97%">
                    <strong>100%</strong>
                    <small>Bond Giveaway</small>
                  </span>
                </div>
              `
              : ""
          }

          <div class="event-detail-grid">

            <section class="event-panel">

              <h2>Top Contributors</h2>

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

            <section class="event-panel">

              <h2>Unique Drops Received</h2>

              <p>
                Drops tracked throughout this event.
              </p>

              <div id="dropsList"></div>

            </section>

          </div>

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

    const response = await fetch("/api/drops/list");
    const data = await response.json();

    dropsList.innerHTML = "";

let drops = data.drops || [];

if (drops.length === 0) {
  drops = [
    { name: "Huey Hide", count: 0 },
    { name: "Tome of Earth", count: 0 },
    { name: "Dragon Hunter Wand", count: 0 },
    { name: "Huberte", count: 0 }
  ];
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

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name })
  });

  loadDrops();
}

loadDiscordUser();
loadHomeStats();
loadRecentActivity();
loadEventsHub();
loadSingleEventDashboard();