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
  ember: { name: "Apey's Apes", emoji: "🦍" },
  ash: { name: "The Harambe Hunters", emoji: "⚓" }
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
let isBingoSignedIn = false;
let currentUserBingoTeam = null;
let bingoAccessInfo = null;
const bingoQuery = new URLSearchParams(window.location.search);
const pageTeamView = document.body?.dataset?.teamView || "";
const pathTeamView = /(?:^|\/)team-2(?:\.html)?\/?$/i.test(window.location.pathname)
  ? "team2"
  : /(?:^|\/)team-1(?:\.html)?\/?$/i.test(window.location.pathname)
    ? "team1"
    : "";
const forcedAccessTeam = ["team1", "team2"].includes(pageTeamView)
  ? pageTeamView
  : pathTeamView || (bingoQuery.get("teamView") === "1"
    ? (bingoQuery.get("team") === "team2" ? "team2" : "team1")
    : null);
let activeTileIndex = null;
let wikiSearchTimer = null;
let placingTeam = null;
let placingShipIndex = 0;
let placingOrientation = "horizontal";
let activeBoardMode = "attack";
let activeBingoTab = "board";
let activeSidebarTab = "players";
let activeSidebarCollapsed = false;
let draggedBoardTileIndex = null;
let suppressTileClick = false;

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
    attacks: [],
    fleetConfirmed: false
  };
}

function getTeamDisplayName(team) {
  return (bingoState.teams?.[team]?.name || TEAMS[team]?.name || team).trim();
}

function emptyBingoBoard() {
  return Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => ({
    id: index,
    name: "",
    image: "",
    quantity: 1,
    completedQuantity: 0,
    status: "open",
    completedBy: "",
    completedTeam: "",
    proofId: "",
    teamProgress: {
      ember: { completedQuantity: 0, status: "open", completedBy: "", proofId: "" },
      ash: { completedQuantity: 0, status: "open", completedBy: "", proofId: "" }
    }
  }));
}

function emptyTeamProgress() {
  return { completedQuantity: 0, status: "open", completedBy: "", proofId: "" };
}

function normaliseTileProgress(tile) {
  const progress = {
    ember: { ...emptyTeamProgress(), ...(tile?.teamProgress?.ember || {}) },
    ash: { ...emptyTeamProgress(), ...(tile?.teamProgress?.ash || {}) }
  };

  // Migrate older shared progress to only the team that earned it.
  const legacyTeam = tile?.completedTeam === "ash" ? "ash" : tile?.completedTeam === "ember" ? "ember" : null;
  const legacyCompleted = Math.max(0, Number.parseInt(tile?.completedQuantity ?? tile?.completedQty ?? tile?.progress ?? 0, 10) || 0);
  if (legacyTeam && legacyCompleted > 0 && !tile?.teamProgress?.[legacyTeam]) {
    progress[legacyTeam] = {
      completedQuantity: legacyCompleted,
      status: tile?.status || (legacyCompleted > 0 ? "partial" : "open"),
      completedBy: tile?.completedBy || "",
      proofId: tile?.proofId || ""
    };
  }

  for (const team of ["ember", "ash"]) {
    progress[team].completedQuantity = Math.max(0, Number.parseInt(progress[team].completedQuantity ?? 0, 10) || 0);
    progress[team].status = ["open", "submitted", "partial", "approved", "rejected"].includes(progress[team].status) ? progress[team].status : "open";
    progress[team].completedBy = String(progress[team].completedBy || "");
    progress[team].proofId = String(progress[team].proofId || "");
  }
  return progress;
}

function normaliseState(data) {
  const base = createDefaultState();
  if (!data || typeof data !== "object") return base;
  const size = Number(data.size || BINGO_SIZE);
  const tiles = Array.isArray(data.tiles) && data.tiles.length
    ? data.tiles.slice(0, BINGO_SIZE * BINGO_SIZE).map((tile, index) => ({ ...base.tiles[index], ...tile, id: index, completedQuantity: 0, completedQty: 0, progress: 0, status: "open", completedBy: "", completedTeam: "", proofId: "", teamProgress: normaliseTileProgress(tile) }))
    : base.tiles;
  while (tiles.length < BINGO_SIZE * BINGO_SIZE) tiles.push({ ...base.tiles[tiles.length], id: tiles.length });

  const normalised = {
    ...base,
    ...data,
    size: BINGO_SIZE,
    tiles,
    teams: {
      ember: { ...base.teams.ember, ...(data.teams?.ember || {}), key: "ember", name: data.teams?.ember?.name || TEAMS.ember.name, ships: normaliseShips(data.teams?.ember?.ships) },
      ash: { ...base.teams.ash, ...(data.teams?.ash || {}), key: "ash", name: data.teams?.ash?.name || TEAMS.ash.name, ships: normaliseShips(data.teams?.ash?.ships) }
    },
    proofs: Array.isArray(data.proofs) ? data.proofs : [],
    attacks: Array.isArray(data.attacks) ? data.attacks : [],
    log: Array.isArray(data.log) && data.log.length ? data.log : base.log
  };
  return normalised;
}

function normaliseShips(ships) {
  return SHIPS.map(template => {
    const existing = Array.isArray(ships) ? ships.find(ship => ship.key === template.key) : null;
    return { ...template, cells: Array.isArray(existing?.cells) ? existing.cells : [], sunk: Boolean(existing?.sunk) };
  });
}

async function checkBingoStaff() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await response.json();
    const roles = data?.user?.roles || [];
    isBingoSignedIn = data?.signedIn === true;
    isBingoStaff = Boolean(isBingoSignedIn && roles.some(role => STAFF_ROLE_IDS.includes(role)));
  } catch {
    isBingoSignedIn = false;
    isBingoStaff = false;
  }
  document.getElementById("bingoAdminActions")?.style.setProperty("display", isBingoStaff ? "block" : "none");
  document.getElementById("activeGameAdminActions")?.style.setProperty("display", isBingoStaff ? "block" : "none");
  return isBingoSignedIn;
}

async function loadCurrentUserBingoTeam() {
  try {
    const response = await fetch("/api/bingo/signups", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const team = data?.currentSignup?.team;
    currentUserBingoTeam = team === "team2" ? "ash" : team === "team1" ? "ember" : null;
  } catch {
    currentUserBingoTeam = null;
  }
  return currentUserBingoTeam;
}

async function loadBingoState() {
  try {
    const boardUrl = forcedAccessTeam ? `/api/bingo/board?teamView=${encodeURIComponent(forcedAccessTeam)}` : "/api/bingo/board";
    const response = await fetch(boardUrl, { cache: "no-store" });
    if (response.status === 401) {
      showTeamAccessGate(bingoAccessInfo);
      return;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not load board.");
    }
    const data = await response.json();
    if (["ember", "ash"].includes(data.viewerTeam)) {
      currentUserBingoTeam = data.viewerTeam;
      const teamSelect = document.getElementById("proofTeamSelect");
      if (teamSelect) teamSelect.value = currentUserBingoTeam;
    }
    bingoState = normaliseState(data);
    renderAll();
  } catch (error) {
    if (isBingoStaff) {
      bingoState = normaliseState(JSON.parse(localStorage.getItem("ironkin:bingo:state") || "null"));
      renderAll();
      return;
    }
    const page = document.querySelector("main.bingo-page");
    if (page) {
      page.innerHTML = `
        <section class="bingo-status-card" style="margin-top:2rem;">
          <div>
            <strong>Team access unavailable</strong>
            <span>${escapeHtml(error?.message || "Your Battleship Bingo team could not be confirmed.")}</span>
          </div>
        </section>`;
    }
  }
}

function showBingoLoginRequired() {
  const page = document.querySelector("main.bingo-page");
  if (!page) return;
  page.innerHTML = `
    <section class="bingo-status-card" style="margin-top:2rem;">
      <div>
        <strong>Sign in required</strong>
        <span>You must be signed in with Discord to view Battleship Bingo.</span>
      </div>
      <div class="bingo-status-actions">
        <a class="btn primary" href="/api/auth/login">Sign in with Discord</a>
      </div>
    </section>`;
}

async function saveBingoState() {
  bingoState.updatedAt = new Date().toISOString();
  try {
    const response = await fetch("/api/bingo/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bingoState)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Save failed.");
    }
    bingoState = normaliseState(await response.json());
  } catch (error) {
    console.error("Could not save Bingo state", error);
    alert("The board could not be saved to the server. Your team boards were not changed. Refresh and try again.");
    throw error;
  }
  renderAll();
}

function addLog(text) {
  bingoState.log.unshift({ at: new Date().toISOString(), text });
  bingoState.log = bingoState.log.slice(0, 2000);
}

function canReorderBingoBoard() {
  return isBingoStaff && bingoState.phase === "setup" && !bingoState.locked;
}

function resetTileRuntimeProgress(tile, index) {
  return {
    ...tile,
    id: index,
    status: "open",
    completedQuantity: 0,
    completedBy: "",
    completedTeam: "",
    proofId: "",
    teamProgress: { ember: emptyTeamProgress(), ash: emptyTeamProgress() }
  };
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

async function randomizeBingoBoard() {
  if (!isBingoStaff) return alert("Staff only.");
  if (!canReorderBingoBoard()) return alert("Return to unlocked Board Setup before randomizing the board.");

  const currentTiles = Array.isArray(bingoState.tiles) && bingoState.tiles.length === BINGO_SIZE * BINGO_SIZE
    ? bingoState.tiles
    : emptyBingoBoard();
  const filledCount = currentTiles.filter(tile => tile?.name).length;

  if (!filledCount) return alert("Add or import tiles before randomizing the board.");
  if (!confirm(`Randomize the current board layout? This will shuffle ${filledCount} filled tile${filledCount === 1 ? "" : "s"}.`)) return;

  bingoState.tiles = shuffleArray(currentTiles).map(resetTileRuntimeProgress);
  bingoState.proofs = [];
  bingoState.attacks = [];
  Object.keys(TEAMS).forEach(team => {
    bingoState.teams[team].ships = normaliseShips([]);
    bingoState.teams[team].attacks = [];
    bingoState.teams[team].fleetConfirmed = false;
  });
  addLog("Board tiles were randomized by staff.");
  await saveBingoState();
}

async function swapBingoTiles(fromIndex, toIndex) {
  if (!canReorderBingoBoard()) return;
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= BINGO_SIZE * BINGO_SIZE || toIndex >= BINGO_SIZE * BINGO_SIZE) return;

  const tiles = Array.isArray(bingoState.tiles) && bingoState.tiles.length === BINGO_SIZE * BINGO_SIZE
    ? [...bingoState.tiles]
    : emptyBingoBoard();
  [tiles[fromIndex], tiles[toIndex]] = [tiles[toIndex], tiles[fromIndex]];
  bingoState.tiles = tiles.map((tile, index) => ({ ...tile, id: index }));
  addLog(`Swapped board tile ${fromIndex + 1} with tile ${toIndex + 1}.`);
  await saveBingoState();
}

