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
