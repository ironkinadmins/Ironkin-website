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
  document.getElementById("bingoAdminActions")?.style.setProperty("display", isBingoStaff ? "block" : "none");
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
  renderPhaseProgress();
  if (bingoState.phase === "setup") setBingoTab("board");
  if (bingoState.phase === "captains") setBingoTab("captains");
  if (bingoState.phase === "ships") setBingoTab("fleets");
  renderScore();
  renderBingoBoard();
  renderFleets();
  renderProofs();
  renderLog();
  renderCaptains();
  updateAdminButtons();
}

function renderStatus() {
  document.body.classList.toggle("bingo-setup", bingoState.phase === "setup");
  document.body.classList.toggle("bingo-captains", bingoState.phase === "captains");
  document.body.classList.toggle("bingo-ships", bingoState.phase === "ships");
  document.body.classList.toggle("bingo-active", bingoState.phase === "active" || bingoState.phase === "complete");

  const title = document.getElementById("bingoStatusTitle");
  const text = document.getElementById("bingoStatusText");
  const state = document.getElementById("bingoBoardState");

  const phaseLabel = getPhaseLabel();

  if (title) title.textContent = `Current Phase: ${phaseLabel}`;

  if (text) {
    text.textContent = bingoState.phase === "setup"
      ? "Build the 10×10 board, then lock it to assign captains."
      : bingoState.phase === "captains"
        ? "Assign one captain to each team, then continue to ship placement."
        : bingoState.phase === "ships"
          ? "Captains place their hidden ships. Start the game once both fleets are complete."
          : bingoState.phase === "active"
            ? "Teams can submit proofs. Approved proofs fire attacks against the opposing fleet."
            : "Battleship Bingo is complete.";
  }

  if (state) {
    state.textContent = phaseLabel;
    state.classList.toggle("locked", bingoState.locked || bingoState.phase !== "setup");
  }
}

function getPhaseLabel() {
  if (bingoState.phase === "active") return "Active Game";
  if (bingoState.phase === "complete") return "Complete";
  if (bingoState.phase === "ships") return "Ship Placement";
  if (bingoState.phase === "captains") return "Assign Captains";
  return bingoState.locked ? "Locked Setup" : "Board Setup";
}

function renderPhaseProgress() {
  const summary = document.getElementById("bingoGameSummary");
  const steps = document.getElementById("bingoPhaseSteps");
  if (!summary && !steps) return;

  const emberSunk = getSunkCount("ember");
  const ashSunk = getSunkCount("ash");
  if (summary) {
    summary.textContent = `${TEAMS.ember.name}: ${emberSunk}/${SHIPS.length} enemy ships sunk. ${TEAMS.ash.name}: ${ashSunk}/${SHIPS.length} enemy ships sunk.`;
  }

  if (!steps) return;

  const boardDone = bingoState.locked || bingoState.phase !== "setup";
  const captainsDone = captainsAreValid(false) && ["ships", "active", "complete"].includes(bingoState.phase);
  const shipsDone = Object.values(bingoState.teams).every(team => team.ships.every(ship => ship.cells.length === ship.size));
  const activeGame = bingoState.phase === "active" || bingoState.phase === "complete";

  const currentStep = !boardDone ? 0 : !captainsDone ? 1 : !shipsDone || bingoState.phase === "ships" ? 2 : 3;

  const items = [
    { label: "Board setup locked", done: boardDone },
    { label: "Captains assigned", done: captainsDone },
    { label: "Captains place hidden ships", done: shipsDone && activeGame },
    { label: "Teams submit proofs to attack", done: activeGame && bingoState.phase === "complete" }
  ];

  steps.innerHTML = items.map((item, index) => {
    const stateClass = item.done ? "complete" : index === currentStep ? "active" : "upcoming";
    const icon = item.done ? "✓" : index === currentStep ? "●" : "○";
    return `<div class="${stateClass}"><strong>${icon}</strong><span>${escapeHtml(item.label)}</span></div>`;
  }).join("");
}