function bindBoardTileDrag(tileEl) {
  if (!canReorderBingoBoard()) return;
  tileEl.draggable = true;
  tileEl.setAttribute("aria-grabbed", "false");
  tileEl.addEventListener("dragstart", event => {
    draggedBoardTileIndex = Number(tileEl.dataset.index);
    suppressTileClick = true;
    tileEl.classList.add("dragging");
    tileEl.setAttribute("aria-grabbed", "true");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(draggedBoardTileIndex));
    }
  });
  tileEl.addEventListener("dragover", event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    tileEl.classList.add("drag-over");
  });
  tileEl.addEventListener("dragleave", () => {
    tileEl.classList.remove("drag-over");
  });
  tileEl.addEventListener("drop", async event => {
    event.preventDefault();
    tileEl.classList.remove("drag-over");
    const fromIndex = Number(event.dataTransfer?.getData("text/plain") || draggedBoardTileIndex);
    const toIndex = Number(tileEl.dataset.index);
    await swapBingoTiles(fromIndex, toIndex);
  });
  tileEl.addEventListener("dragend", () => {
    tileEl.classList.remove("dragging");
    tileEl.setAttribute("aria-grabbed", "false");
    draggedBoardTileIndex = null;
    setTimeout(() => { suppressTileClick = false; }, 0);
  });
}

function boardIsHiddenForVisitor() {
  return Boolean(bingoState?.boardHidden) && !isBingoStaff;
}

function renderHiddenBoardNotice() {
  renderStatus();
  const panels = document.querySelectorAll(".bingo-tab-panel");
  panels.forEach(panel => panel.classList.toggle("active", panel.id === "bingoTab-board"));
  document.querySelectorAll("[data-bingo-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.bingoTab === "board");
    button.style.display = button.dataset.bingoTab === "board" ? "" : "none";
  });

  const activeHeader = document.getElementById("activeGameHeader");
  if (activeHeader) activeHeader.style.display = "none";
  const activeSidebar = document.getElementById("activeGameSidebar");
  if (activeSidebar) activeSidebar.style.display = "none";
  const sidePanel = document.querySelector(".bingo-side-panel");
  if (sidePanel) sidePanel.style.display = "none";
  const toolbar = document.querySelector(".bingo-board-toolbar");
  if (toolbar) toolbar.style.display = "none";

  const boardEl = document.getElementById("bingoBoard");
  if (boardEl) {
    boardEl.className = "bingo-board bingo-board-hidden-notice";
    boardEl.innerHTML = `
      <div class="bingo-hidden-card">
        <strong>Board hidden until reveal</strong>
        <span>The Battleship Bingo board is not public yet. Check back once staff fully reveals the board.</span>
      </div>`;
  }
}

