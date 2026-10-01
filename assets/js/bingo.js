(async function loadBingoLandingTeams() {
  try {
    const response = await fetch(`/api/bingo/public-teams?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;

    const team1 = document.getElementById("bingoLandingTeam1");
    const team2 = document.getElementById("bingoLandingTeam2");
    if (team1 && data.teams?.team1?.name) team1.textContent = data.teams.team1.name;
    if (team2 && data.teams?.team2?.name) team2.textContent = data.teams.team2.name;
  } catch {
    // Keep the safe fallback names already rendered in the HTML.
  }
})();
