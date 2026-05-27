function toggleMenu() {
  const navLinks = document.getElementById("navLinks");
  if (navLinks) {
    navLinks.classList.toggle("show");
  }
}

async function loadWomEvent() {
  const eventName = document.getElementById("eventName");

  if (!eventName) return;

  const formatXp = (num) => `${Number(num).toLocaleString()} XP`;

  try {
    const response = await fetch("/api/wom-event");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load event");
    }

    document.getElementById("eventName").textContent = data.eventName;
    document.getElementById("eventMeta").textContent =
      `${data.metric.toUpperCase()} clan XP gained since event start`;
    document.getElementById("eventPercent").textContent =
      `${data.percent.toFixed(1)}%`;
    document.getElementById("eventProgressFill").style.width =
      `${data.percent}%`;
    document.getElementById("eventCurrent").textContent =
      formatXp(data.totalGained);
    document.getElementById("eventGoal").textContent =
      formatXp(data.goalXp);
    document.getElementById("eventUpdated").textContent =
      new Date(data.updatedAt).toLocaleString();

    const list = document.getElementById("topContributors");
    list.innerHTML = "";

    if (!data.topContributors || data.topContributors.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No gains found yet.";
      list.appendChild(li);
      return;
    }

    data.topContributors.forEach(player => {
      const li = document.createElement("li");
      li.textContent = `${player.name} — ${formatXp(player.gained)}`;
      list.appendChild(li);
    });
  } catch (error) {
    eventName.textContent = "Could not load Wise Old Man event.";
    document.getElementById("eventMeta").textContent = error.message;
  }
}

loadWomEvent();
async function loadDiscordUser() {
  const loginBtn = document.getElementById("discordLoginBtn");
  const logoutBtn = document.getElementById("discordLogoutBtn");

  if (!loginBtn) return;

  const response = await fetch("/api/auth/me");
  const data = await response.json();

  if (!data.signedIn) return;

  loginBtn.textContent = `Signed in as ${data.user.global_name || data.user.username}`;
  loginBtn.href = "#";

  if (logoutBtn) {
    logoutBtn.style.display = "inline-block";
  }

  console.log("Discord user:", data.user);
}

loadDiscordUser();
async function loadDiscordUser() {
  const loginBtn = document.getElementById("discordLoginBtn");
  const logoutBtn = document.getElementById("discordLogoutBtn");

  if (!loginBtn) return;

  const response = await fetch("/api/auth/me");
  const data = await response.json();

  if (!data.signedIn) return;

  loginBtn.textContent = `Signed in as ${data.user.global_name || data.user.username}`;
  loginBtn.href = "#";

  if (data.user.inGuild) {
    loginBtn.title = "Verified Ironkin Discord member";
  }

  if (logoutBtn) {
    logoutBtn.style.display = "inline-block";
  }
}

loadDiscordUser();
async function loadHomeStats() {
  const homeClanXp = document.getElementById("homeClanXp");
  if (!homeClanXp) return;

  const formatXp = (num) => `${Number(num).toLocaleString()} XP`;

  try {
    const eventResponse = await fetch("/api/wom-event");
    const eventData = await eventResponse.json();

    if (eventResponse.ok) {
      document.getElementById("homeClanXp").textContent =
        formatXp(eventData.totalGained);

      document.getElementById("homeEventPercent").textContent =
        `${eventData.percent.toFixed(1)}%`;
    }

const womResponse = await fetch(
  "https://api.wiseoldman.net/v2/groups/12095"
);

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

loadHomeStats();
async function loadRecentActivity() {
  const container = document.getElementById("recentActivity");
  if (!container) return;

  try {
    const response = await fetch("/api/recent-activity");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load activity.");
    }

    container.innerHTML = "";

    if (!data.achievements || data.achievements.length === 0) {
      container.textContent = "No recent achievements found yet.";
      return;
    }

    data.achievements.forEach(item => {
      const card = document.createElement("div");
      card.className = "achievement-pill";

card.innerHTML = `
  <strong>${item.player}</strong>
  <span>${item.name}</span>
`;

      container.appendChild(card);
    });
  } catch (error) {
    container.textContent = "Could not load recent achievements.";
  }
}

loadRecentActivity();