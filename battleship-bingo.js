const BINGO_SIZE = 10;
const STAFF_ROLE_IDS = ["1364734283356569620", "1365445491776815104"];
const DEFAULT_ITEMS = [
  { name: "Abyssal whip", image: "https://oldschool.runescape.wiki/images/Abyssal_whip.png" },
  { name: "Abyssal tentacle", image: "https://oldschool.runescape.wiki/images/Abyssal_tentacle.png" },
  { name: "Kraken tentacle", image: "https://oldschool.runescape.wiki/images/Kraken_tentacle.png" },
  { name: "Saradomin sword", image: "https://oldschool.runescape.wiki/images/Saradomin_sword.png" },
  { name: "Frozen abyssal whip", image: "https://oldschool.runescape.wiki/images/Frozen_abyssal_whip.png" }
];

let bingoBoard = [];
let bingoLocked = false;
let isBingoStaff = false;
let activeTileIndex = null;
let wikiSearchTimer = null;

function emptyBingoBoard() {
  return Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, index) => ({
    id: index,
    name: "",
    image: "",
    claimedBy: "",
    status: "open"
  }));
}

async function checkBingoStaff() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    const roles = data?.user?.roles || [];
    isBingoStaff = data.signedIn && roles.some(role => STAFF_ROLE_IDS.includes(role));
  } catch {
    isBingoStaff = false;
  }

  const actions = document.getElementById("bingoAdminActions");
  if (actions && isBingoStaff) actions.style.display = "flex";
}

async function loadBingoBoard() {
  try {
    const response = await fetch("/api/bingo/board");
    const data = await response.json();
    bingoBoard = Array.isArray(data.tiles) && data.tiles.length ? data.tiles : emptyBingoBoard();
    bingoLocked = Boolean(data.locked);
  } catch {
    bingoBoard = JSON.parse(localStorage.getItem("ironkin:bingo:tiles") || "null") || emptyBingoBoard();
    bingoLocked = localStorage.getItem("ironkin:bingo:locked") === "true";
  }

  renderBingoBoard();
}

async function saveBingoBoard() {
  const payload = { tiles: bingoBoard, locked: bingoLocked, updatedAt: new Date().toISOString() };

  try {
    const response = await fetch("/api/bingo/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Board save failed.");
  } catch {
    localStorage.setItem("ironkin:bingo:tiles", JSON.stringify(bingoBoard));
    localStorage.setItem("ironkin:bingo:locked", String(bingoLocked));
  }

  renderBingoBoard();
}

function renderBingoBoard() {
  const boardEl = document.getElementById("bingoBoard");
  const statusText = document.getElementById("bingoStatusText");
  const state = document.getElementById("bingoBoardState");

  if (!boardEl) return;

  if (statusText) {
    statusText.textContent = bingoLocked
      ? "Board is locked. Staff can unlock it if edits are needed."
      : isBingoStaff
        ? "Click a tile to edit it. Lock the board when setup is complete."
        : "Board setup is in progress.";
  }

  if (state) {
    state.textContent = bingoLocked ? "Locked" : "Draft";
    state.classList.toggle("locked", bingoLocked);
  }

  boardEl.innerHTML = bingoBoard.map((tile, index) => `
    <button class="bingo-tile ${tile.name ? "filled" : "empty"}" type="button" data-index="${index}" ${!isBingoStaff ? "disabled" : ""}>
      ${tile.image ? `<img src="${tile.image}" alt="${escapeHtml(tile.name)}" loading="lazy" />` : ""}
      <span>${tile.name ? escapeHtml(tile.name) : "Empty"}</span>
    </button>
  `).join("");

  boardEl.querySelectorAll(".bingo-tile").forEach(tile => {
    tile.addEventListener("click", () => openTileEditor(Number(tile.dataset.index)));
  });
}

function openTileEditor(index) {
  if (!isBingoStaff) return;
  activeTileIndex = index;
  const tile = bingoBoard[index] || {};
  document.getElementById("tileNameInput").value = tile.name || "";
  document.getElementById("tileImageInput").value = tile.image || "";
  document.getElementById("wikiSearchInput").value = tile.name || "";
  document.getElementById("wikiSearchResults").innerHTML = "";
  document.getElementById("tileModal").classList.add("show");
  document.getElementById("tileModal").setAttribute("aria-hidden", "false");
  document.getElementById("wikiSearchInput").focus();
}

function closeTileEditor() {
  document.getElementById("tileModal").classList.remove("show");
  document.getElementById("tileModal").setAttribute("aria-hidden", "true");
  activeTileIndex = null;
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
const results = Array.isArray(data) ? data : data.results || [];
    if (!results.length) {
      resultsEl.innerHTML = `<div class="wiki-loading">No results found.</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(item => `
      <div class="wiki-result">
        <img src="${item.image || "assets/favicon-32x32.png"}" alt="" />
        <span>${escapeHtml(item.title)}</span>
        <button type="button" data-name="${escapeAttr(item.title)}" data-image="${escapeAttr(item.image || "")}">Select</button>
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function bindBingoControls() {
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
    bingoBoard[activeTileIndex] = {
      ...bingoBoard[activeTileIndex],
      name: document.getElementById("tileNameInput").value.trim(),
      image: document.getElementById("tileImageInput").value.trim()
    };
    await saveBingoBoard();
    closeTileEditor();
  });

  document.getElementById("clearTileBtn")?.addEventListener("click", async () => {
    if (activeTileIndex === null) return;
    bingoBoard[activeTileIndex] = { ...bingoBoard[activeTileIndex], name: "", image: "" };
    await saveBingoBoard();
    closeTileEditor();
  });

  document.getElementById("bingoResetBtn")?.addEventListener("click", async () => {
    if (!confirm("Reset the whole Battleship Bingo board?")) return;
    bingoBoard = emptyBingoBoard();
    bingoLocked = false;
    await saveBingoBoard();
  });

  document.getElementById("bingoRerollBtn")?.addEventListener("click", async () => {
    bingoBoard = emptyBingoBoard().map((tile, index) => ({ ...tile, ...DEFAULT_ITEMS[index % DEFAULT_ITEMS.length] }));
    bingoLocked = false;
    await saveBingoBoard();
  });

  document.getElementById("bingoLockBtn")?.addEventListener("click", async event => {
    bingoLocked = !bingoLocked;
    event.currentTarget.textContent = bingoLocked ? "Unlock Board" : "Lock Board";
    await saveBingoBoard();
  });
}

(async function initBingo() {
  bindBingoControls();
  await checkBingoStaff();
  await loadBingoBoard();
  const lockBtn = document.getElementById("bingoLockBtn");
  if (lockBtn) lockBtn.textContent = bingoLocked ? "Unlock Board" : "Lock Board";
})();