function renderScore() {
  const score = document.getElementById("bingoScoreGrid");
  if (!score) return;

  const showPlacement = bingoState.phase === "ships" || bingoState.phase === "captains";

  score.innerHTML = Object.keys(TEAMS).map(team => {
    const teamState = bingoState.teams[team];
    const placed = teamState.ships.filter(ship => ship.cells.length === ship.size).length;

    if (showPlacement) {
      return `
        <div class="bingo-score-card placement ${team}">
          <span>${TEAMS[team].emoji}</span>
          <div class="bingo-team-title">
            <strong>${escapeHtml(teamState.name)}</strong>
            <small>Captain: ${escapeHtml(teamState.captain || "Not set")}</small>
          </div>
          <div class="ship-placement-count"><b>${placed}/${SHIPS.length}</b><small>ships placed</small></div>
          <div class="ship-mini-checklist">
            ${teamState.ships.map(ship => `
              <span class="${ship.cells.length === ship.size ? "placed" : "pending"}">
                <b>${ship.cells.length === ship.size ? "✓" : "□"}</b>${escapeHtml(ship.name)}
              </span>
            `).join("")}
          </div>
        </div>`;
    }

    const attackHits = bingoState.attacks.filter(a => a.attackingTeam === team && a.result === "hit").length;
    const attackMisses = bingoState.attacks.filter(a => a.attackingTeam === team && a.result === "miss").length;
    const approved = bingoState.tiles.filter(t => t.completedTeam === team && t.status === "approved").length;
    return `
      <div class="bingo-score-card ${team}">
        <span>${TEAMS[team].emoji}</span>
        <div><strong>${escapeHtml(teamState.name)}</strong><small>Captain: ${escapeHtml(teamState.captain || "Not set")}</small></div>
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

  const tiles = Array.isArray(bingoState.tiles) && bingoState.tiles.length === BINGO_SIZE * BINGO_SIZE
    ? bingoState.tiles
    : emptyBingoBoard();

  boardEl.innerHTML = tiles.map((tile, index) => {
    const qty = getTileQuantity(tile);

    return `
      <button class="bingo-tile ${tile.name ? "filled" : "empty"} status-${escapeAttr(tile.status || "open")}" type="button" data-index="${index}">
        ${qty > 1 ? `<span class="bingo-qty-badge">x${escapeHtml(qty)}</span>` : ""}
        ${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
        <span>${tile.name ? escapeHtml(tile.name) : "Empty"}</span>
        ${tile.status && tile.status !== "open" ? `<em>${escapeHtml(tile.status)}</em>` : ""}
      </button>
    `;
  }).join("");

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
        document.getElementById("tileModalTitle").textContent = button.dataset.name || "Tile";
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

    const currentShip = placingTeam === team ? bingoState.teams[team].ships[placingShipIndex] : null;

    board.innerHTML = Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => {
      const ship = bingoState.teams[team].ships.find(s => s.cells.includes(index));
      const attacked = bingoState.attacks.find(a => a.defendingTeam === team && a.targetIndex === index);
      const previewCells = currentShip ? getShipCells(index, currentShip.size, placingOrientation) : null;
      const canPreview = currentShip && previewCells && !previewCells.some(cell => bingoState.teams[team].ships.some(s => s.key !== currentShip.key && s.cells.includes(cell)));
      const classes = ["fleet-cell"];
      if (ship) classes.push("ship");
      if (attacked) classes.push(attacked.result);
      if (placingTeam === team) classes.push("placing");
      if (canPreview) classes.push("can-place");
      return `<button type="button" class="${classes.join(" ")}" data-team="${team}" data-index="${index}" title="${ship ? escapeAttr(ship.name) : "Empty water"}">${ship ? "■" : ""}${attacked ? (attacked.result === "hit" ? "✹" : "•") : ""}</button>`;
    }).join("");

    board.querySelectorAll(".fleet-cell").forEach(cell => {
      const index = Number(cell.dataset.index);
      cell.addEventListener("click", () => handleFleetCellClick(team, index));
      cell.addEventListener("mouseenter", () => showShipPreview(team, index));
      cell.addEventListener("mouseleave", () => clearShipPreview(team));
    });

    const placedCount = bingoState.teams[team].ships.filter(ship => ship.cells.length === ship.size).length;
    const activeNotice = currentShip
      ? `<div class="ship-placement-notice"><strong>Placing:</strong> ${escapeHtml(currentShip.name)} (${currentShip.size}) • ${escapeHtml(placingOrientation)}</div>`
      : bingoState.phase === "ships"
        ? `<div class="ship-placement-notice muted">Select a team, ship, and orientation before placing ships.</div>`
        : `<div class="ship-placement-notice muted">Ship placement unlocks after captains are assigned.</div>`;

    const placementControls = bingoState.phase === "ships" ? `
      <div class="ship-placement-controls">
        <div class="ship-control-row">
          <span>Orientation</span>
          <button type="button" class="ship-orientation-btn ${placingTeam === team && placingOrientation === "horizontal" ? "active" : ""}" data-team="${team}" data-orientation="horizontal">Horizontal</button>
          <button type="button" class="ship-orientation-btn ${placingTeam === team && placingOrientation === "vertical" ? "active" : ""}" data-team="${team}" data-orientation="vertical">Vertical</button>
        </div>
        <div class="ship-select-grid">
          ${bingoState.teams[team].ships.map((ship, index) => `
            <button type="button" class="ship-select-btn ${ship.cells.length === ship.size ? "placed" : ""} ${placingTeam === team && placingShipIndex === index ? "active" : ""}" data-team="${team}" data-ship-index="${index}">
              <strong>${escapeHtml(ship.name)}</strong>
              <small>${ship.size} tiles ${ship.cells.length === ship.size ? "• placed" : ""}</small>
            </button>
          `).join("")}
        </div>
      </div>
    ` : "";

    list.innerHTML = `
      <div class="ship-placement-summary">${placedCount}/${SHIPS.length} ships placed</div>
      ${activeNotice}
      ${placementControls}
      ${bingoState.teams[team].ships.map((ship, index) => `
        <div class="ship-row ${ship.sunk ? "sunk" : ""} ${placingTeam === team && placingShipIndex === index ? "active" : ""}">
          <strong>${ship.cells.length === ship.size ? "✓" : "□"} ${escapeHtml(ship.name)}</strong>
          <span>${ship.cells.length}/${ship.size} placed</span>
          <em>${ship.sunk ? "Sunk" : ship.cells.length === ship.size ? "Placed" : "Not placed"}</em>
        </div>
      `).join("")}
    `;

    list.querySelectorAll(".ship-orientation-btn").forEach(button => {
      button.addEventListener("click", () => {
        placingTeam = button.dataset.team;
        placingOrientation = button.dataset.orientation;
        if (placingShipIndex < 0 || !bingoState.teams[placingTeam].ships[placingShipIndex]) placingShipIndex = 0;
        renderFleets();
      });
    });

    list.querySelectorAll(".ship-select-btn").forEach(button => {
      button.addEventListener("click", () => {
        placingTeam = button.dataset.team;
        placingShipIndex = Number(button.dataset.shipIndex);
        renderFleets();
      });
    });
  });
}

function isValidShipPlacement(team, ship, cells) {
  return Boolean(
    cells &&
    ship &&
    !cells.some(cell => bingoState.teams[team].ships.some(existing => existing.key !== ship.key && existing.cells.includes(cell)))
  );
}

function clearShipPreview(team) {
  document.querySelectorAll(`#${team}FleetBoard .fleet-cell.preview-valid, #${team}FleetBoard .fleet-cell.preview-invalid`).forEach(cell => {
    cell.classList.remove("preview-valid", "preview-invalid");
  });
}

function showShipPreview(team, startIndex) {
  clearShipPreview(team);
  if (bingoState.phase !== "ships" || placingTeam !== team) return;
  const ship = bingoState.teams[team].ships[placingShipIndex];
  if (!ship) return;
  const cells = getShipCells(startIndex, ship.size, placingOrientation);
  const valid = isValidShipPlacement(team, ship, cells);
  const previewCells = cells || [startIndex];

  previewCells.forEach(cellIndex => {
    const cell = document.querySelector(`#${team}FleetBoard .fleet-cell[data-index="${cellIndex}"]`);
    if (cell) cell.classList.add(valid ? "preview-valid" : "preview-invalid");
  });
}

function handleFleetCellClick(team, startIndex) {
  if (!isBingoStaff || bingoState.phase !== "ships" || placingTeam !== team) return;
  const ship = bingoState.teams[team].ships[placingShipIndex];
  if (!ship) return;
  const cells = getShipCells(startIndex, ship.size, placingOrientation);
  if (!isValidShipPlacement(team, ship, cells)) {
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

function renderCaptains() {
  const emberInput = document.getElementById("emberCaptainInput");
  const ashInput = document.getElementById("ashCaptainInput");
  if (emberInput && document.activeElement !== emberInput) emberInput.value = bingoState.teams?.ember?.captain || "";
  if (ashInput && document.activeElement !== ashInput) ashInput.value = bingoState.teams?.ash?.captain || "";
}

function updateAdminButtons() {
  const lockBtn = document.getElementById("bingoLockBtn");
  const startBtn = document.getElementById("bingoStartBtn");
  const phaseBtn = document.getElementById("bingoPhaseActionBtn");

  const isSetup = bingoState.phase === "setup";
  const isCaptains = bingoState.phase === "captains";
  const isShips = bingoState.phase === "ships";
  const isActive = bingoState.phase === "active";
  const isComplete = bingoState.phase === "complete";

  if (lockBtn) lockBtn.textContent = isSetup && !bingoState.locked ? "Lock Board" : "Unlock Board";
  if (startBtn) {
    startBtn.textContent = isActive ? "End Game" : isComplete ? "Reopen Game" : "Start Game";
    startBtn.style.display = isSetup || isCaptains ? "none" : "inline-flex";
  }

  if (phaseBtn) {
    phaseBtn.style.display = isBingoStaff ? "inline-flex" : "none";
    if (isSetup) phaseBtn.textContent = "Lock Board";
    else if (isCaptains) phaseBtn.textContent = "Continue to Ship Placement";
    else if (isShips) phaseBtn.textContent = "Start Game";
    else if (isActive) phaseBtn.textContent = "End Game";
    else if (isComplete) phaseBtn.textContent = "Reopen Game";
    else phaseBtn.textContent = "Start Game";
  }
}

function setBingoTab(tabName) {
  document.querySelectorAll("[data-bingo-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.bingoTab === tabName);
  });
  document.querySelectorAll(".bingo-tab-panel").forEach(panel => panel.classList.remove("active"));
  document.getElementById(`bingoTab-${tabName}`)?.classList.add("active");
}


function openBingoImportModal() {
  if (!isBingoStaff) return alert("Staff only.");
  document.getElementById("bingoImportStatus").textContent = "";
  document.getElementById("bingoImportModal")?.classList.add("show");
  document.getElementById("bingoImportModal")?.setAttribute("aria-hidden", "false");
  document.getElementById("bingoImportInput")?.focus();
}

function closeBingoImportModal() {
  document.getElementById("bingoImportModal")?.classList.remove("show");
  document.getElementById("bingoImportModal")?.setAttribute("aria-hidden", "true");
}

function parseBingoImportLine(line) {
  let text = String(line || "").trim();
  if (!text) return null;

  text = text.replace(/^[-*•\d.)\s]+/, "").trim();

  let quantity = 1;
  const patterns = [
    /\s+x\s*(\d+)$/i,
    /\s*\(\s*x?\s*(\d+)\s*\)$/i,
    /\s*[,|;]\s*x?\s*(\d+)$/i,
    /\s+-\s*x?\s*(\d+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      quantity = Math.max(1, Number.parseInt(match[1], 10) || 1);
      text = text.replace(pattern, "").trim();
      break;
    }
  }

  return text ? { name: text, quantity } : null;
}

async function findWikiImageForImport(name) {
  try {
    const response = await fetch(`/api/osrs/search?q=${encodeURIComponent(name)}`);
    if (!response.ok) return "";
    const data = await response.json();
    const results = Array.isArray(data) ? data : data.results || [];
    const exact = results.find(item => item?.name?.toLowerCase() === name.toLowerCase() && item.image);
    const first = results.find(item => item?.image);
    return (exact || first)?.image || "";
  } catch {
    return "";
  }
}

async function importBingoList() {
  if (!isBingoStaff) return alert("Staff only.");

  const input = document.getElementById("bingoImportInput");
  const status = document.getElementById("bingoImportStatus");
  const importBtn = document.getElementById("runBingoImportBtn");

  const parsed = String(input?.value || "")
    .split(/\r?\n/)
    .map(parseBingoImportLine)
    .filter(Boolean)
    .slice(0, BINGO_SIZE * BINGO_SIZE);

  if (!parsed.length) {
    if (status) status.textContent = "Paste at least one item before importing.";
    return;
  }

  const ok = confirm(`Import ${parsed.length} item${parsed.length === 1 ? "" : "s"} into the board? This will replace the current board and clear progress.`);
  if (!ok) return;

  if (importBtn) importBtn.disabled = true;
  if (status) status.textContent = `Importing 0/${parsed.length} items...`;

  const importedTiles = emptyBingoBoard();

  for (let index = 0; index < parsed.length; index++) {
    const item = parsed[index];
    if (status) status.textContent = `Importing ${index + 1}/${parsed.length}: ${item.name}`;
    const image = await findWikiImageForImport(item.name);

    importedTiles[index] = {
      ...importedTiles[index],
      id: index,
      name: item.name,
      image,
      quantity: item.quantity,
      status: "open",
      completedBy: "",
      completedTeam: "",
      proofId: ""
    };
  }

  bingoState.tiles = importedTiles;
  bingoState.size = BINGO_SIZE;
  bingoState.phase = "setup";
  bingoState.locked = false;
  bingoState.proofs = [];
  bingoState.attacks = [];

  Object.keys(TEAMS).forEach(team => {
    bingoState.teams[team].ships = normaliseShips([]);
    bingoState.teams[team].attacks = [];
  });

  addLog(`Imported ${parsed.length} Battleship Bingo tile${parsed.length === 1 ? "" : "s"}.`);
  await saveBingoState();

  if (status) status.textContent = `Imported ${parsed.length} item${parsed.length === 1 ? "" : "s"}.`;
  if (importBtn) importBtn.disabled = false;
  closeBingoImportModal();
}

function captainsAreValid(showAlerts = false) {
  const emberCaptain = (bingoState.teams.ember.captain || "").trim();
  const ashCaptain = (bingoState.teams.ash.captain || "").trim();

  if (!emberCaptain || !ashCaptain) {
    if (showAlerts) alert("Assign a captain to both teams first.");
    return false;
  }

  if (emberCaptain.toLowerCase() === ashCaptain.toLowerCase()) {
    if (showAlerts) alert("The same captain cannot be assigned to both teams.");
    return false;
  }

  return true;
}

async function continueToShipPlacement() {
  if (!captainsAreValid(true)) return;
  bingoState.phase = "ships";
  bingoState.locked = true;
  addLog("Captain assignment complete. Ship placement started.");
  await saveBingoState();
  setBingoTab("fleets");
}

async function handlePhaseAction() {
  if (!isBingoStaff) return alert("Staff only.");

  if (bingoState.phase === "setup") {
    const lockBtn = document.getElementById("bingoLockBtn");
    lockBtn?.click();
    return;
  }

  if (bingoState.phase === "captains") {
    await continueToShipPlacement();
    return;
  }

  const startBtn = document.getElementById("bingoStartBtn");
  startBtn?.click();
}

function bindBingoControls() {
  document.querySelectorAll("[data-bingo-tab]").forEach(button => {
    button.addEventListener("click", () => {
      setBingoTab(button.dataset.bingoTab);
    });
  });
  document.getElementById("bingoHelpBtn")?.addEventListener("click", openBingoHelpModal);
  document.getElementById("bingoPhaseActionBtn")?.addEventListener("click", handlePhaseAction);
  document.getElementById("closeBingoHelpModal")?.addEventListener("click", closeBingoHelpModal);
  document.getElementById("bingoHelpModal")?.addEventListener("click", event => {
    if (event.target.id === "bingoHelpModal") closeBingoHelpModal();
  });
  document.getElementById("bingoImportBtn")?.addEventListener("click", openBingoImportModal);
  document.getElementById("closeBingoImportModal")?.addEventListener("click", closeBingoImportModal);
  document.getElementById("bingoImportModal")?.addEventListener("click", event => {
    if (event.target.id === "bingoImportModal") closeBingoImportModal();
  });
  document.getElementById("clearBingoImportBtn")?.addEventListener("click", () => {
    const input = document.getElementById("bingoImportInput");
    if (input) input.value = "";
    document.getElementById("bingoImportStatus").textContent = "";
  });
  document.getElementById("runBingoImportBtn")?.addEventListener("click", importBingoList);
  document.getElementById("closeTileModal")?.addEventListener("click", closeTileEditor);
  document.getElementById("tileModal")?.addEventListener("click", event => {
    if (event.target.id === "tileModal") closeTileEditor();
  });
  document.getElementById("tileNameInput")?.addEventListener("input", event => {
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
    const fullBoard = emptyBingoBoard();

    bingoState.tiles = fullBoard.map((tile, index) => {
      const item = DEFAULT_ITEMS[index % DEFAULT_ITEMS.length];

      return {
        ...tile,
        id: index,
        name: item.name,
        image: item.image,
        quantity: (index % 4) + 1,
        status: "open",
        completedBy: "",
        completedTeam: "",
        proofId: ""
      };
    });

    bingoState.size = BINGO_SIZE;
    bingoState.phase = "setup";
    bingoState.locked = false;
    bingoState.proofs = [];
    bingoState.attacks = [];

    Object.keys(TEAMS).forEach(team => {
      bingoState.teams[team].ships = normaliseShips([]);
      bingoState.teams[team].attacks = [];
    });

    addLog(`Demo board generated with ${bingoState.tiles.length} tiles.`);
    await saveBingoState();
  });


  document.querySelectorAll(".bingo-assign-captain-btn").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isBingoStaff) return alert("Staff only.");
      const team = button.dataset.team;
      const opponent = getOpponent(team);
      const input = document.getElementById(`${team}CaptainInput`);
      const captain = (input?.value || "").trim();

      if (!captain) {
        alert("Enter a captain name first.");
        return;
      }

      if (bingoState.teams[opponent]?.captain?.trim().toLowerCase() === captain.toLowerCase()) {
        alert("The same captain cannot be assigned to both teams.");
        return;
      }

      bingoState.teams[team].captain = captain;
      addLog(`${bingoState.teams[team].name} captain assigned: ${captain}.`);
      await saveBingoState();
    });
  });

  document.getElementById("bingoContinueToFleetsBtn")?.addEventListener("click", () => {
    continueToShipPlacement();
  });

  document.getElementById("bingoLockBtn")?.addEventListener("click", async () => {
    if (bingoState.phase === "setup" && !bingoState.locked) {
      bingoState.locked = true;
      bingoState.phase = "captains";
      addLog("Board was locked. Captain assignment started.");
      await saveBingoState();
      setBingoTab("captains");
      return;
    }

    if (!confirm("Unlocking returns the event to board setup. Continue?")) return;
    bingoState.locked = false;
    bingoState.phase = "setup";
    placingTeam = null;
    addLog("Board was unlocked and returned to setup.");
    await saveBingoState();
    setBingoTab("board");
  });
  document.getElementById("bingoStartBtn")?.addEventListener("click", async () => {
    if (bingoState.phase === "setup") {
      alert("Lock the board and assign captains before starting the game.");
      return;
    }

    if (bingoState.phase === "captains") {
      await continueToShipPlacement();
      return;
    }

    if (bingoState.phase === "ships") {
      if (!Object.values(bingoState.teams).every(team => team.ships.every(ship => ship.cells.length === ship.size))) {
        alert("Both fleets need all ships placed before starting the game.");
        return;
      }
      bingoState.phase = "active";
      bingoState.locked = true;
      placingTeam = null;
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
      if (bingoState.phase !== "ships") return alert("Continue to Ship Placement before placing ships.");
      placingTeam = button.dataset.team;
      placingShipIndex = bingoState.teams[placingTeam].ships.findIndex(ship => ship.cells.length !== ship.size);
      if (placingShipIndex < 0) {
        alert(`${bingoState.teams[placingTeam].name} already has all ships placed.`);
        placingTeam = null;
        renderFleets();
        return;
      }
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
