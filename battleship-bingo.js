const BINGO_SIZE = 10;
const STAFF_ROLE_IDS = ["1364734283356569620", "1365445491776815104"];
const SHIPS = [
  { key: "carrier", name: "Carrier", size: 5 },
  { key: "battleship", name: "Battleship", size: 4 },
  { key: "cruiser", name: "Cruiser", size: 3 },
  { key: "submarine", name: "Submarine", size: 3 },
  { key: "destroyer", name: "Destroyer", size: 3 },
  { key: "patrol", name: "Patrol Boat", size: 2 }
];
const TEAMS = {
  ember: { name: "Ember Fleet", emoji: "🔥" },
  ash: { name: "Ash Fleet", emoji: "⚓" }
};
const DEFAULT_ITEMS = [
  { name: "Abyssal whip", image: "https://oldschool.runescape.wiki/images/thumb/Abyssal_whip_detail.png/64px-Abyssal_whip_detail.png" },
  { name: "Abyssal tentacle", image: "https://oldschool.runescape.wiki/images/thumb/Abyssal_tentacle_detail.png/64px-Abyssal_tentacle_detail.png" },
  { name: "Kraken tentacle", image: "https://oldschool.runescape.wiki/images/thumb/Kraken_tentacle_detail.png/64px-Kraken_tentacle_detail.png" },
  { name: "Saradomin sword", image: "https://oldschool.runescape.wiki/images/thumb/Saradomin_sword_detail.png/64px-Saradomin_sword_detail.png" },
  { name: "Dragon warhammer", image: "https://oldschool.runescape.wiki/images/thumb/Dragon_warhammer_detail.png/64px-Dragon_warhammer_detail.png" },
  { name: "Bandos chestplate", image: "https://oldschool.runescape.wiki/images/thumb/Bandos_chestplate_detail.png/64px-Bandos_chestplate_detail.png" },
  { name: "Zenyte shard", image: "https://oldschool.runescape.wiki/images/thumb/Zenyte_shard_detail.png/64px-Zenyte_shard_detail.png" },
  { name: "Enhanced crystal weapon seed", image: "https://oldschool.runescape.wiki/images/thumb/Enhanced_crystal_weapon_seed_detail.png/64px-Enhanced_crystal_weapon_seed_detail.png" }
];

let bingoState = createDefaultState();
let isBingoStaff = false;
let activeTileIndex = null;
let wikiSearchTimer = null;
let placingTeam = null;
let placingShipIndex = 0;
let placingOrientation = "horizontal";

function createDefaultState() {
  return {
    version: 2,
    size: BINGO_SIZE,
    phase: "setup",
    locked: false,
    updatedAt: new Date().toISOString(),
    tiles: emptyBingoBoard(),
    teams: {
      ember: createTeam("ember"),
      ash: createTeam("ash")
    },
    proofs: [],
    attacks: [],
    log: [{ at: new Date().toISOString(), text: "Battleship Bingo room created." }]
  };
}

function createTeam(teamKey) {
  return {
    key: teamKey,
    name: TEAMS[teamKey].name,
    captain: "",
    ships: SHIPS.map(ship => ({ ...ship, cells: [], sunk: false })),
    attacks: []
  };
}

function emptyBingoBoard() {
  return Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => ({
    id: index,
    name: "",
    image: "",
    quantity: 1,
    status: "open",
    completedBy: "",
    completedTeam: "",
    proofId: ""
  }));
}

function normaliseState(data) {
  const base = createDefaultState();
  if (!data || typeof data !== "object") return base;
  const size = Number(data.size || BINGO_SIZE);
  const tiles = Array.isArray(data.tiles) && data.tiles.length
    ? data.tiles.slice(0, BINGO_SIZE * BINGO_SIZE).map((tile, index) => ({ ...base.tiles[index], ...tile, id: index }))
    : base.tiles;
  while (tiles.length < BINGO_SIZE * BINGO_SIZE) tiles.push({ ...base.tiles[tiles.length], id: tiles.length });

  return {
    ...base,
    ...data,
    size: BINGO_SIZE,
    tiles,
    teams: {
      ember: { ...base.teams.ember, ...(data.teams?.ember || {}), ships: normaliseShips(data.teams?.ember?.ships) },
      ash: { ...base.teams.ash, ...(data.teams?.ash || {}), ships: normaliseShips(data.teams?.ash?.ships) }
    },
    proofs: Array.isArray(data.proofs) ? data.proofs : [],
    attacks: Array.isArray(data.attacks) ? data.attacks : [],
    log: Array.isArray(data.log) && data.log.length ? data.log : base.log
  };
}

