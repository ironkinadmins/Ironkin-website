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
}

async function loadHomeStats() {
  const homeClanXp = document.getElementById("homeClanXp");
  if (!homeClanXp) return;

  const formatNumber = (num) => Number(num || 0).toLocaleString();

  try {
    const eventResponse = await fetch("/api/event-standings");
    const eventData = await eventResponse.json();

    if (eventResponse.ok && eventData.active) {
      else {

  document.getElementById("homeClanXp").textContent =
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
      homeClanXp.textContent = `${formatNumber(eventData.totalGained)} gained`;

      document.getElementById("homeEventPercent").textContent =
        eventData.type === "clan_goal" ? "Clan Goal" : eventData.type.toUpperCase();

      document.getElementById("homeEventTitle").textContent = eventData.title;

      document.getElementById("homeEventMeta").textContent =
        `${eventData.metric || "Competition"} • Ends ${new Date(eventData.endsAt).toLocaleDateString()}`;

      const topThree = document.getElementById("homeTopThree");
      topThree.innerHTML = "";

      if (eventData.standings?.length) {
        eventData.standings.slice(0, 3).forEach((player, index) => {
          const div = document.createElement("div");
          div.innerHTML = `<strong>#${index + 1} ${player.name}</strong><span>${formatNumber(player.gained)} gained</span>`;
          topThree.appendChild(div);
        });
      } else {
        topThree.textContent = "No standings yet.";
      }
    }

    const womResponse = await fetch("https://api.wiseoldman.net/v2/groups/12095");
    const womData = await womResponse.json();

    if (womResponse.ok) {
      document.getElementById("homeClanMembers").textContent =
        womData.memberCount || womData.members?.length || "0";
    }
  } catch {
    homeClanXp.textContent = "Unavailable";
    document.getElementById("homeEventPercent").textContent = "Unavailable";
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

      card.innerHTML = `
        <strong>${item.player}</strong>
        <span>${item.name}</span>
        <small>${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recent"}</small>
      `;

      track.appendChild(card);
    });
  } catch {
    container.textContent =
      "Could not load recent achievements.";
  }
}

async function loadDynamicEventPage() {
  const title = document.getElementById("eventPageTitle");

  if (!title) return;

  const formatNumber = (num) =>
    Number(num || 0).toLocaleString();

  try {
    const response = await fetch("/api/event-standings");
    const data = await response.json();

    if (!response.ok || !data.active) {
      title.textContent = "No Active Event";

      document.getElementById("eventPageSubtitle").textContent =
        data.message || "No active Ironkin WOM competition found.";

      document.getElementById("eventLeaderboard").textContent =
        "Check back once a SOTW, BOTW, or Clan Goal competition is live.";

      return;
    }

    title.textContent = data.title;

    document.getElementById("eventPageSubtitle").textContent =
      `${data.type.toUpperCase()} • ${data.metric || "Competition"} • Ends ${new Date(data.endsAt).toLocaleDateString()}`;

    const leaderboardTitle =
      document.getElementById("leaderboardTitle");

    if (data.type === "clan_goal") {
      const GOAL_XP = 1000000000;

      const percent =
        Math.min((data.totalGained / GOAL_XP) * 100, 100);

      document.getElementById("eventProgressSection").style.display =
        "block";

      document.getElementById("eventName").textContent =
        data.title;

      document.getElementById("eventMeta").textContent =
        `${data.metric.toUpperCase()} gained by the clan`;

      document.getElementById("eventPercent").textContent =
        `${percent.toFixed(1)}%`;

      document.getElementById("eventProgressFill").style.width =
        `${percent}%`;

      document.getElementById("eventCurrent").textContent =
        formatNumber(data.totalGained);

      document.getElementById("eventGoal").textContent =
        formatNumber(GOAL_XP);

      document.getElementById("eventUpdated").textContent =
        "Live";

      leaderboardTitle.textContent =
        "Top Contributors";
    } else if (data.type === "botw") {
      leaderboardTitle.textContent =
        "Boss Killcount Leaderboard";
    } else if (data.type === "sotw") {
      leaderboardTitle.textContent =
        "Skill XP Leaderboard";
    } else {
      leaderboardTitle.textContent =
        "Competition Leaderboard";
    }

    const leaderboard =
      document.getElementById("eventLeaderboard");

    leaderboard.innerHTML = "";

    if (!data.standings || data.standings.length === 0) {
      leaderboard.textContent =
        "No standings found yet.";
      return;
    }

    data.standings.slice(0, 25).forEach((player, index) => {
      const row =
        document.createElement("div");

      row.className =
        "leaderboard-row";

      row.innerHTML = `
        <strong>#${index + 1} ${player.name}</strong>
        <span>${formatNumber(player.gained)} gained</span>
      `;

      leaderboard.appendChild(row);
    });
  } catch (error) {
    title.textContent = "Could not load event.";

    document.getElementById("eventPageSubtitle").textContent =
      error.message;
  }
}

loadDiscordUser();
loadHomeStats();
loadRecentActivity();
loadDynamicEventPage();