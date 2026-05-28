function toggleMenu() {
  const navLinks = document.getElementById("navLinks");

  if (navLinks) {
    navLinks.classList.toggle("show");
  }
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

  const formatNumber = (num) =>
    Number(num || 0).toLocaleString();

  try {
    const eventResponse = await fetch("/api/event-standings");
    const eventData = await eventResponse.json();

    if (eventResponse.ok && eventData.active) {
      homeClanXp.textContent =
        `${formatNumber(eventData.totalGained)} gained`;

      document.getElementById("homeEventPercent").textContent =
        eventData.type === "clan_goal"
          ? "Clan Goal"
          : eventData.type.toUpperCase();

      document.getElementById("homeEventTitle").textContent =
        eventData.title;

      document.getElementById("homeEventMeta").textContent =
        `${eventData.metric || "Competition"} • Ends ${new Date(eventData.endsAt).toLocaleDateString()}`;

      const topThree =
        document.getElementById("homeTopThree");

      topThree.innerHTML = "";

      if (eventData.standings?.length) {
        eventData.standings.slice(0, 3).forEach((player, index) => {
          const div = document.createElement("div");

          div.innerHTML =
            `<strong>#${index + 1} ${player.name}</strong><span>${formatNumber(player.gained)} gained</span>`;

          topThree.appendChild(div);
        });
      } else {
        topThree.textContent =
          "No standings yet.";
      }
    } else {
      homeClanXp.textContent =
        "No Active Event";

      document.getElementById("homeEventPercent").textContent =
        "Standby";

      document.getElementById("homeEventTitle").textContent =
        "No Active Competition";

      document.getElementById("homeEventMeta").textContent =
        "Waiting for the next SOTW, BOTW, or Clan Goal.";

      document.getElementById("homeTopThree").textContent =
        "No standings available.";
    }

    const womResponse =
      await fetch("https://api.wiseoldman.net/v2/groups/12095");

    const womData =
      await womResponse.json();

    if (womResponse.ok) {
      document.getElementById("homeClanMembers").textContent =
        womData.memberCount ||
        womData.members?.length ||
        "0";
    }
  } catch (error) {
    homeClanXp.textContent =
      "Unavailable";

    document.getElementById("homeEventPercent").textContent =
      "Unavailable";

    const eventTitle =
      document.getElementById("homeEventTitle");

    const eventMeta =
      document.getElementById("homeEventMeta");

    const topThree =
      document.getElementById("homeTopThree");

    if (eventTitle) eventTitle.textContent =
      "Could not load event";

    if (eventMeta) eventMeta.textContent =
      error.message;

    if (topThree) topThree.textContent =
      "No competitors loaded.";
  }
}

async function loadRecentActivity() {
  const container = document.getElementById("recentActivity");

  if (!container) return;

  try {
    const response = await fetch("/api/recent-activity");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Could not load activity."
      );
    }

    if (!data.achievements || data.achievements.length === 0) {
      container.textContent =
        "No recent achievements found yet.";

      return;
    }

    container.innerHTML =
      `<div class="activity-track"></div>`;

    const track =
      container.querySelector(".activity-track");

    const doubled = [
      ...data.achievements,
      ...data.achievements
    ];

    doubled.forEach(item => {
      const card =
        document.createElement("div");

      card.className =
        "achievement-pill";

const player =
  item.player || "Unknown";

const achievement =
  item.name || "Achievement";

const date =
  item.createdAt
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
    container.textContent =
      "Could not load recent achievements.";
  }
}

async function loadDynamicEventPage() {
  const eventsGrid = document.getElementById("eventsGrid");

  if (!eventsGrid) return;

  const formatNumber = (num) =>
    Number(num || 0).toLocaleString();

  try {
    const response = await fetch("/api/current-events");
    const data = await response.json();

    if (!response.ok || !data.events || data.events.length === 0) {
      eventsGrid.textContent =
        "No active Ironkin events found.";

      return;
    }

    eventsGrid.innerHTML = "";

    for (const event of data.events) {
      const card = document.createElement("article");

      card.className = "event-card";

      // NON-WOM EVENTS
      if (!event.womCompetitionId) {
        card.innerHTML = `
          <div class="event-card-header">
            <div>
              <p class="eyebrow">${event.title}</p>
              <h2>${event.type.toUpperCase()}</h2>
              <p>No active WOM competition yet.</p>
            </div>

            <span class="event-type-badge">
              ${event.type}
            </span>
          </div>
        `;

        eventsGrid.appendChild(card);

        continue;
      }

      // WOM EVENTS
      const standingsResponse = await fetch(
        `/api/event-standings?competitionId=${event.womCompetitionId}`
      );

      const standingsData = await standingsResponse.json();

      card.innerHTML = `
        <div class="event-card-header">
          <div>
            <p class="eyebrow">${event.title}</p>

            <h2>
              ${standingsData.title || event.title}
            </h2>

            <p>
              ${standingsData.metric || "Competition"}
            </p>
          </div>

          <span class="event-type-badge">
            ${event.type}
          </span>
        </div>

        <div class="event-stats">

          <div class="event-stat">
            <strong>
              ${formatNumber(standingsData.totalGained)}
            </strong>

            <span>Total Gained</span>
          </div>

          <div class="event-stat">
            <strong>
              ${standingsData.contributors || 0}
            </strong>

            <span>Contributors</span>
          </div>

          <div class="event-stat">
            <strong>
              ${standingsData.participantCount || 0}
            </strong>

            <span>Participants</span>
          </div>

        </div>

        <h3>Top Competitors</h3>

        <div>
          ${
            standingsData.standings
              ?.slice(0, 10)
              .map((player, index) => `
                <div class="leaderboard-row">
                  <strong>
                    #${index + 1} ${player.name}
                  </strong>

                  <span>
                    ${formatNumber(player.gained)} gained
                  </span>
                </div>
              `)
              .join("") || "No standings yet."
          }
        </div>
      `;

      eventsGrid.appendChild(card);
    }

  } catch (error) {
    eventsGrid.textContent =
      `Could not load events: ${error.message}`;
  }
}

loadDiscordUser();
loadHomeStats();
loadRecentActivity();
loadDynamicEventPage();
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

    if (!data.drops || data.drops.length === 0) {
      return;
    }

    data.drops.forEach(drop => {
      const row = document.createElement("div");
      row.className = "drop-row";

      row.innerHTML = `
        <span>${drop.name}</span>
        <strong>${drop.count}</strong>
        ${
          isStaff
            ? `<button onclick="changeDrop('${drop.name}', 1)">+</button>
               <button onclick="changeDrop('${drop.name}', -1)">−</button>`
            : ""
        }
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

loadDrops();