function normaliseShips(ships) {
  return SHIPS.map(template => {
    const existing = Array.isArray(ships) ? ships.find(ship => ship.key === template.key) : null;
    return { ...template, cells: Array.isArray(existing?.cells) ? existing.cells : [], sunk: Boolean(existing?.sunk) };
  });
}

async function checkBingoStaff() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    const roles = data?.user?.roles || [];
    isBingoStaff = Boolean(data.signedIn && roles.some(role => STAFF_ROLE_IDS.includes(role)));
  } catch {
    isBingoStaff = false;
  }
  document.getElementById("bingoAdminActions")?.style.setProperty("display", isBingoStaff ? "flex" : "none");
}

async function loadBingoState() {
  try {
    const response = await fetch("/api/bingo/board");
    if (!response.ok) throw new Error("Could not load board.");
    bingoState = normaliseState(await response.json());
  } catch {
    bingoState = normaliseState(JSON.parse(localStorage.getItem("ironkin:bingo:state") || "null"));
  }
  renderAll();
}

async function saveBingoState() {
  bingoState.updatedAt = new Date().toISOString();
  try {
    const response = await fetch("/api/bingo/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bingoState)
    });
    if (!response.ok) throw new Error("Save failed.");
    bingoState = normaliseState(await response.json());
  } catch {
    localStorage.setItem("ironkin:bingo:state", JSON.stringify(bingoState));
  }
  renderAll();
}

function addLog(text) {
  bingoState.log.unshift({ at: new Date().toISOString(), text });
  bingoState.log = bingoState.log.slice(0, 100);
}

function renderAll() {
  renderStatus();
  if (bingoState.phase === "setup") setBingoTab("board");
  renderScore();
  renderBingoBoard();
  renderFleets();
  renderProofs();
  renderLog();
  updateAdminButtons();
}

function renderStatus() {
  document.body.classList.toggle("bingo-setup", bingoState.phase === "setup");
  document.body.classList.toggle("bingo-active", bingoState.phase !== "setup");
  const title = document.getElementById("bingoStatusTitle");
  const text = document.getElementById("bingoStatusText");
  const state = document.getElementById("bingoBoardState");
  const summary = document.getElementById("bingoGameSummary");
  const phaseLabel = bingoState.phase === "active" ? "Active" : bingoState.phase === "complete" ? "Complete" : bingoState.locked ? "Locked Setup" : "Draft Setup";
  if (title) title.textContent = phaseLabel;
  if (text) {
    text.textContent = bingoState.phase === "setup"
      ? "Click a tile to edit it. When done, lock the board and assign captains."
      : bingoState.phase === "active"
        ? "Teams can submit proofs. Approved proofs fire attacks against the opposing fleet."
        : "Battleship Bingo is complete.";
  }
  if (state) {
    state.textContent = phaseLabel;
    state.classList.toggle("locked", bingoState.locked || bingoState.phase !== "setup");
  }
  if (summary) {
    const emberSunk = getSunkCount("ember");
    const ashSunk = getSunkCount("ash");
    summary.textContent = `${TEAMS.ember.name}: ${emberSunk}/${SHIPS.length} enemy ships sunk. ${TEAMS.ash.name}: ${ashSunk}/${SHIPS.length} enemy ships sunk.`;
  }
}