function renderAll() {
  applyTeamViewVisibility();
  if (boardIsHiddenForVisitor()) {
    renderHiddenBoardNotice();
    return;
  }

  document.querySelectorAll("[data-bingo-tab]").forEach(button => { button.style.display = ""; });
  const sidePanel = document.querySelector(".bingo-side-panel");
  if (sidePanel) sidePanel.style.display = "";
  const toolbar = document.querySelector(".bingo-board-toolbar");
  if (toolbar) toolbar.style.display = "";

  renderStatus();
  renderPhaseProgress();
  syncBingoTabForPhase();
  renderScore();
  renderActiveGameHeader();
  renderAdminControlCenter();
  renderActiveGameSidebar();
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

  if (title) title.textContent = boardIsHiddenForVisitor() ? "Battleship Bingo board hidden" : `Current Phase: ${phaseLabel}`;

  if (text) {
    if (boardIsHiddenForVisitor()) {
      text.textContent = "The board will only be visible to members once staff fully reveals it.";
      return;
    }
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
    summary.textContent = `${getTeamDisplayName("ember")}: ${emberSunk}/${SHIPS.length} enemy ships sunk. ${getTeamDisplayName("ash")}: ${ashSunk}/${SHIPS.length} enemy ships sunk.`;
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
        </div>`;
    }

    const attackHits = bingoState.attacks.filter(a => a.attackingTeam === team && a.result === "hit").length;
    const attackMisses = bingoState.attacks.filter(a => a.attackingTeam === team && a.result === "miss").length;
    const approved = bingoState.tiles.filter(t => getTileStatus(t, team) === "approved").length;
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


function renderActiveGameHeader() {
  const header = document.getElementById("activeGameHeader");
  if (!header) return;

  const isActiveGame = bingoState.phase === "active" || bingoState.phase === "complete";
  header.style.display = isActiveGame ? "grid" : "none";
  if (!isActiveGame) {
    header.innerHTML = "";
    return;
  }

  const winner = getWinningTeam();
  const completeBanner = bingoState.phase === "complete"
    ? `<article class="active-result-banner">
        <strong>${winner ? `${TEAMS[winner].emoji} ${escapeHtml(bingoState.teams[winner]?.name || TEAMS[winner].name)} wins!` : "Game Complete"}</strong>
        <span>Final results are locked. Staff can reopen the game from Admin Controls.</span>
      </article>`
    : "";

  header.innerHTML = `
    ${completeBanner}
    ${Object.keys(TEAMS).map(team => renderActiveTeamCard(team)).join("")}
  `;
}

function renderActiveTeamCard(team) {
  const teamState = bingoState.teams[team];
  const hitsTaken = bingoState.attacks.filter(a => a.defendingTeam === team && a.result === "hit").length;
  const lost = teamState.ships.filter(ship => ship.sunk).length;
  const afloat = Math.max(0, SHIPS.length - lost);
  const shipsSunkByTeam = getSunkCount(team);
  return `
    <article class="active-fleet-card ${escapeAttr(team)}">
      <div class="active-fleet-card-head">
        <span>${TEAMS[team].emoji}</span>
        <div>
          <h3>${escapeHtml(teamState.name)}</h3>
          <small>Captain: ${escapeHtml(teamState.captain || "Not set")}</small>
        </div>
        <strong>${shipsSunkByTeam}/${SHIPS.length} sunk</strong>
      </div>
      <div class="active-fleet-stats">
        <span class="afloat">🛡 ${afloat} afloat</span>
        <span class="lost">🔥 ${lost} lost</span>
        <span class="hits">💥 ${hitsTaken} hits taken</span>
      </div>
      <div class="active-fleet-ships">
        ${teamState.ships.map(ship => {
          return `<span class="${ship.sunk ? "sunk" : "afloat"}">${escapeHtml(ship.name)}</span>`;
        }).join("")}
      </div>
    </article>`;
}

function getShipHitCount(defendingTeam, ship) {
  if (!ship || !Array.isArray(ship.cells)) return 0;
  return ship.cells.filter(cell => bingoState.attacks.some(a => a.defendingTeam === defendingTeam && a.targetIndex === cell && a.result === "hit")).length;
}

function getWinningTeam() {
  if (!bingoState?.teams) return "";
  if (bingoState.teams.ember?.ships?.length && bingoState.teams.ember.ships.every(ship => ship.sunk)) return "ash";
  if (bingoState.teams.ash?.ships?.length && bingoState.teams.ash.ships.every(ship => ship.sunk)) return "ember";
  return "";
}

function renderActiveGameSidebar() {
  const sidebar = document.getElementById("activeGameSidebar");
  const content = document.getElementById("activeSidebarContent");
  const isActiveGame = bingoState.phase === "active" || bingoState.phase === "complete";

  if (sidebar) {
    sidebar.style.display = isActiveGame ? "block" : "none";
    sidebar.classList.toggle("collapsed", activeSidebarCollapsed);
    const collapseBtn = document.getElementById("activeSidebarCollapseBtn");
    if (collapseBtn) {
      collapseBtn.textContent = activeSidebarCollapsed ? "‹" : "›";
      collapseBtn.setAttribute("aria-label", activeSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
      collapseBtn.title = activeSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
    }
  }
  if (!sidebar || !content || !isActiveGame) return;

  sidebar.querySelectorAll("[data-active-sidebar-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.activeSidebarTab === activeSidebarTab);
  });

  if (activeSidebarTab === "proofs") {
    content.innerHTML = renderActiveProofsPanel();
  } else if (activeSidebarTab === "log") {
    content.innerHTML = renderActiveLogPanel();
  } else {
    content.innerHTML = renderActivePlayersPanel();
  }

  content.querySelectorAll("[data-proof-action]").forEach(button => {
    button.addEventListener("click", () => reviewProof(button.dataset.proofId, button.dataset.proofAction));
  });
}

function renderActivePlayersPanel() {
  return Object.keys(TEAMS).map(team => {
    const players = getTeamPlayers(team);
    return `
      <section class="active-sidebar-section">
        <h3>${TEAMS[team].emoji} ${escapeHtml(bingoState.teams[team]?.name || TEAMS[team].name)} <small>${players.length}</small></h3>
        <div class="active-player-list">
          ${players.length ? players.map(player => `
            <div class="active-player-row">
              <span class="player-dot"></span>
              <strong>${escapeHtml(player.name)}</strong>
              ${player.captain ? `<em>Captain</em>` : ""}
            </div>
          `).join("") : `<p class="muted-text">No players submitted proofs yet.</p>`}
        </div>
      </section>`;
  }).join("");
}

function getTeamPlayers(team) {
  const seen = new Set();
  const players = [];
  const captain = (bingoState.teams[team]?.captain || "").trim();
  if (captain) {
    seen.add(captain.toLowerCase());
    players.push({ name: captain, captain: true });
  }
  bingoState.proofs
    .filter(proof => proof.team === team && proof.player)
    .forEach(proof => {
      const key = proof.player.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        players.push({ name: proof.player.trim(), captain: false });
      }
    });
  return players;
}

function renderActiveProofsPanel() {
  const pending = bingoState.proofs.filter(p => p.status === "pending");
  const approved = bingoState.proofs.filter(p => p.status === "approved");
  const rejected = bingoState.proofs.filter(p => p.status === "rejected");
  return `
    ${renderProofGroup("Pending", pending, true)}
    ${renderProofGroup("Approved", approved, false)}
    ${renderProofGroup("Rejected", rejected, false)}
  `;
}

function renderProofGroup(title, proofs, allowActions) {
  return `
    <section class="active-sidebar-section">
      <h3>${escapeHtml(title)} <small>${proofs.length}</small></h3>
      <div class="active-proof-list">
        ${proofs.length ? proofs.map(proof => renderCompactProof(proof, allowActions)).join("") : `<p class="muted-text">None</p>`}
      </div>
    </section>`;
}

function isPluginTestProof(proof) {
  const note = String(proof?.note || "").toLowerCase();
  const tileName = String(proof?.tileName || "").toLowerCase();
  const bingoId = String(proof?.bingoId || "").toLowerCase();
  return Boolean(
    proof?.isTest ||
    bingoId === "test-bingo" ||
    tileName.includes("plugin test") ||
    note.includes("plugin test") ||
    note.includes("test only") ||
    note.includes("runelite plugin proof upload")
  );
}

function getProofTileName(proof) {
  const tile = bingoState.tiles[proof.tileIndex] || {};
  return proof.tileName || tile.name || (isPluginTestProof(proof) ? "Plugin Test" : `Tile ${proof.tileIndex + 1}`);
}

function renderCompactProof(proof, allowActions) {
  const isTestProof = isPluginTestProof(proof);
  return `
    <div class="active-proof-row status-${escapeAttr(proof.status)} ${isTestProof ? "is-test-proof" : ""}">
      <strong>${escapeHtml(getProofTileName(proof))} ${proof.quantity > 1 ? `<small>x${escapeHtml(proof.quantity)}</small>` : ""}</strong>
      <span>${escapeHtml(proof.player || "Unknown")} • ${isTestProof ? "Plugin Test" : escapeHtml(TEAMS[proof.team]?.name || proof.team)}</span>
      ${isBingoStaff && (allowActions || isTestProof) ? `
        <div class="proof-actions compact">
          ${allowActions && proof.status === "pending" ? `
            <button type="button" data-proof-action="approve" data-proof-id="${escapeAttr(proof.id)}">Approve</button>
            <button type="button" data-proof-action="reject" data-proof-id="${escapeAttr(proof.id)}">Reject</button>
          ` : ""}
          
        </div>` : ""}
    </div>`;
}

function renderActiveLogPanel() {
  return `
    <section class="active-sidebar-section">
      <h3>Match Log <small>${bingoState.log.length}</small></h3>
      <div class="active-log-list">
        ${bingoState.log.map(entry => `
          <div class="active-log-row">
            <time>${formatDateTime(entry.at)}</time>
            <span>${escapeHtml(entry.text)}</span>
          </div>
        `).join("")}
      </div>
    </section>`;
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

function getTileTeamProgress(tile, team = getSelectedProofTeam()) {
  const key = team === "ash" ? "ash" : "ember";
  if (!tile.teamProgress) tile.teamProgress = normaliseTileProgress(tile);
  if (!tile.teamProgress[key]) tile.teamProgress[key] = emptyTeamProgress();
  return tile.teamProgress[key];
}

function getTileCompletedQuantity(tile, team = getSelectedProofTeam()) {
  const raw = getTileTeamProgress(tile, team).completedQuantity ?? 0;
  return Math.max(0, Number.parseInt(raw, 10) || 0);
}

function getTileRemainingQuantity(tile, team = getSelectedProofTeam()) {
  return Math.max(0, getTileQuantity(tile) - getTileCompletedQuantity(tile, team));
}

function getTileProgressMarkup(tile, team = getSelectedProofTeam()) {
  const required = getTileQuantity(tile);
  const completed = Math.min(getTileCompletedQuantity(tile, team), required);
  if (!tile?.name || required <= 1 || completed <= 0) return "";
  const percent = Math.max(0, Math.min(100, Math.round((completed / required) * 100)));
  return `<span class="bingo-progress-line" aria-label="${escapeAttr(completed)} of ${escapeAttr(required)} complete"><i style="width:${escapeAttr(percent)}%"></i></span>`;
}

function getTileProgressTitle(tile, team = getSelectedProofTeam()) {
  const required = getTileQuantity(tile);
  const completed = Math.min(getTileCompletedQuantity(tile, team), required);
  if (!tile?.name || required <= 1) return tile?.name || "Empty";
  return `${tile.name} — ${completed}/${required} complete`;
}

function getTileStatus(tile, team = getSelectedProofTeam()) {
  const required = getTileQuantity(tile);
  const completed = getTileCompletedQuantity(tile, team);
  if (completed >= required && tile?.name) return "approved";
  if (completed > 0) return "partial";
  return getTileTeamProgress(tile, team).status || "open";
}

function renderBingoBoard() {
  const boardEl = document.getElementById("bingoBoard");
  if (!boardEl) return;

  renderBoardToolbar();

  if (bingoState.phase === "active" || bingoState.phase === "complete") {
    renderActiveGameBoard(boardEl);
    return;
  }

  const tiles = Array.isArray(bingoState.tiles) && bingoState.tiles.length === BINGO_SIZE * BINGO_SIZE
    ? bingoState.tiles
    : emptyBingoBoard();

  boardEl.innerHTML = tiles.map((tile, index) => {
    const qty = getTileQuantity(tile);

    return `
      <button class="bingo-tile ${tile.name ? "filled" : "empty"} status-${escapeAttr(getTileStatus(tile))}" type="button" data-index="${index}" title="${escapeAttr(getTileProgressTitle(tile, getSelectedProofTeam()))}" ${canReorderBingoBoard() ? 'draggable="true"' : ""}>
        ${qty > 1 ? `<span class="bingo-qty-badge">x${escapeHtml(qty)}</span>` : ""}
        ${getTileProgressMarkup(tile)}
        ${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
        <span>${tile.name ? escapeHtml(tile.name) : "Empty"}</span>
        ${getTileStatus(tile) !== "open" ? `<em>${escapeHtml(getTileStatus(tile))}</em>` : ""}
      </button>
    `;
  }).join("");

  boardEl.querySelectorAll(".bingo-tile").forEach(tile => {
    bindBoardTileDrag(tile);
    tile.addEventListener("click", () => {
      if (suppressTileClick) return;
      openTileModal(Number(tile.dataset.index));
    });
    bindAdminAttackContextMenu(tile);
  });
}

function renderBoardToolbar() {
  const activeControls = document.getElementById("activeBoardControls");
  const boardToolbarText = document.querySelector(".bingo-board-toolbar div:first-child");
  const attackBtn = document.getElementById("attackBoardBtn");
  const watersBtn = document.getElementById("yourWatersBtn");
  const proofTeamSelect = document.getElementById("proofTeamSelect");
  const isActive = bingoState.phase === "active" || bingoState.phase === "complete";

  if (activeControls) activeControls.style.display = isActive ? "flex" : "none";
  if (proofTeamSelect) {
    proofTeamSelect.style.display = isActive && isBingoStaff ? "" : "none";
    if (currentUserBingoTeam && !proofTeamSelect.dataset.userChanged) {
      proofTeamSelect.value = currentUserBingoTeam;
    }
  }
  if (attackBtn) attackBtn.classList.toggle("active", activeBoardMode === "attack");
  if (watersBtn) watersBtn.classList.toggle("active", activeBoardMode === "waters");

  if (!boardToolbarText) return;

  if (isActive) {
    const team = getSelectedProofTeam();
    const opponent = getOpponent(team);
    boardToolbarText.innerHTML = activeBoardMode === "attack"
      ? `<strong>Attacking ${escapeHtml(getTeamDisplayName(opponent))}'s Waters</strong>`
      : `<strong>${escapeHtml(getTeamDisplayName(team))}'s Waters</strong>`;
  } else {
    boardToolbarText.innerHTML = `<strong>Board Setup</strong><span>Click a tile to edit it. When done, lock the board and assign captains.</span>`;
  }
}

function getSelectedProofTeam() {
  if (!isBingoStaff && currentUserBingoTeam) return currentUserBingoTeam;
  const selected = document.getElementById("proofTeamSelect")?.value;
  return selected === "ash" ? "ash" : "ember";
}


function isLatestAttack(attack) {
  const latest = bingoState.attacks[bingoState.attacks.length - 1];
  return Boolean(attack && latest && attack.id === latest.id);
}

function renderActiveGameBoard(boardEl) {
  const team = getSelectedProofTeam();
  const opponent = getOpponent(team);

  boardEl.classList.toggle("active-attack-board", activeBoardMode === "attack");
  boardEl.classList.toggle("active-waters-board", activeBoardMode === "waters");

  if (activeBoardMode === "waters") {
    boardEl.innerHTML = Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => {
      const tile = bingoState.tiles[index] || {};
      const ship = bingoState.teams[team].ships.find(s => s.cells.includes(index));
      const attack = bingoState.attacks.find(a => a.defendingTeam === team && a.targetIndex === index);
      const classes = ["bingo-tile", "water-tile"];
      if (tile.name) classes.push("filled");
      if (ship) classes.push("ship", `ship-${ship.key}`);
      if (attack) {
      classes.push(`attack-${attack.result}`);
      if (isLatestAttack(attack)) classes.push("recent-attack");
    }
      return `
        <button class="${classes.join(" ")}" type="button" data-index="${index}" title="${ship ? escapeAttr(ship.name) : escapeAttr(tile.name || "Empty water")}" disabled>
          <span class="water-drop-bg">
            ${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
            ${tile.name ? `<small>${escapeHtml(tile.name)}</small>` : ""}
            ${getTileProgressMarkup(tile, team)}
          </span>
          ${ship ? `<span class="water-ship-cell">${escapeHtml(ship.name.charAt(0))}</span>` : ""}
          ${attack ? `<strong class="attack-marker">${attack.result === "hit" ? "✹" : "•"}</strong>` : ""}
        </button>
      `;
    }).join("");
    return;
  }

  boardEl.innerHTML = bingoState.tiles.map((tile, index) => {
    const qty = getTileQuantity(tile);
    const attack = bingoState.attacks.find(a => a.attackingTeam === team && a.targetIndex === index);
    const classes = ["bingo-tile", tile.name ? "filled" : "empty", "attack-tile"];
    if (attack) {
      classes.push(`attack-${attack.result}`);
      if (isLatestAttack(attack)) classes.push("recent-attack");
    }
    const tileStatus = getTileStatus(tile, team);
    if (tileStatus && tileStatus !== "open") classes.push(`status-${tileStatus}`);
    return `
      <button class="${classes.join(" ")}" type="button" data-index="${index}" title="${escapeAttr(getTileProgressTitle(tile, team))}" ${tile.name ? "" : "disabled"}>
        ${qty > 1 ? `<span class="bingo-qty-badge">x${escapeHtml(qty)}</span>` : ""}
        ${getTileProgressMarkup(tile, team)}
        ${attack ? `<strong class="attack-marker">${attack.result === "hit" ? "HIT" : "MISS"}</strong>` : ""}
        ${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
        <span>${tile.name ? escapeHtml(tile.name) : "Empty"}</span>
        ${tileStatus && tileStatus !== "open" ? `<em>${escapeHtml(tileStatus)}</em>` : ""}
      </button>
    `;
  }).join("");

  boardEl.querySelectorAll(".bingo-tile").forEach(tile => {
    tile.addEventListener("click", () => openTileModal(Number(tile.dataset.index)));
    bindAdminAttackContextMenu(tile);
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
  const proofQtyInput = document.getElementById("proofQuantityInput");
  if (proofQtyInput) {
    proofQtyInput.value = Math.max(1, Math.min(1, getTileRemainingQuantity(tile) || 1));
    proofQtyInput.max = String(Math.max(1, getTileRemainingQuantity(tile) || 1));
  }
  const canEdit = isBingoStaff && bingoState.phase === "setup" && !bingoState.locked;
  const canSubmitProof = bingoState.phase === "active" && tile.name;
  document.getElementById("staffTileEditor").style.display = canEdit ? "block" : "none";
  const manualSection = document.getElementById("staffManualOutcome");
  if (manualSection) manualSection.style.display = isBingoStaff && (bingoState.phase === "active" || bingoState.phase === "complete") && tile.name ? "block" : "none";
  const manualTeam = document.getElementById("manualAttackTeamSelect");
  if (manualTeam) manualTeam.value = getSelectedProofTeam();
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

function getNextUnplacedShipIndex(team) {
  const ships = bingoState.teams?.[team]?.ships || [];
  const nextIndex = ships.findIndex(ship => ship.cells.length !== ship.size);
  return nextIndex >= 0 ? nextIndex : 0;
}

function getShipIcon(ship) {
  const key = typeof ship === "string" ? ship : ship?.key || "ship";
  const paths = {
    carrier: `
      <rect x="14" y="23" width="82" height="8" rx="3"></rect>
      <path d="M20 31h68l12-8h9l-12 12H28z"></path>
      <rect x="30" y="12" width="26" height="8" rx="2"></rect>
      <rect x="60" y="8" width="12" height="15" rx="2"></rect>
      <path d="M74 14h20"></path>
    `,
    battleship: `
      <path d="M10 27h82l17-11 4 11h5l-13 9H22z"></path>
      <rect x="31" y="15" width="18" height="11" rx="2"></rect>
      <rect x="52" y="9" width="20" height="17" rx="2"></rect>
      <rect x="77" y="16" width="18" height="10" rx="2"></rect>
      <path d="M23 18h18M74 12h22"></path>
    `,
    cruiser: `
      <path d="M14 27h72l14-9 4 9h8l-12 8H25z"></path>
      <rect x="39" y="15" width="20" height="11" rx="2"></rect>
      <rect x="64" y="12" width="15" height="14" rx="2"></rect>
      <path d="M24 18h20M80 17h19"></path>
    `,
    submarine: `
      <path d="M17 25c8-9 75-9 86 0 2 2 2 5 0 7-11 8-78 8-86 0-3-2-3-5 0-7z"></path>
      <rect x="53" y="12" width="16" height="10" rx="2"></rect>
      <path d="M61 12V7h13"></path>
    `,
    destroyer: `
      <path d="M13 28h78l15-10 6 10h5l-13 8H25z"></path>
      <rect x="45" y="16" width="16" height="11" rx="2"></rect>
      <rect x="66" y="13" width="13" height="14" rx="2"></rect>
      <path d="M24 19h21M79 17h21"></path>
    `,
    patrol: `
      <path d="M21 28h57l13-9 7 9h8l-12 8H32z"></path>
      <rect x="43" y="17" width="17" height="10" rx="2"></rect>
      <path d="M61 20h18"></path>
    `
  };

  return `
    <svg class="ship-icon ship-icon-${escapeAttr(key)}" viewBox="0 0 120 42" aria-hidden="true" focusable="false">
      <g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${paths[key] || paths.cruiser}
      </g>
    </svg>`;
}

function getShipPlacementStatus(ship) {
  return ship?.cells?.length === ship?.size ? "placed" : "not placed";
}

function getNextUnplacedShipIndexFrom(team, currentIndex = -1) {
  const ships = bingoState.teams?.[team]?.ships || [];
  for (let offset = 1; offset <= ships.length; offset++) {
    const index = (currentIndex + offset + ships.length) % ships.length;
    if (ships[index]?.cells?.length !== ships[index]?.size) return index;
  }
  return Math.max(0, Math.min(currentIndex, ships.length - 1));
}

function toggleShipOrientation() {
  placingOrientation = placingOrientation === "horizontal" ? "vertical" : "horizontal";
  renderFleets();
}

function removeSelectedShip() {
  if (!canEditFleetsWhileUnlocked() || !placingTeam) return;
  const ship = bingoState.teams[placingTeam]?.ships?.[placingShipIndex];
  if (!ship) return;
  if (!ship.cells.length) {
    alert(`${ship.name} has not been placed yet.`);
    return;
  }
  ship.cells = [];
  ship.sunk = false;
  bingoState.teams[placingTeam].fleetConfirmed = false;
  addLog(`${bingoState.teams[placingTeam].name} removed ${ship.name}.`);
  saveBingoState();
}

async function confirmCurrentFleet() {
  if (!canEditFleetsWhileUnlocked() || !placingTeam) return;
  const team = bingoState.teams[placingTeam];
  if (!team.ships.every(ship => ship.cells.length === ship.size)) {
    alert("Place all ships for this fleet before confirming.");
    return;
  }
  team.fleetConfirmed = true;
  addLog(`${team.name} confirmed their fleet layout.`);
  await saveBingoState();
}

function allFleetsPlaced() {
  return Object.values(bingoState.teams).every(team => team.ships.every(ship => ship.cells.length === ship.size));
}

function allFleetsConfirmed() {
  return Object.values(bingoState.teams).every(team => team.fleetConfirmed);
}

function canEditFleetsWhileUnlocked() {
  return isBingoStaff && (bingoState.phase === "ships" || bingoState.phase === "setup");
}

function renderShipPlacementToolbar() {
  const toolbar = document.getElementById("shipPlacementToolbar");
  if (!toolbar) return;

  if (!canEditFleetsWhileUnlocked()) {
    toolbar.innerHTML = `
      <div class="ship-placement-toolbar-card muted">
        <strong>Ship Placement</strong>
        <span>Assign captains first, then use this screen to place each fleet's hidden ships.</span>
      </div>
    `;
    return;
  }

  if (!placingTeam) {
    placingTeam = "ember";
    placingShipIndex = getNextUnplacedShipIndex(placingTeam);
  }

  const ships = bingoState.teams[placingTeam]?.ships || [];
  if (!ships[placingShipIndex]) placingShipIndex = getNextUnplacedShipIndex(placingTeam);
  const activeShip = ships[placingShipIndex] || ships[0];
  const placedCount = ships.filter(ship => ship.cells.length === ship.size).length;
  const currentTeam = bingoState.teams[placingTeam];
  const currentConfirmed = Boolean(currentTeam?.fleetConfirmed);

  toolbar.innerHTML = `
    <div class="ship-placement-toolbar-card upgraded">
      <div class="ship-toolbar-section team-picker">
        <span class="ship-toolbar-label">Fleet</span>
        <div class="ship-toolbar-buttons">
          ${Object.keys(TEAMS).map(team => {
            const teamPlaced = bingoState.teams[team].ships.filter(ship => ship.cells.length === ship.size).length;
            const confirmed = Boolean(bingoState.teams[team].fleetConfirmed);
            return `
              <button type="button" class="ship-team-tab ${placingTeam === team ? "active" : ""} ${confirmed ? "confirmed" : ""}" data-team="${escapeAttr(team)}">
                <span>${TEAMS[team].emoji}</span>
                <strong>${escapeHtml(bingoState.teams[team].name)}</strong>
                <small>${teamPlaced}/${SHIPS.length} placed${confirmed ? " • confirmed" : ""}</small>
              </button>
            `;
          }).join("")}
        </div>
      </div>

      <div class="ship-toolbar-section orientation-picker">
        <span class="ship-toolbar-label">Orientation</span>
        <div class="ship-toolbar-buttons compact">
          <button type="button" class="ship-orientation-btn ${placingOrientation === "horizontal" ? "active" : ""}" data-orientation="horizontal">
            ${getShipIcon("carrier")}
            <span>Horizontal</span>
          </button>
          <button type="button" class="ship-orientation-btn ${placingOrientation === "vertical" ? "active" : ""}" data-orientation="vertical">
            ${getShipIcon("carrier")}
            <span>Vertical</span>
          </button>
          <button type="button" class="ship-rotate-btn" id="shipRotateBtn" title="Shortcut: R">
            <span>↻</span>
            <strong>Rotate Ship</strong>
            <small>Shortcut: R</small>
          </button>
        </div>
      </div>

      <div class="ship-toolbar-section ship-picker">
        <span class="ship-toolbar-label">Select Ship to Place</span>
        <div class="ship-tab-row">
          ${ships.map((ship, index) => {
            const status = getShipPlacementStatus(ship);
            return `
              <button type="button" class="ship-tab ${status === "placed" ? "placed" : "unplaced"} ${placingShipIndex === index ? "active" : ""}" data-team="${escapeAttr(placingTeam)}" data-ship-index="${index}">
                ${getShipIcon(ship)}
                <strong>${escapeHtml(ship.name)}</strong>
                <small>${ship.size} tiles • ${status}</small>
              </button>
            `;
          }).join("")}
        </div>
      </div>

      <div class="ship-toolbar-section ship-actions">
        <span class="ship-toolbar-label">Fleet Actions</span>
        <div class="ship-action-stack">
          <button type="button" class="btn secondary danger" id="removeSelectedShipBtn">Remove Ship</button>
          <button type="button" class="btn primary" id="confirmFleetLayoutBtn" ${placedCount === SHIPS.length ? "" : "disabled"}>
            ${currentConfirmed ? "Fleet Confirmed" : "Confirm Fleet Layout"}
          </button>
        </div>
      </div>
    </div>

    <div class="ship-placement-help">
      <span><strong>Tip:</strong> hover over the fleet grid to preview the full ship.</span>
      <span><b class="preview-dot valid"></b> Amber = valid</span>
      <span><b class="preview-dot invalid"></b> Red = invalid</span>
      <span>Press <kbd>R</kbd> to rotate.</span>
    </div>
  `;

  toolbar.querySelectorAll(".ship-team-tab").forEach(button => {
    button.addEventListener("click", () => {
      placingTeam = button.dataset.team;
      placingShipIndex = getNextUnplacedShipIndex(placingTeam);
      renderFleets();
    });
  });

  toolbar.querySelectorAll(".ship-orientation-btn").forEach(button => {
    button.addEventListener("click", () => {
      placingOrientation = button.dataset.orientation;
      renderFleets();
    });
  });

  toolbar.querySelector("#shipRotateBtn")?.addEventListener("click", toggleShipOrientation);
  toolbar.querySelector("#removeSelectedShipBtn")?.addEventListener("click", removeSelectedShip);
  toolbar.querySelector("#confirmFleetLayoutBtn")?.addEventListener("click", confirmCurrentFleet);

  toolbar.querySelectorAll(".ship-tab").forEach(button => {
    button.addEventListener("click", () => {
      placingTeam = button.dataset.team;
      placingShipIndex = Number(button.dataset.shipIndex);
      renderFleets();
    });
  });
}

function renderFleets() {
  renderShipPlacementToolbar();

  // SECURITY/PRIVACY: the Fleets tab is for hidden ship placement only.
  // Never render bingo tile names, images, quantities, or board progress here.
  // The only information placed into these boards is the fleet square index,
  // ship placement marker, and hit/miss marker.
  ["ember", "ash"].forEach(team => {
    const board = document.getElementById(`${team}FleetBoard`);
    const list = document.getElementById(`${team}ShipList`);
    const captainLabel = document.getElementById(`${team}FleetCaptainLabel`);
    const placedTotal = document.getElementById(`${team}FleetPlacedTotal`);
    const card = board?.closest(".fleet-placement-card");
    const grid = board?.closest(".fleet-placement-grid");
    if (!board || !list) return;

    if (card) card.hidden = team !== placingTeam;
    if (grid) grid.classList.add("single-visible-fleet");

    const placedCount = bingoState.teams[team].ships.filter(ship => ship.cells.length === ship.size).length;
    const currentShip = placingTeam === team ? bingoState.teams[team].ships[placingShipIndex] : null;

    const fleetTitle = document.getElementById(`${team}FleetTitle`);
    if (fleetTitle) fleetTitle.textContent = bingoState.teams[team].name || TEAMS[team].name;
    if (captainLabel) captainLabel.textContent = bingoState.teams[team].captain || "Not set";
    if (placedTotal) placedTotal.textContent = `${placedCount}/${SHIPS.length} placed${bingoState.teams[team].fleetConfirmed ? " • confirmed" : ""}`;

    board.innerHTML = Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => {
      const ship = bingoState.teams[team].ships.find(s => s.cells.includes(index));
      const attacked = bingoState.attacks.find(a => a.defendingTeam === team && a.targetIndex === index);
      const classes = ["fleet-cell", "fleet-hidden-cell", "empty"];
      if (ship) classes.push("ship", `ship-${ship.key}`);
      if (attacked) classes.push(attacked.result);
      if (placingTeam === team && !bingoState.teams[team].fleetConfirmed) classes.push("placing");
      const titleParts = [`Hidden fleet square ${index + 1}`];
      if (ship) titleParts.push(ship.name);
      if (attacked) titleParts.push(attacked.result === "hit" ? "Hit" : "Miss");
      const attackMark = attacked ? `<span class="fleet-attack-mark">${attacked.result === "hit" ? "✹" : "•"}</span>` : "";
      const shipMark = ship ? `<span class="fleet-ship-mark">${escapeHtml(ship.name.charAt(0))}</span>` : "";
      return `
        <button type="button" class="${classes.join(" ")}" data-team="${team}" data-index="${index}" title="${escapeAttr(titleParts.join(" • "))}" aria-label="${escapeAttr(titleParts.join(" • "))}">
          ${shipMark}
          ${attackMark}
        </button>
      `;
    }).join("");

    board.querySelectorAll(".fleet-cell").forEach(cell => {
      const index = Number(cell.dataset.index);
      cell.addEventListener("click", () => handleFleetCellClick(team, index));
      cell.addEventListener("mouseenter", () => showShipPreview(team, index));
      cell.addEventListener("mouseleave", () => clearShipPreview(team));
    });

    // Ship placement status now lives in the top fleet cards and ship tabs.
    // Keep this container empty so the board area stays clean.
    list.innerHTML = "";
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
  if (!canEditFleetsWhileUnlocked() || placingTeam !== team || bingoState.teams[team].fleetConfirmed) return;
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
  if (!canEditFleetsWhileUnlocked() || placingTeam !== team) return;
  if (bingoState.teams[team].fleetConfirmed) {
    alert("This fleet layout is already confirmed. Remove confirmation by unlocking/resetting ship placement before editing.");
    return;
  }

  const ship = bingoState.teams[team].ships[placingShipIndex];
  if (!ship) return;

  const cells = getShipCells(startIndex, ship.size, placingOrientation);
  if (!isValidShipPlacement(team, ship, cells)) {
    alert("That ship does not fit there.");
    return;
  }

  ship.cells = cells;
  ship.sunk = false;
  bingoState.teams[team].fleetConfirmed = false;
  addLog(`${bingoState.teams[team].name} placed ${ship.name}.`);

  const nextIndex = getNextUnplacedShipIndexFrom(team, placingShipIndex);
  placingShipIndex = nextIndex;

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

function openProofTileSelector() {
  if (bingoState.phase !== "active") return alert("Proofs can be submitted after the game starts.");
  renderProofTileGrid();
  document.getElementById("proofTileModal")?.classList.add("show");
  document.getElementById("proofTileModal")?.setAttribute("aria-hidden", "false");
}

function closeProofTileSelector() {
  document.getElementById("proofTileModal")?.classList.remove("show");
  document.getElementById("proofTileModal")?.setAttribute("aria-hidden", "true");
}

function renderProofTileGrid() {
  const grid = document.getElementById("proofTileGrid");
  if (!grid) return;
  grid.innerHTML = bingoState.tiles.map((tile, index) => {
    const qty = getTileQuantity(tile);
    return `
      <button class="bingo-tile ${tile.name ? "filled" : "empty"} status-${escapeAttr(getTileStatus(tile))}" type="button" data-index="${index}" ${tile.name && getTileStatus(tile) !== "approved" ? "" : "disabled"}>
        ${qty > 1 ? `<span class="bingo-qty-badge">x${escapeHtml(qty)}</span>` : ""}
        ${getTileProgressMarkup(tile)}
        ${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
        <span>${tile.name ? escapeHtml(tile.name) : "Empty"}</span>
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".bingo-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const index = Number(tile.dataset.index);
      closeProofTileSelector();
      openTileModal(index);
    });
  });
}


function renderProofs() {
  const list = document.getElementById("proofList");
  if (!list) return;
  const proofs = [...bingoState.proofs].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!proofs.length) {
    list.innerHTML = `<p class="muted-text">No proofs submitted yet.</p>`;
    return;
  }
  list.innerHTML = proofs.map(proof => {
    const tile = bingoState.tiles[proof.tileIndex] || {};
    const isTestProof = isPluginTestProof(proof);
    const qty = Math.max(1, Number.parseInt(proof.quantity || 1, 10) || 1);
    const required = getTileQuantity(tile);
    const completed = Math.min(getTileCompletedQuantity(tile, proof.team), required);
    const source = proof.source || (proof.itemid ? "RuneLite plugin" : "Website");
    const proofUrl = String(proof.url || "");
    const imagePreview = /\.(png|jpe?g|gif|webp)(?:\?|$)/i.test(proofUrl) ? `<img class="proof-image-preview" src="${escapeAttr(proofUrl)}" alt="Proof preview" loading="lazy">` : "";
    return `
      <article class="proof-card status-${escapeAttr(proof.status)} ${isTestProof ? "is-test-proof" : ""}" id="proof-${escapeAttr(proof.id)}">
        <div>
          <strong>${escapeHtml(getProofTileName(proof))} ${qty > 1 ? `<small>x${qty}</small>` : ""}</strong>
          <div class="proof-meta-grid">
            <span><b>Player:</b> ${escapeHtml(proof.player || "Unknown")}</span>
            <span><b>Team:</b> ${escapeHtml(getTeamDisplayName(proof.team))}</span>
            <span><b>Submitted:</b> ${escapeHtml(formatDateTime(proof.createdAt))}</span>
            <span><b>Source:</b> ${escapeHtml(source)}</span>
            <span><b>Quantity:</b> ${qty}</span>
            <span><b>Progress:</b> ${completed}/${required}</span>
            <span><b>Proof ID:</b> ${escapeHtml(proof.id || "—")}</span>
            <span><b>Status:</b> ${escapeHtml(proof.status || "pending")}</span>
            ${proof.itemid ? `<span><b>Item ID:</b> ${escapeHtml(proof.itemid)}</span>` : ""}
            ${proof.reviewedBy ? `<span><b>Reviewed by:</b> ${escapeHtml(proof.reviewedBy)}</span>` : ""}
            ${proof.reviewedAt ? `<span><b>Reviewed:</b> ${escapeHtml(formatDateTime(proof.reviewedAt))}</span>` : ""}
          </div>
          ${proof.note ? `<p><b>Note:</b> ${escapeHtml(proof.note)}</p>` : ""}
          ${proofUrl ? `<a href="${escapeAttr(proofUrl)}" target="_blank" rel="noopener noreferrer">Open proof</a>${imagePreview}` : `<p class="muted-text">No proof URL was stored.</p>`}
        </div>
        <em>${escapeHtml(proof.status)}</em>
        ${isBingoStaff && proof.status === "pending" ? `<div class="proof-actions"><button type="button" data-proof-action="approve" data-proof-id="${escapeAttr(proof.id)}">Approve</button><button type="button" data-proof-action="reject" data-proof-id="${escapeAttr(proof.id)}">Reject</button></div>` : ""}
      </article>`;
  }).join("");
  list.querySelectorAll("[data-proof-action]").forEach(button => {
    button.addEventListener("click", () => reviewProof(button.dataset.proofId, button.dataset.proofAction));
  });
}

async function submitProof() {
  if (activeTileIndex === null) return;
  const team = getSelectedProofTeam();
  const player = document.getElementById("proofPlayerInput").value.trim();
  const url = document.getElementById("proofUrlInput").value.trim();
  const note = document.getElementById("proofNoteInput").value.trim();
  const tile = bingoState.tiles[activeTileIndex] || {};
  const remaining = Math.max(1, getTileRemainingQuantity(tile, team) || 1);
  const quantity = Math.max(1, Math.min(remaining, Number.parseInt(document.getElementById("proofQuantityInput")?.value || "1", 10) || 1));
  if (!player || !url) {
    alert("Add your player name and a proof link.");
    return;
  }
  const response = await fetch("/api/bingo/proofs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tileIndex: activeTileIndex, team, player, url, note, quantity })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || "Could not submit proof.");
    return;
  }
  closeTileEditor();
  await loadBingoState();
}


async function updateDiscordProofMessage(proofId, status) {
  try {
    await fetch("/api/bingo/proof-discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofId, action: status })
    });
  } catch (error) {
    console.warn("Could not update Discord proof notification", error);
  }
}

async function reviewProof(proofId, action) {
  if (!isBingoStaff || !["approve", "reject"].includes(action)) return;
  const proof = bingoState.proofs.find(item => item.id === proofId);
  if (!proof || proof.status !== "pending") return;
  if (!confirm(`${action === "approve" ? "Approve" : "Reject"} this proof for ${getProofTileName(proof)}?`)) return;
  const response = await fetch("/api/admin/bingo/proof-decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proofId, decision: action, stateRevision: bingoState.stateRevision })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || "Could not review the proof.");
    if (response.status === 409) await loadBingoState();
    return;
  }
  await loadBingoState();
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
  addLog(`${getTeamDisplayName(proof.team)} fired at ${getTeamDisplayName(defendingTeam)}: ${result === "hit" ? "💥 HIT" : "🌊 MISS"}.`);
  if (ship) {
    const allHit = ship.cells.every(cell => bingoState.attacks.some(a => a.defendingTeam === defendingTeam && a.targetIndex === cell && a.result === "hit"));
    if (allHit && !ship.sunk) {
      ship.sunk = true;
      addLog(`🚢 ${getTeamDisplayName(proof.team)} sunk ${getTeamDisplayName(defendingTeam)}'s ${ship.name}!`);
      if (bingoState.teams[defendingTeam].ships.every(s => s.sunk)) {
        bingoState.phase = "complete";
        addLog(`🏆 ${getTeamDisplayName(proof.team)} wins Battleship Bingo!`);
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
  Object.keys(TEAMS).forEach(team => {
    const teamState = bingoState.teams?.[team] || {};
    const captainInput = document.getElementById(`${team}CaptainInput`);
    const teamNameInput = document.getElementById(`${team}TeamNameInput`);
    const cardTitle = document.getElementById(`${team}CaptainCardTitle`);
    const currentName = (teamState.name || TEAMS[team].name).trim();

    if (captainInput && document.activeElement !== captainInput) captainInput.value = teamState.captain || "";
    if (teamNameInput && document.activeElement !== teamNameInput) teamNameInput.value = currentName;
    if (cardTitle) cardTitle.textContent = currentName;
  });
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
    else if (isShips) phaseBtn.textContent = allFleetsConfirmed() ? "Start Game" : "Confirm Fleets Before Start";
    else if (isActive) phaseBtn.textContent = "End Game";
    else if (isComplete) phaseBtn.textContent = "Reopen Game";
    else phaseBtn.textContent = "Start Game";
  }
}

function syncBingoTabForPhase() {
  if (bingoState.phase === "setup") {
    // Staff can inspect Captains/Fleets/Proofs/Log while the board is still unlocked.
    // Non-staff should stay on the board view during setup/reveal prep.
    if (!isBingoStaff) setBingoTab("board");
    else if (!activeBingoTab) setBingoTab("board");
    else setBingoTab(activeBingoTab);
    return;
  }
  if (bingoState.phase === "captains") setBingoTab("captains");
  if (bingoState.phase === "ships") setBingoTab("fleets");
  if (bingoState.phase === "active" || bingoState.phase === "complete") setBingoTab("board");
}

function openFleetsAsAdmin() {
  if (!isBingoStaff) return alert("Staff only.");
  setBingoTab("fleets");
  renderFleets();
}

function setBingoTab(tabName) {
  activeBingoTab = tabName;
  document.body.dataset.bingoTab = tabName;
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
      proofId: "",
      teamProgress: { ember: emptyTeamProgress(), ash: emptyTeamProgress() }
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
    bingoState.teams[team].fleetConfirmed = false;
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
  Object.keys(TEAMS).forEach(team => { bingoState.teams[team].fleetConfirmed = false; });
  placingTeam = "ember";
  placingShipIndex = getNextUnplacedShipIndex("ember");
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


async function endActiveGameFromMenu() {
  if (!isBingoStaff) return alert("Staff only.");
  if (!confirm("End the active Battleship Bingo game? Submissions will stop until the game is reopened.")) return;
  bingoState.phase = "complete";
  addLog("Battleship Bingo was ended by staff.");
  await saveBingoState();
}

async function returnToSetupModeFromMenu() {
  if (!isBingoStaff) return alert("Staff only.");
  if (!confirm("Return to setup mode? This unlocks the board for editing.")) return;
  bingoState.phase = "setup";
  bingoState.locked = false;
  placingTeam = null;
  addLog("Battleship Bingo was returned to setup mode by staff.");
  await saveBingoState();
  setBingoTab("board");
}

async function unlockFleetsFromMenu() {
  if (!isBingoStaff) return alert("Staff only.");
  if (!confirm("Return to fleet placement and unlock confirmed fleets?")) return;
  bingoState.phase = "ships";
  bingoState.locked = true;
  Object.keys(TEAMS).forEach(team => {
    bingoState.teams[team].fleetConfirmed = false;
  });
  placingTeam = "ember";
  placingShipIndex = getNextUnplacedShipIndex("ember");
  addLog("Fleet placement was unlocked by staff.");
  await saveBingoState();
  setBingoTab("fleets");
}

async function resetProgressFromMenu() {
  if (!isBingoStaff) return alert("Staff only.");
  if (!confirm("Reset all proofs, attacks, ship hits, and tile progress?")) return;
  bingoState.tiles = bingoState.tiles.map(tile => ({ ...tile, status: "open", completedBy: "", completedTeam: "", proofId: "", teamProgress: { ember: emptyTeamProgress(), ash: emptyTeamProgress() } }));
  bingoState.proofs = [];
  bingoState.attacks = [];
  Object.keys(TEAMS).forEach(team => {
    bingoState.teams[team].ships.forEach(ship => ship.sunk = false);
  });
  bingoState.phase = "ships";
  bingoState.locked = true;
  addLog("Progress was reset by staff.");
  await saveBingoState();
}

function bindBingoControls() {
  document.querySelectorAll("[data-bingo-tab]").forEach(button => {
    button.addEventListener("click", () => {
      setBingoTab(button.dataset.bingoTab);
    });
  });
  document.getElementById("bingoHelpBtn")?.addEventListener("click", openBingoHelpModal);
  document.getElementById("activeBingoHelpBtn")?.addEventListener("click", openBingoHelpModal);
  document.querySelectorAll("[data-active-sidebar-tab]").forEach(button => {
    button.addEventListener("click", () => {
      activeSidebarTab = button.dataset.activeSidebarTab;
      activeSidebarCollapsed = false;
      renderActiveGameSidebar();
    });
  });
  document.getElementById("activeSidebarCollapseBtn")?.addEventListener("click", () => {
    activeSidebarCollapsed = !activeSidebarCollapsed;
    renderActiveGameSidebar();
  });
  document.getElementById("activeEndGameBtn")?.addEventListener("click", endActiveGameFromMenu);
  document.getElementById("activeReturnSetupBtn")?.addEventListener("click", returnToSetupModeFromMenu);
  document.getElementById("activeUnlockFleetsBtn")?.addEventListener("click", unlockFleetsFromMenu);
  document.getElementById("activeResetProgressBtn")?.addEventListener("click", resetProgressFromMenu);
  document.getElementById("activeResetBoardBtn")?.addEventListener("click", () => document.getElementById("bingoClearBoardBtn")?.click());
  document.getElementById("activeViewSettingsBtn")?.addEventListener("click", openBingoHelpModal);
  document.getElementById("bingoViewFleetsBtn")?.addEventListener("click", openFleetsAsAdmin);
  document.getElementById("bingoPhaseActionBtn")?.addEventListener("click", handlePhaseAction);
  document.getElementById("attackBoardBtn")?.addEventListener("click", () => { activeBoardMode = "attack"; renderBingoBoard(); });
  document.getElementById("yourWatersBtn")?.addEventListener("click", () => { activeBoardMode = "waters"; renderBingoBoard(); });
  document.getElementById("openProofTileSelectorBtn")?.addEventListener("click", openProofTileSelector);
  document.getElementById("proofTeamSelect")?.addEventListener("change", event => {
    event.currentTarget.dataset.userChanged = "true";
    renderBingoBoard();
  });
  document.getElementById("closeProofTileModal")?.addEventListener("click", closeProofTileSelector);
  document.getElementById("proofTileModal")?.addEventListener("click", event => {
    if (event.target.id === "proofTileModal") closeProofTileSelector();
  });
  document.getElementById("closeBingoHelpModal")?.addEventListener("click", closeBingoHelpModal);
  document.getElementById("bingoHelpModal")?.addEventListener("click", event => {
    if (event.target.id === "bingoHelpModal") closeBingoHelpModal();
  });
  document.getElementById("bingoImportBtn")?.addEventListener("click", openBingoImportModal);
  document.getElementById("bingoRandomizeBoardBtn")?.addEventListener("click", randomizeBingoBoard);
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
      quantity,
      completedQuantity: 0,
      status: "open",
      completedBy: "",
      completedTeam: "",
      proofId: "",
      teamProgress: { ember: emptyTeamProgress(), ash: emptyTeamProgress() }
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
    bingoState.tiles = bingoState.tiles.map(tile => ({ ...tile, status: "open", completedQuantity: 0, completedBy: "", completedTeam: "", proofId: "", teamProgress: { ember: emptyTeamProgress(), ash: emptyTeamProgress() } }));
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

  document.querySelectorAll(".bingo-save-team-name-btn").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isBingoStaff) return alert("Staff only.");
      const team = button.dataset.team;
      const input = document.getElementById(`${team}TeamNameInput`);
      const newName = (input?.value || "").trim() || TEAMS[team].name;
      const oldName = bingoState.teams[team]?.name || TEAMS[team].name;

      const response = await fetch("/api/admin/bingo/team-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Name: team === "ember" ? newName : getTeamDisplayName("ember"),
          team2Name: team === "ash" ? newName : getTeamDisplayName("ash")
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return alert(data.error || "Could not save team name.");
      bingoState.teams[team].name = newName;
      if (newName !== oldName) addLog(`${oldName} renamed to ${newName}.`);
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
      if (!allFleetsPlaced()) {
        alert("Both fleets need all ships placed before starting the game.");
        return;
      }
      if (!allFleetsConfirmed()) {
        alert("Both fleets need to confirm their layouts before starting the game.");
        return;
      }
      bingoState.phase = "active";
      bingoState.locked = true;
      placingTeam = null;
      activeBoardMode = "attack";
      addLog("Battleship Bingo has started.");
      setBingoTab("board");
    } else if (bingoState.phase === "active") {
      bingoState.phase = "complete";
      addLog("Battleship Bingo was ended by staff.");
    } else {
      bingoState.phase = "active";
      addLog("Battleship Bingo was reopened by staff.");
    }
    await saveBingoState();
  });

  document.addEventListener("keydown", event => {
    if (event.key?.toLowerCase() !== "r") return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (!canEditFleetsWhileUnlocked()) return;
    event.preventDefault();
    toggleShipOrientation();
  });

  document.querySelectorAll(".bingo-place-btn").forEach(button => {
    button.addEventListener("click", () => {
      if (!isBingoStaff) return alert("Staff only.");
      if (!canEditFleetsWhileUnlocked()) return alert("Only staff can place ships before the board is locked.");
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
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}



async function loadTeamAccessInfo() {
  try {
    const response = await fetch("/api/bingo/team-access", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function showTeamAccessGate(info = null) {
  const gate = document.getElementById("bingoTeamAccess");
  const page = document.querySelector("main.bingo-page");
  if (gate) gate.style.display = "grid";
  if (page) page.style.display = "none";
  const teams = info?.teams || {
    team1: { name: "Team 1", passwordSet: false },
    team2: { name: "Team 2", passwordSet: false }
  };
  const requestedTeam = forcedAccessTeam || (new URLSearchParams(window.location.search).get("team") === "team2" ? "team2" : "team1");
  const hiddenTeam = document.getElementById("bingoTeamAccessTeam");
  if (hiddenTeam) hiddenTeam.value = requestedTeam;
  const choices = document.getElementById("bingoTeamAccessChoices");
  if (choices) {
    const keys = forcedAccessTeam ? [forcedAccessTeam] : ["team1", "team2"];
    choices.innerHTML = keys.map((key) => `
      <button type="button" class="bingo-team-choice ${key === requestedTeam ? "active" : ""}" data-access-team="${key}" ${forcedAccessTeam ? "disabled" : ""}>
        <strong>${key === "team1" ? "Team 1" : "Team 2"}</strong>
        <span>${escapeHtml(teams[key]?.name || key)}</span>
        ${teams[key]?.passwordSet ? "" : "<small>Password not set yet</small>"}
      </button>`).join("");
    if (!forcedAccessTeam) {
      choices.querySelectorAll("[data-access-team]").forEach(button => {
        button.addEventListener("click", () => {
          document.getElementById("bingoTeamAccessTeam").value = button.dataset.accessTeam;
          choices.querySelectorAll(".bingo-team-choice").forEach(item => item.classList.toggle("active", item === button));
          document.getElementById("bingoTeamPassword")?.focus();
        });
      });
    }
  }
}

function hideTeamAccessGate() {
  const gate = document.getElementById("bingoTeamAccess");
  const page = document.querySelector("main.bingo-page");
  if (gate) gate.style.display = "none";
  if (page) page.style.display = "block";
}

function bindTeamAccessControls() {
  document.getElementById("bingoTeamAccessForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.getElementById("bingoTeamAccessError");
    if (error) error.textContent = "";
    const response = await fetch("/api/bingo/team-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team: document.getElementById("bingoTeamAccessTeam")?.value,
        password: document.getElementById("bingoTeamPassword")?.value || ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (error) error.textContent = data.error || "Could not open that team board.";
      return;
    }
    bingoAccessInfo = await loadTeamAccessInfo();
    currentUserBingoTeam = data.team === "team2" ? "ash" : "ember";
    hideTeamAccessGate();
    await loadBingoState();
  });

  document.getElementById("bingoTeamPasswordsBtn")?.addEventListener("click", openTeamAccessAdmin);
  document.getElementById("closeTeamAccessAdminModal")?.addEventListener("click", closeTeamAccessAdmin);
  document.getElementById("saveTeamAccessAdminBtn")?.addEventListener("click", saveTeamAccessAdmin);
  document.getElementById("manualHitBtn")?.addEventListener("click", () => applyManualAttackResult("hit"));
  document.getElementById("manualMissBtn")?.addEventListener("click", () => applyManualAttackResult("miss"));
  document.getElementById("manualResetBtn")?.addEventListener("click", () => applyManualAttackResult("reset"));
}

async function openTeamAccessAdmin() {
  if (!isBingoStaff) return;
  const response = await fetch("/api/admin/bingo/team-access", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return alert(data.error || "Could not load team access settings.");
  document.getElementById("team1AccessName").value = data.team1?.name || getTeamDisplayName("ember");
  document.getElementById("team2AccessName").value = data.team2?.name || getTeamDisplayName("ash");
  document.getElementById("team1AccessPassword").value = "";
  document.getElementById("team2AccessPassword").value = "";
  document.getElementById("team1PasswordState").textContent = data.team1?.passwordSet ? "Password is set" : "Password has not been set";
  document.getElementById("team2PasswordState").textContent = data.team2?.passwordSet ? "Password is set" : "Password has not been set";
  document.getElementById("teamAccessAdminModal")?.classList.add("show");
}

function closeTeamAccessAdmin() {
  document.getElementById("teamAccessAdminModal")?.classList.remove("show");
}

async function saveTeamAccessAdmin() {
  const response = await fetch("/api/admin/bingo/team-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      team1Name: document.getElementById("team1AccessName")?.value,
      team2Name: document.getElementById("team2AccessName")?.value,
      team1Password: document.getElementById("team1AccessPassword")?.value,
      team2Password: document.getElementById("team2AccessPassword")?.value
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return alert(data.error || "Could not save team access settings.");
  closeTeamAccessAdmin();
  await loadBingoState();
  alert("Team names and passwords saved.");
}

function getAttackForTile(attackingTeam, tileIndex) {
  return (bingoState.attacks || []).find(attack => attack.attackingTeam === attackingTeam && Number(attack.targetIndex) === Number(tileIndex));
}

function renderAdminControlCenter() {
  const active = isBingoStaff && ["active", "complete"].includes(bingoState.phase);
  const summary = document.getElementById("adminGameSummary");
  const center = document.getElementById("adminBoardControlCenter");
  const legacy = document.getElementById("legacyBingoLayout");
  if (summary) summary.style.display = active ? "grid" : "none";
  if (center) center.style.display = active ? "block" : "none";
  if (legacy) {
    legacy.style.display = "grid";
    legacy.classList.toggle("admin-sidebar-only", active);
  }
  if (!active) return;
  const pending = bingoState.proofs.filter(proof => proof.status === "pending").length;
  const pendingCount = document.getElementById("pendingProofCount");
  const lastUpdate = document.getElementById("lastBoardUpdate");
  if (pendingCount) pendingCount.textContent = String(pending);
  if (lastUpdate) lastUpdate.textContent = formatDateTime(bingoState.updatedAt);
  const completedTileTotal = team => {
    const resolved = new Set();
    for (const attack of (bingoState.attacks || [])) {
      if (attack?.attackingTeam !== team) continue;
      if (attack?.result !== "hit" && attack?.result !== "miss") continue;
      const tileIndex = Number(attack.targetIndex);
      if (Number.isInteger(tileIndex) && tileIndex >= 0 && tileIndex < BINGO_SIZE * BINGO_SIZE) {
        resolved.add(tileIndex);
      }
    }
    return resolved.size;
  };
  const emberCompleted = document.getElementById("emberCompletedTiles");
  const ashCompleted = document.getElementById("ashCompletedTiles");
  const emberCompletedLabel = document.getElementById("emberCompletedLabel");
  const ashCompletedLabel = document.getElementById("ashCompletedLabel");
  if (emberCompleted) emberCompleted.textContent = String(completedTileTotal("ember"));
  if (ashCompleted) ashCompleted.textContent = String(completedTileTotal("ash"));
  if (emberCompletedLabel) emberCompletedLabel.textContent = `${getTeamDisplayName("ember")} — Tiles Completed`;
  if (ashCompletedLabel) ashCompletedLabel.textContent = `${getTeamDisplayName("ash")} — Tiles Completed`;
  const host = document.getElementById("adminFourBoards");
  if (!host) return;
  host.innerHTML = [
    renderAdminBoardCard("ember", "attack"),
    renderAdminBoardCard("ash", "attack"),
    renderAdminBoardCard("ember", "waters"),
    renderAdminBoardCard("ash", "waters")
  ].join("");
  host.querySelectorAll(".admin-board-tile[data-mode='attack']").forEach(button => {
    button.addEventListener("click", () => openAdminTileDialog(button.dataset.team, Number(button.dataset.index)));
  });
}

function renderAdminBoardCard(team, mode) {
  const opposing = getOpponent(team);
  const title = mode === "attack" ? `${getTeamDisplayName(team)} — Attack Board` : `${getTeamDisplayName(team)} — Your Waters`;
  const subtitle = mode === "attack" ? `Attacks ${getTeamDisplayName(opposing)}'s fleet` : `Defends against ${getTeamDisplayName(opposing)}`;
  const cells = bingoState.tiles.map((tile, index) => renderAdminBoardTile(team, mode, tile, index)).join("");
  return `<section class="admin-board-card"><header><h3>${escapeHtml(title)}</h3><span>${escapeHtml(subtitle)}</span></header><div class="admin-board-grid">${cells}</div></section>`;
}

function renderAdminBoardTile(team, mode, tile, index) {
  const attackingTeam = mode === "attack" ? team : getOpponent(team);
  const attack = getAttackForTile(attackingTeam, index);
  const result = attack?.result || "";
  const defendingShip = mode === "waters"
    ? (bingoState.teams?.[team]?.ships || []).find(ship => (ship.cells || []).includes(index))
    : null;
  const progress = mode === "attack" ? getTileCompletedQuantity(tile, team) : 0;
  const required = getTileQuantity(tile);
  const progressPercent = required > 0 ? Math.min(100, Math.round((progress / required) * 100)) : 0;
  const isPartial = mode === "attack" && progress > 0 && progress < required;
  const isComplete = mode === "attack" && progress >= required;
  const classes = [
    "admin-board-tile",
    "team-tile",
    tile?.name ? "" : "empty",
    result,
    defendingShip ? "ship" : "",
    defendingShip?.sunk ? "sunk" : "",
    isPartial ? "progress-partial" : "",
    isComplete ? "progress-complete" : ""
  ].filter(Boolean).join(" ");
  const quantityBadge = required > 1 ? `<small class="qty-badge">x${required}</small>` : "";
  const attackBadge = result ? `<b class="status-badge">${result.toUpperCase()}</b>` : "";
  const shipBadge = mode === "waters" && defendingShip
    ? `<b class="admin-ship-name${defendingShip.sunk ? " sunk" : ""}">${escapeHtml(defendingShip.name)}</b>`
    : "";
  const progressMarkup = mode === "attack" && required > 1 && progress > 0
    ? `<span class="team-progress-count">${progress}/${required}</span><span class="team-progress-line" aria-label="${progress} of ${required} complete"><i style="width:${progressPercent}%"></i></span>`
    : "";
  const description = mode === "attack"
    ? `${progress}/${required}${result ? ` • ${result.toUpperCase()}` : ""}`
    : `${defendingShip ? defendingShip.name : "Water"}${result ? ` • ${result.toUpperCase()}` : ""}`;
  return `<button type="button" class="${classes}" data-team="${team}" data-index="${index}" data-mode="${mode}" title="${escapeAttr(tile.name || `Tile ${index + 1}`)} — ${escapeAttr(description)}" ${mode === "waters" ? "disabled" : ""}>${quantityBadge}${attackBadge}${shipBadge}${tile.image ? `<img src="${escapeAttr(tile.image)}" alt="">` : ""}<span class="tile-name">${escapeHtml(tile.name || "Empty")}</span>${progressMarkup}</button>`;
}

let adminTileActionContext = null;
function openAdminTileDialog(attackingTeam, tileIndex) {
  if (!isBingoStaff || !["ember", "ash"].includes(attackingTeam) || !Number.isInteger(tileIndex)) return;
  const tile = bingoState.tiles[tileIndex];
  if (!tile) return;
  adminTileActionContext = { attackingTeam, tileIndex };
  const defendingTeam = getOpponent(attackingTeam);
  const attack = getAttackForTile(attackingTeam, tileIndex);
  document.getElementById("adminTileTeamLabel").textContent = `${getTeamDisplayName(attackingTeam)} Attack Board`;
  document.getElementById("adminTileActionTitle").textContent = tile.name || `Tile ${tileIndex + 1}`;
  document.getElementById("adminTileOrientationText").textContent = `${getTeamDisplayName(attackingTeam)} attacks ${getTeamDisplayName(defendingTeam)} on this tile.`;
  document.getElementById("adminTileProgressText").textContent = `${getTileCompletedQuantity(tile, attackingTeam)}/${getTileQuantity(tile)}`;
  document.getElementById("adminTileAttackText").textContent = attack?.result ? attack.result.toUpperCase() : "OPEN";
  const input = document.getElementById("adminTileProgressInput");
  input.value = String(getTileCompletedQuantity(tile, attackingTeam));
  input.max = String(getTileQuantity(tile));
  document.getElementById("adminTileActionError").textContent = "";
  document.getElementById("adminTileActionDialog")?.showModal();
}

async function runAdminTileAction(action) {
  if (!adminTileActionContext) return;
  const { attackingTeam, tileIndex } = adminTileActionContext;
  let quantity = null;
  if (action === "set-progress") {
    quantity = Number.parseInt(document.getElementById("adminTileProgressInput")?.value || "0", 10);
    const required = getTileQuantity(bingoState.tiles[tileIndex]);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > required) {
      document.getElementById("adminTileActionError").textContent = `Enter a quantity from 0 to ${required}.`;
      return;
    }
  }
  if (["reset", "reset-progress"].includes(action) && !confirm("Confirm this reset? This action is logged.")) return;
  await saveManualAttackResult(attackingTeam, tileIndex, action, quantity);
  document.getElementById("adminTileActionDialog")?.close();
  adminTileActionContext = null;
}

function applyTeamViewVisibility() {
  const page = document.querySelector("main.bingo-page");
  page?.classList.toggle("is-team-view", !isBingoStaff);
  if (isBingoStaff) {
    document.getElementById("emberFleetCard")?.style.removeProperty("display");
    document.getElementById("ashFleetCard")?.style.removeProperty("display");
    return;
  }
  const own = currentUserBingoTeam;
  document.getElementById("emberFleetCard")?.style.setProperty("display", own === "ember" ? "block" : "none");
  document.getElementById("ashFleetCard")?.style.setProperty("display", own === "ash" ? "block" : "none");
  if (["captains", "log"].includes(activeBingoTab)) activeBingoTab = "board";
}

let adminAttackContextMenu = null;

function ensureAdminAttackContextMenu() {
  if (adminAttackContextMenu) return adminAttackContextMenu;
  const menu = document.createElement("div");
  menu.id = "adminAttackContextMenu";
  menu.className = "admin-attack-context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <div class="admin-attack-context-title" id="adminAttackContextTitle">Tile</div>
    <div class="admin-attack-context-team">
      <strong id="adminAttackTeamOneName">Team 1 Attack</strong>
      <div class="admin-attack-context-actions">
        <button type="button" data-team="ember" data-result="hit">Hit</button>
        <button type="button" data-team="ember" data-result="miss">Miss</button>
        <button type="button" data-team="ember" data-result="reset">Reset Attack</button>
        <button type="button" data-team="ember" data-result="reset-progress">Reset Progress</button>
      </div>
    </div>
    <div class="admin-attack-context-team">
      <strong id="adminAttackTeamTwoName">Team 2 Attack</strong>
      <div class="admin-attack-context-actions">
        <button type="button" data-team="ash" data-result="hit">Hit</button>
        <button type="button" data-team="ash" data-result="miss">Miss</button>
        <button type="button" data-team="ash" data-result="reset">Reset Attack</button>
        <button type="button" data-team="ash" data-result="reset-progress">Reset Progress</button>
      </div>
    </div>`;
  menu.addEventListener("click", async event => {
    const button = event.target.closest("button[data-team][data-result]");
    if (!button) return;
    const tileIndex = Number(menu.dataset.tileIndex);
    hideAdminAttackContextMenu();
    await saveManualAttackResult(button.dataset.team, tileIndex, button.dataset.result);
  });
  document.body.appendChild(menu);
  adminAttackContextMenu = menu;
  return menu;
}

function bindAdminAttackContextMenu(tileElement) {
  if (!isBingoStaff || !tileElement) return;
  tileElement.addEventListener("contextmenu", event => {
    event.preventDefault();
    event.stopPropagation();
    showAdminAttackContextMenu(event.clientX, event.clientY, Number(tileElement.dataset.index));
  });
}

function showAdminAttackContextMenu(clientX, clientY, tileIndex) {
  if (!isBingoStaff || !Number.isInteger(tileIndex)) return;
  const menu = ensureAdminAttackContextMenu();
  const tile = bingoState.tiles?.[tileIndex] || {};
  menu.dataset.tileIndex = String(tileIndex);
  const title = document.getElementById("adminAttackContextTitle");
  if (title) title.textContent = `${tile.name || `Tile ${tileIndex + 1}`} — Admin Repair`;
  const oneName = document.getElementById("adminAttackTeamOneName");
  const twoName = document.getElementById("adminAttackTeamTwoName");
  if (oneName) oneName.textContent = `${getTeamDisplayName("ember")} Attack`;
  if (twoName) twoName.textContent = `${getTeamDisplayName("ash")} Attack`;
  menu.classList.add("show");
  const width = menu.offsetWidth || 300;
  const height = menu.offsetHeight || 220;
  const left = Math.max(8, Math.min(clientX, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(clientY, window.innerHeight - height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function hideAdminAttackContextMenu() {
  adminAttackContextMenu?.classList.remove("show");
}

async function saveManualAttackResult(attackingTeam, targetIndex, result, completedQuantity = null) {
  if (!isBingoStaff) return;
  const response = await fetch("/api/admin/bingo/manual-attack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attackingTeam, targetIndex, result, completedQuantity, stateRevision: bingoState.stateRevision })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || "Could not update the attack result.");
    return;
  }
  await loadBingoState();
}

async function applyManualAttackResult(result) {
  if (!isBingoStaff || activeTileIndex === null) return;
  const attackingTeam = document.getElementById("manualAttackTeamSelect")?.value === "ash" ? "ash" : "ember";
  await saveManualAttackResult(attackingTeam, activeTileIndex, result);
  closeTileEditor();
}

document.addEventListener("click", event => {
  if (!event.target.closest("#adminAttackContextMenu")) hideAdminAttackContextMenu();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") hideAdminAttackContextMenu();
});
window.addEventListener("blur", hideAdminAttackContextMenu);
window.addEventListener("scroll", hideAdminAttackContextMenu, true);

document.getElementById("pendingProofSummary")?.addEventListener("click", () => setBingoTab("proofs"));
document.getElementById("lastUpdateSummary")?.addEventListener("click", () => setBingoTab("log"));
document.getElementById("closeAdminTileActionDialog")?.addEventListener("click", () => document.getElementById("adminTileActionDialog")?.close());
document.querySelectorAll("[data-admin-tile-action]").forEach(button => button.addEventListener("click", () => runAdminTileAction(button.dataset.adminTileAction)));

(async function initBingo() {
  await checkBingoStaff();
  bindBingoControls();
  bindTeamAccessControls();
  bingoAccessInfo = await loadTeamAccessInfo();
  if (forcedAccessTeam) {
    if (bingoAccessInfo?.team !== forcedAccessTeam) {
      showTeamAccessGate(bingoAccessInfo);
      return;
    }
    currentUserBingoTeam = forcedAccessTeam === "team2" ? "ash" : "ember";
    hideTeamAccessGate();
    await loadBingoState();
    return;
  }
  if (isBingoStaff) {
    hideTeamAccessGate();
    await loadBingoState();
    return;
  }
  if (!bingoAccessInfo?.team) {
    showTeamAccessGate(bingoAccessInfo);
    return;
  }
  currentUserBingoTeam = bingoAccessInfo.team === "team2" ? "ash" : "ember";
  hideTeamAccessGate();
  await loadBingoState();
})();
