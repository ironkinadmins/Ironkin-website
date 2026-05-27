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

    const authResponse = await fetch("/api/auth/me");
    const authData = await authResponse.json();

    if (authData.signedIn && authData.user?.inGuild) {
      document.getElementById("homeMemberStatus").textContent =
        "Verified Kin";
    } else if (authData.signedIn) {
      document.getElementById("homeMemberStatus").textContent =
        "Signed In";
    }

  } catch {
    homeClanXp.textContent = "Unavailable";
    document.getElementById("homeEventPercent").textContent = "Unavailable";
  }
}

loadHomeStats();