function renderScore() {
  const score = document.getElementById("bingoScoreGrid");
  if (!score) return;
  score.innerHTML = Object.keys(TEAMS).map(team => {
    const attackHits = bingoState.attacks.filter(a => a.attackingTeam === team && a.result === "hit").length;
    const attackMisses = bingoState.attacks.filter(a => a.attackingTeam === team && a.result === "miss").length;
    const approved = bingoState.tiles.filter(t => t.completedTeam === team && t.status === "approved").length;
    return `
      <div class="bingo-score-card ${team}">
        <span>${TEAMS[team].emoji}</span>
        <div><strong>${escapeHtml(bingoState.teams[team].name)}</strong><small>Captain: ${escapeHtml(bingoState.teams[team].captain || "Not set")}</small></div>
        <div class="bingo-score-stats"><b>${getSunkCount(team)}/${SHIPS.length}</b><small>Ships sunk</small></div>
        <div class="bingo-score-stats"><b>${attackHits}</b><small>Hits</small></div>
        <div class="bingo-score-stats"><b>${attackMisses}</b><small>Misses</small></div>
        <div class="bingo-score-stats"><b>${approved}</b><small>Proofs</small></div>
      </div>`;
  }).join("");
}

function getSunkCount(team) {
  const opponent = getOpponent(team);
  return bingoState.teams[opponent].ships.filter(ship => ship.sunk).length;
}

function getOpponent(team) {
  return team === "ember" ? "ash" : "ember";
}

function getTileQuantity(tile) {
  const raw = tile?.quantity ?? tile?.qty ?? tile?.quantityNeeded ?? 1;
  return Math.max(1, Number.parseInt(raw, 10) || 1);
}

function renderBingoBoard() {
  const boardEl = document.getElementById("bingoBoard");
  if (!boardEl) return;
  boardEl.innerHTML = bingoState.tiles.map((tile, index) => `
    <button class="bingo-tile ${tile.name ? "filled" : "empty"} status-${escapeAttr(tile.status || "open")}" type="button" data-index="${index}">
      ${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
      ${getTileQuantity(tile) > 1 ? `<strong class="bingo-qty-badge">x${escapeHtml(getTileQuantity(tile))}</strong>` : ""}
      <span>${tile.name ? escapeHtml(tile.name) : "Empty"}</span>
      ${tile.status && tile.status !== "open" ? `<em>${escapeHtml(tile.status)}</em>` : ""}
    </button>
  `).join("");

  boardEl.querySelectorAll(".bingo-tile").forEach(tile => {
    tile.addEventListener("click", () => openTileModal(Number(tile.dataset.index)));
  });
}

function openTileModal(index) {
  activeTileIndex = index;
  const tile = bingoState.tiles[index] || {};
  document.getElementById("tileModalTitle").textContent = tile.name || `Tile ${index + 1}`;
  document.getElementById("tileNameInput").value = tile.name || "";
  document.getElementById("tileQuantityInput").value = getTileQuantity(tile);
  document.getElementById("tileImageInput").value = tile.image || "";
  document.getElementById("wikiSearchInput").value = tile.name || "";
  document.getElementById("wikiSearchResults").innerHTML = "";
  document.getElementById("proofPlayerInput").value = "";
  document.getElementById("proofUrlInput").value = "";
  document.getElementById("proofNoteInput").value = "";
  const canEdit = isBingoStaff && bingoState.phase === "setup" && !bingoState.locked;
  const canSubmitProof = bingoState.phase === "active" && tile.name;
  document.getElementById("staffTileEditor").style.display = canEdit ? "block" : "none";
  document.getElementById("proofSubmitSection").style.display = canSubmitProof ? "block" : "none";
  document.getElementById("saveTileBtn").style.display = canEdit ? "inline-flex" : "none";
  document.getElementById("clearTileBtn").style.display = canEdit ? "inline-flex" : "none";
  document.getElementById("submitProofBtn").style.display = canSubmitProof ? "inline-flex" : "none";
  document.getElementById("tileModal").classList.add("show");
  document.getElementById("tileModal").setAttribute("aria-hidden", "false");
}

function closeTileEditor() {
  document.getElementById("tileModal").classList.remove("show");
  document.getElementById("tileModal").setAttribute("aria-hidden", "true");
  activeTileIndex = null;
}

