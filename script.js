function toggleMenu() {

  const navLinks =
    document.getElementById("navLinks");

  if (navLinks) {
    navLinks.classList.toggle("show");
  }

}

async function loadDiscordUser() {

  const loginBtn =
    document.getElementById("discordLoginBtn");

  const logoutBtn =
    document.getElementById("discordLogoutBtn");

  if (!loginBtn) return;

  const response =
    await fetch("/api/auth/me");

  const data =
    await response.json();

  if (!data.signedIn) return;

  loginBtn.textContent =
    `Signed in as ${data.user.global_name || data.user.username}`;

  loginBtn.href = "#";

  if (data.user.inGuild) {

    loginBtn.title =
      "Verified Ironkin Discord member";

  }

  if (logoutBtn) {

    logoutBtn.style.display =
      "inline-block";

  }

}

async function loadHomeStats() {

  const homeClanXp =
    document.getElementById("homeClanXp");

  if (!homeClanXp) return;

  const formatXp =
    (num) => `${Number(num).toLocaleString()} XP`;

  try {

    const eventResponse =
      await fetch("/api/wom-event");

    const eventData =
      await eventResponse.json();

    if (eventResponse.ok) {

      document.getElementById("homeClanXp").textContent =
        formatXp(eventData.totalGained);

      document.getElementById("homeEventPercent").textContent =
        `${eventData.percent.toFixed(1)}%`;

    }

    const womResponse =
      await fetch(
        "https://api.wiseoldman.net/v2/groups/12095"
      );

    const womData =
      await womResponse.json();

    if (womResponse.ok) {

      document.getElementById("homeClanMembers").textContent =
        womData.memberCount ||
        womData.members?.length ||
        "0";

    }

  } catch {

    homeClanXp.textContent =
      "Unavailable";

    document.getElementById("homeEventPercent").textContent =
      "Unavailable";

  }

}

async function loadRecentActivity() {

  const container =
    document.getElementById("recentActivity");

  if (!container) return;

  try {

    const response =
      await fetch("/api/recent-activity");

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not load activity."
      );

    }

    if (
      !data.achievements ||
      data.achievements.length === 0
    ) {

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
  <small>${new Date(item.createdAt).toLocaleDateString()}</small>
`;

      track.appendChild(card);

    });

  } catch (error) {

    container.textContent =
      "Could not load recent achievements.";

  }

}

loadDiscordUser();

loadHomeStats();

loadRecentActivity();