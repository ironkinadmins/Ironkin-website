function toggleMenu() {
  const nav = document.getElementById('navLinks');
  if (nav) nav.classList.toggle('show');
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

// EDIT THIS SECTION FOR YOUR CURRENT CLAN XP EVENT
const clanEvent = {
  name: 'The Ember Skill Forge',
  skill: 'Fishing',
  goalXp: 100000000,
  currentXpGained: 36450000
};

function loadProgressEvent() {
  const eventName = document.getElementById('eventName');
  if (!eventName) return;

  const percent = Math.min((clanEvent.currentXpGained / clanEvent.goalXp) * 100, 100);
  const remaining = Math.max(clanEvent.goalXp - clanEvent.currentXpGained, 0);

  document.getElementById('eventName').textContent = clanEvent.name;
  document.getElementById('eventSkill').textContent = `Skill: ${clanEvent.skill}`;
  document.getElementById('eventPercent').textContent = `${percent.toFixed(1)}%`;
  document.getElementById('progressFill').style.width = `${percent}%`;
  document.getElementById('currentXp').textContent = formatNumber(clanEvent.currentXpGained);
  document.getElementById('goalXp').textContent = formatNumber(clanEvent.goalXp);
  document.getElementById('remainingXp').textContent = formatNumber(remaining);
}

loadProgressEvent();

/*
WISE OLD MAN API NOTE:
This static site is ready for demo progress.
Later, we can replace the demo values above with live Wise Old Man data.
The best event logic will be:
current clan skill XP - starting clan skill XP = XP gained during event.
*/
async function loadWomEvent() {
  const eventName = document.getElementById("eventName");

  if (!eventName) return;

  const formatXp = (num) => {
    return `${Number(num).toLocaleString()} XP`;
  };

  try {
    const response = await fetch("/api/wom-event");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load event");
    }

    document.getElementById("eventName").textContent =
      data.eventName;

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

    data.topContributors.forEach(player => {
      const li = document.createElement("li");

      li.textContent =
        `${player.name} — ${formatXp(player.gained)}`;

      list.appendChild(li);
    });

  } catch (error) {
    eventName.textContent =
      "Could not load Wise Old Man event.";

    document.getElementById("eventMeta").textContent =
      error.message;
  }
}

loadWomEvent();