function openBingoHelpModal() {
  document.getElementById("bingoHelpModal")?.classList.add("show");
  document.getElementById("bingoHelpModal")?.setAttribute("aria-hidden", "false");
}

function closeBingoHelpModal() {
  document.getElementById("bingoHelpModal")?.classList.remove("show");
  document.getElementById("bingoHelpModal")?.setAttribute("aria-hidden", "true");
}

async function searchWiki(query) {
  const resultsEl = document.getElementById("wikiSearchResults");
  if (!query || query.length < 2) {
    resultsEl.innerHTML = "";
    return;
  }
  resultsEl.innerHTML = `<div class="wiki-loading">Searching...</div>`;
  try {
    const response = await fetch(`/api/osrs/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    const results = (Array.isArray(data) ? data : data.results || []).filter(item => item?.name && item?.image);
    if (!results.length) {
      resultsEl.innerHTML = `<div class="wiki-loading">No item results found.</div>`;
      return;
    }
    resultsEl.innerHTML = results.map(item => `
      <div class="wiki-result">
        <img src="${escapeAttr(item.image)}" alt="${escapeHtml(item.name)}" />
        <span class="wiki-result-name">${escapeHtml(item.name)}</span>
        <button type="button" data-name="${escapeAttr(item.name)}" data-image="${escapeAttr(item.image)}">Select</button>
      </div>
    `).join("");
    resultsEl.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        document.getElementById("tileNameInput").value = button.dataset.name;
        document.getElementById("tileImageInput").value = button.dataset.image;
      });
    });
  } catch {
    resultsEl.innerHTML = `<div class="wiki-loading">Could not search the OSRS Wiki.</div>`;
  }
}

function renderFleets() {
  ["ember", "ash"].forEach(team => {
    const board = document.getElementById(`${team}FleetBoard`);
    const list = document.getElementById(`${team}ShipList`);
    if (!board || !list) return;
    board.innerHTML = Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => {
      const ship = bingoState.teams[team].ships.find(s => s.cells.includes(index));
      const attacked = bingoState.attacks.find(a => a.defendingTeam === team && a.targetIndex === index);
      const classes = ["fleet-cell"];
      if (ship) classes.push("ship");
      if (attacked) classes.push(attacked.result);
      if (placingTeam === team) classes.push("placing");
      return `<button type="button" class="${classes.join(" ")}" data-team="${team}" data-index="${index}">${ship ? "■" : ""}${attacked ? (attacked.result === "hit" ? "✹" : "•") : ""}</button>`;
    }).join("");
    board.querySelectorAll(".fleet-cell").forEach(cell => {
      cell.addEventListener("click", () => handleFleetCellClick(team, Number(cell.dataset.index)));
    });
    list.innerHTML = bingoState.teams[team].ships.map(ship => `
      <div class="ship-row ${ship.sunk ? "sunk" : ""}">
        <strong>${escapeHtml(ship.name)}</strong>
        <span>${ship.cells.length}/${ship.size} placed</span>
        <em>${ship.sunk ? "Sunk" : ship.cells.length === ship.size ? "Afloat" : "Not placed"}</em>
      </div>
    `).join("");
  });
}

function handleFleetCellClick(team, startIndex) {
  if (!isBingoStaff || bingoState.phase !== "setup" || placingTeam !== team) return;
  const ship = bingoState.teams[team].ships[placingShipIndex];
  if (!ship) return;
  const cells = getShipCells(startIndex, ship.size, placingOrientation);
  if (!cells || cells.some(cell => bingoState.teams[team].ships.some(s => s.key !== ship.key && s.cells.includes(cell)))) {
    alert("That ship does not fit there.");
    return;
  }
  ship.cells = cells;
  addLog(`${bingoState.teams[team].name} placed ${ship.name}.`);
  placingShipIndex = Math.min(placingShipIndex + 1, SHIPS.length - 1);
  if (bingoState.teams[team].ships.every(s => s.cells.length === s.size)) placingTeam = null;
  saveBingoState();
}

function getShipCells(startIndex, size, orientation) {
  const row = Math.floor(startIndex / BINGO_SIZE);
  const col = startIndex % BINGO_SIZE;
  const cells = [];
  for (let i = 0; i < size; i++) {
    const nextRow = orientation === "vertical" ? row + i : row;
    const nextCol = orientation === "horizontal" ? col + i : col;
    if (nextRow >= BINGO_SIZE || nextCol >= BINGO_SIZE) return null;
    cells.push(nextRow * BINGO_SIZE + nextCol);
  }
  return cells;
}

function renderProofs() {
  const list = document.getElementById("proofList");
  if (!list) return;
  if (!bingoState.proofs.length) {
    list.innerHTML = `<p class="muted-text">No proofs submitted yet.</p>`;
    return;
  }
  list.innerHTML = bingoState.proofs.map(proof => {
    const tile = bingoState.tiles[proof.tileIndex] || {};
    return `
      <div class="proof-card status-${escapeAttr(proof.status)}">
        <div>
          <strong>${escapeHtml(tile.name || `Tile ${proof.tileIndex + 1}`)}</strong>
          <span>${escapeHtml(TEAMS[proof.team]?.name || proof.team)} • ${escapeHtml(proof.player || "Unknown")}</span>
          <p>${escapeHtml(proof.note || "No note")}</p>
          ${proof.url ? `<a href="${escapeAttr(proof.url)}" target="_blank" rel="noopener">Open proof</a>` : ""}
        </div>
        <em>${escapeHtml(proof.status)}</em>
        ${isBingoStaff && proof.status === "pending" ? `
          <div class="proof-actions">
            <button type="button" data-proof-action="approve" data-proof-id="${escapeAttr(proof.id)}">Approve</button>
            <button type="button" data-proof-action="reject" data-proof-id="${escapeAttr(proof.id)}">Reject</button>
          </div>` : ""}
      </div>`;
  }).join("");
  list.querySelectorAll("[data-proof-action]").forEach(button => {
    button.addEventListener("click", () => reviewProof(button.dataset.proofId, button.dataset.proofAction));
  });
}

async function submitProof() {
  if (activeTileIndex === null) return;
  const team = document.getElementById("proofTeamSelect").value;
  const player = document.getElementById("proofPlayerInput").value.trim();
  const url = document.getElementById("proofUrlInput").value.trim();
  const note = document.getElementById("proofNoteInput").value.trim();
  if (!player || !url) {
    alert("Add your player name and a proof link.");
    return;
  }
  const proof = { id: crypto.randomUUID(), tileIndex: activeTileIndex, team, player, url, note, status: "pending", createdAt: new Date().toISOString() };
  bingoState.proofs.unshift(proof);
  bingoState.tiles[activeTileIndex].status = "submitted";
  bingoState.tiles[activeTileIndex].proofId = proof.id;
  addLog(`${player} submitted proof for ${bingoState.tiles[activeTileIndex].name} (${TEAMS[team].name}).`);
  await saveBingoState();
  closeTileEditor();
}

async function reviewProof(proofId, action) {
  const proof = bingoState.proofs.find(p => p.id === proofId);
  if (!proof) return;
  proof.status = action === "approve" ? "approved" : "rejected";
  const tile = bingoState.tiles[proof.tileIndex];
  if (tile) {
    tile.status = proof.status;
    tile.completedBy = proof.status === "approved" ? proof.player : "";
    tile.completedTeam = proof.status === "approved" ? proof.team : "";
  }
  if (action === "approve") resolveAttack(proof);
  addLog(`${proof.status === "approved" ? "Approved" : "Rejected"} proof for ${tile?.name || "a tile"} by ${proof.player}.`);
  await saveBingoState();
}

function resolveAttack(proof) {
  const defendingTeam = getOpponent(proof.team);
  const targetIndex = proof.tileIndex;
  if (bingoState.attacks.some(a => a.attackingTeam === proof.team && a.targetIndex === targetIndex)) return;
  const ship = bingoState.teams[defendingTeam].ships.find(s => s.cells.includes(targetIndex));
  const result = ship ? "hit" : "miss";
  const attack = { id: crypto.randomUUID(), attackingTeam: proof.team, defendingTeam, targetIndex, result, shipKey: ship?.key || "", at: new Date().toISOString() };
  bingoState.attacks.push(attack);
  bingoState.teams[proof.team].attacks.push(attack);
  addLog(`${TEAMS[proof.team].name} fired at ${TEAMS[defendingTeam].name}: ${result.toUpperCase()}.`);
  if (ship) {
    const allHit = ship.cells.every(cell => bingoState.attacks.some(a => a.defendingTeam === defendingTeam && a.targetIndex === cell && a.result === "hit"));
    if (allHit && !ship.sunk) {
      ship.sunk = true;
      addLog(`${TEAMS[proof.team].name} sunk ${TEAMS[defendingTeam].name}'s ${ship.name}!`);
      if (bingoState.teams[defendingTeam].ships.every(s => s.sunk)) {
        bingoState.phase = "complete";
        addLog(`${TEAMS[proof.team].name} wins Battleship Bingo!`);
      }
    }
  }
}

