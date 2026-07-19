const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch]));

function winnerText(archive) {
  if (archive.winner === "ember") return archive.summary?.emberName || "Team 1";
  if (archive.winner === "ash") return archive.summary?.ashName || "Team 2";
  if (archive.winner === "tie") return "Tie";
  return "Not recorded";
}

function attackAt(state, attackingTeam, targetIndex) {
  return (state.attacks || []).find(a => a.attackingTeam === attackingTeam && Number(a.targetIndex) === targetIndex);
}

function incomingAttackAt(state, defendingTeam, targetIndex) {
  return (state.attacks || []).find(a => a.defendingTeam === defendingTeam && Number(a.targetIndex) === targetIndex);
}

function shipAt(state, defendingTeam, targetIndex) {
  return (state.teams?.[defendingTeam]?.ships || []).find(ship => (ship.cells || []).map(Number).includes(targetIndex));
}

function boardCell(label, classes, title) {
  return `<div class="archive-board-cell ${classes}" title="${esc(title)}"><span>${esc(label)}</span></div>`;
}

function renderAttackBoard(state, team) {
  return Array.from({ length: 100 }, (_, index) => {
    const tile = state.tiles?.[index] || {};
    const attack = attackAt(state, team, index);
    const progress = tile.teamProgress?.[team];
    const done = Number(progress?.completedQuantity || 0) >= Math.max(1, Number(tile.quantity || 1));
    const result = attack?.result || "";
    const classes = [result ? `is-${result}` : "", done ? "is-complete" : ""].filter(Boolean).join(" ");
    const label = result === "hit" ? "HIT" : result === "miss" ? "MISS" : tile.name || String(index + 1);
    return boardCell(label, classes, `${tile.name || `Tile ${index + 1}`} — ${result || (done ? "completed" : "open")}`);
  }).join("");
}

function renderWatersBoard(state, team) {
  return Array.from({ length: 100 }, (_, index) => {
    const ship = shipAt(state, team, index);
    const attack = incomingAttackAt(state, team, index);
    const result = attack?.result || "";
    const classes = [ship ? "has-ship" : "", result ? `is-${result}` : ""].filter(Boolean).join(" ");
    const label = result === "hit" ? "HIT" : result === "miss" ? "MISS" : ship ? ship.name : "";
    return boardCell(label, classes, ship ? `${ship.name}${result ? ` — ${result}` : ""}` : result || "Empty water");
  }).join("");
}

function boardCard(title, subtitle, html) {
  return `<article class="card archive-board-card"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p><div class="archive-board-grid">${html}</div></article>`;
}

async function loadArchivedBingo() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw new Error("No archived Bingo was selected.");
  const response = await fetch(`/api/bingo/archive/${encodeURIComponent(id)}`, { cache: "no-store" });
  const archive = await response.json();
  if (!response.ok) throw new Error(archive.error || "Could not load archived Bingo.");

  const state = archive.state;
  const emberName = archive.summary?.emberName || state.teams?.ember?.name || "Team 1";
  const ashName = archive.summary?.ashName || state.teams?.ash?.name || "Team 2";
  document.getElementById("archiveBingoTitle").textContent = archive.title;
  document.getElementById("archiveBingoMeta").textContent = `Archived ${new Date(archive.archivedAt).toLocaleString()} · Winner: ${winnerText(archive)}`;
  document.getElementById("archiveBingoSummary").innerHTML = `
    <div class="admin-summary-card admin-summary-static"><span>${esc(emberName)} completed</span><strong>${archive.summary?.emberCompleted ?? 0}</strong></div>
    <div class="admin-summary-card admin-summary-static"><span>${esc(ashName)} completed</span><strong>${archive.summary?.ashCompleted ?? 0}</strong></div>
    <div class="admin-summary-card admin-summary-static"><span>Proofs</span><strong>${archive.summary?.proofCount ?? 0}</strong></div>
    <div class="admin-summary-card admin-summary-static"><span>Attacks</span><strong>${archive.summary?.attackCount ?? 0}</strong></div>`;

  document.getElementById("archiveBingoBoards").innerHTML = [
    boardCard(`${emberName} — Attack Board`, `Final attacks against ${ashName}'s waters`, renderAttackBoard(state, "ember")),
    boardCard(`${emberName} — Waters`, "Final fleet placement and incoming attacks", renderWatersBoard(state, "ember")),
    boardCard(`${ashName} — Attack Board`, `Final attacks against ${emberName}'s waters`, renderAttackBoard(state, "ash")),
    boardCard(`${ashName} — Waters`, "Final fleet placement and incoming attacks", renderWatersBoard(state, "ash"))
  ].join("");

  document.getElementById("archiveTileList").innerHTML = (state.tiles || []).map((tile, index) => `
    <div class="archive-tile-row">
      <strong>${index + 1}. ${esc(tile.name || "Empty tile")}</strong>
      <span>Qty ${Math.max(1, Number(tile.quantity || 1))}</span>
      <span>${esc(emberName)}: ${Number(tile.teamProgress?.ember?.completedQuantity || 0)}</span>
      <span>${esc(ashName)}: ${Number(tile.teamProgress?.ash?.completedQuantity || 0)}</span>
    </div>`).join("");
}

loadArchivedBingo().catch(error => {
  document.getElementById("archiveBingoBoards").innerHTML = `<article class="card"><h2>Could not load archive</h2><p>${esc(error.message)}</p></article>`;
});