function renderLog() {
  const log = document.getElementById("bingoLog");
  if (!log) return;
  log.innerHTML = bingoState.log.map(entry => `
    <div class="log-row"><time>${formatDateTime(entry.at)}</time><span>${escapeHtml(entry.text)}</span></div>
  `).join("");
}

function updateAdminButtons() {
  const lockBtn = document.getElementById("bingoLockBtn");
  const startBtn = document.getElementById("bingoStartBtn");
  if (lockBtn) lockBtn.textContent = bingoState.locked ? "Unlock Board" : "Lock Board";
  if (startBtn) startBtn.textContent = bingoState.phase === "active" ? "End Game" : bingoState.phase === "complete" ? "Reopen Game" : "Start Game";
}

function setBingoTab(tabName) {
  document.querySelectorAll("[data-bingo-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.bingoTab === tabName);
  });
  document.querySelectorAll(".bingo-tab-panel").forEach(panel => panel.classList.remove("active"));
  document.getElementById(`bingoTab-${tabName}`)?.classList.add("active");
}

function bindBingoControls() {
  document.querySelectorAll("[data-bingo-tab]").forEach(button => {
    button.addEventListener("click", () => {
      if (bingoState.phase === "setup" && button.dataset.bingoTab !== "board") return;
      setBingoTab(button.dataset.bingoTab);
    });
  });
  document.getElementById("bingoHelpBtn")?.addEventListener("click", openBingoHelpModal);
  document.getElementById("closeBingoHelpModal")?.addEventListener("click", closeBingoHelpModal);
  document.getElementById("bingoHelpModal")?.addEventListener("click", event => {
    if (event.target.id === "bingoHelpModal") closeBingoHelpModal();
  });
  document.getElementById("closeTileModal")?.addEventListener("click", closeTileEditor);
  document.getElementById("tileModal")?.addEventListener("click", event => {
    if (event.target.id === "tileModal") closeTileEditor();
  });
  document.getElementById("wikiSearchInput")?.addEventListener("input", event => {
    clearTimeout(wikiSearchTimer);
    wikiSearchTimer = setTimeout(() => searchWiki(event.target.value.trim()), 250);
  });
  document.getElementById("saveTileBtn")?.addEventListener("click", async () => {
    if (activeTileIndex === null) return;
    const quantity = Math.max(1, Number.parseInt(document.getElementById("tileQuantityInput").value, 10) || 1);
    bingoState.tiles[activeTileIndex] = {
      ...bingoState.tiles[activeTileIndex],
      name: document.getElementById("tileNameInput").value.trim(),
      image: document.getElementById("tileImageInput").value.trim(),
      quantity
    };
    await saveBingoState();
    closeTileEditor();
  });
  document.getElementById("clearTileBtn")?.addEventListener("click", async () => {
    if (activeTileIndex === null) return;
    bingoState.tiles[activeTileIndex] = { ...emptyBingoBoard()[activeTileIndex] };
    await saveBingoState();
    closeTileEditor();
  });
  document.getElementById("submitProofBtn")?.addEventListener("click", submitProof);
  document.getElementById("bingoResetProgressBtn")?.addEventListener("click", async () => {
    if (!confirm("Reset all proofs, attacks, ship hits, and tile progress?")) return;
    bingoState.tiles = bingoState.tiles.map(tile => ({ ...tile, status: "open", completedBy: "", completedTeam: "", proofId: "" }));
    bingoState.proofs = [];
    bingoState.attacks = [];
    Object.keys(TEAMS).forEach(team => bingoState.teams[team].ships.forEach(ship => ship.sunk = false));
    bingoState.phase = "setup";
    addLog("Progress was reset by staff.");
    await saveBingoState();
  });
  document.getElementById("bingoClearBoardBtn")?.addEventListener("click", async () => {
    if (!confirm("Clear the entire board? This removes all tile names, images, quantities, and tile progress.")) return;
    bingoState.tiles = emptyBingoBoard();
    bingoState.proofs = [];
    bingoState.attacks = [];
    bingoState.phase = "setup";
    bingoState.locked = false;
    Object.keys(TEAMS).forEach(team => {
      bingoState.teams[team].ships = normaliseShips([]);
      bingoState.teams[team].attacks = [];
    });
    addLog("Board was cleared by staff.");
    await saveBingoState();
  });

  document.getElementById("bingoRerollBtn")?.addEventListener("click", async () => {
    const demoTiles = emptyBingoBoard();
    bingoState.tiles = demoTiles.map((tile, index) => {
      const demoItem = DEFAULT_ITEMS[index % DEFAULT_ITEMS.length];
      return {
        ...tile,
        id: index,
        name: `${demoItem.name} ${Math.floor(index / DEFAULT_ITEMS.length) + 1}`,
        image: demoItem.image,
        quantity: (index % 5) + 1,
        status: "open",
        completedBy: "",
        completedTeam: "",
        proofId: ""
      };
    });
    bingoState.size = BINGO_SIZE;
    bingoState.phase = "setup";
    bingoState.locked = false;
    addLog(`Demo board was filled by staff (${bingoState.tiles.length} tiles).`);
    await saveBingoState();
  });
  document.getElementById("bingoLockBtn")?.addEventListener("click", async () => {
    bingoState.locked = !bingoState.locked;
    addLog(`Board was ${bingoState.locked ? "locked" : "unlocked"} by staff.`);
    await saveBingoState();
  });
  document.getElementById("bingoStartBtn")?.addEventListener("click", async () => {
    if (bingoState.phase === "setup") {
      if (!Object.values(bingoState.teams).every(team => team.ships.every(ship => ship.cells.length === ship.size))) {
        if (!confirm("Not all ships are placed. Start anyway?")) return;
      }
      bingoState.phase = "active";
      bingoState.locked = true;
      addLog("Battleship Bingo has started.");
    } else if (bingoState.phase === "active") {
      bingoState.phase = "complete";
      addLog("Battleship Bingo was ended by staff.");
    } else {
      bingoState.phase = "active";
      addLog("Battleship Bingo was reopened by staff.");
    }
    await saveBingoState();
  });
  document.querySelectorAll(".bingo-place-btn").forEach(button => {
    button.addEventListener("click", () => {
      if (!isBingoStaff) return alert("Staff only.");
      placingTeam = button.dataset.team;
      placingShipIndex = bingoState.teams[placingTeam].ships.findIndex(ship => ship.cells.length !== ship.size);
      if (placingShipIndex < 0) placingShipIndex = 0;
      placingOrientation = prompt("Ship orientation: horizontal or vertical?", placingOrientation)?.toLowerCase().startsWith("v") ? "vertical" : "horizontal";
      alert(`Click the starting square for ${bingoState.teams[placingTeam].ships[placingShipIndex].name}.`);
      renderFleets();
    });
  });
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

(async function initBingo() {
  bindBingoControls();
  await checkBingoStaff();
  await loadBingoState();
})();
