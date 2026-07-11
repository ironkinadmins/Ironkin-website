(() => {
  const accessTeam = document.body.dataset.accessTeam;
  const $ = id => document.getElementById(id);
  let state = null;
  let view = "attack";

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

  async function json(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function session() {
    const data = await json("/api/bingo/team-session");
    const info = data.teams?.[accessTeam];
    $("pageTeamName").textContent = info?.name || (accessTeam === "team1" ? "Team 1" : "Team 2");
    if (data.team === accessTeam) await loadBoard();
    else showLogin();
  }

  function showLogin(message = "") {
    $("loginPanel").classList.remove("hidden");
    $("boardPanel").classList.add("hidden");
    $("logoutTeamBtn").classList.add("hidden");
    $("loginError").textContent = message;
  }

  async function loadBoard() {
    try {
      state = await json("/api/bingo/team-board");
      $("loginPanel").classList.add("hidden");
      $("boardPanel").classList.remove("hidden");
      $("logoutTeamBtn").classList.remove("hidden");
      $("pageTeamName").textContent = state.ownTeam.name;
      $("ownName").textContent = state.ownTeam.name;
      $("opponentName").textContent = state.opponent.name;
      $("phaseName").textContent = state.phase;
      render();
    } catch (error) {
      showLogin(error.message);
    }
  }

  function teamProgress(tile) {
    return tile.teamProgress?.[state.viewerTeam] || {
      completedQuantity: 0,
      status: "open"
    };
  }

  function attackAt(index, direction) {
    return state.attacks.find(attack => direction === "out"
      ? attack.attackingTeam === state.viewerTeam && attack.targetIndex === index
      : attack.defendingTeam === state.viewerTeam && attack.targetIndex === index);
  }

  function buildTileViewModel(tile, index, isAttackView) {
    const progress = teamProgress(tile);
    const required = Math.max(1, Number(tile.quantity) || 1);
    const completed = Math.min(required, Math.max(0, Number(progress.completedQuantity) || 0));
    const isComplete = completed >= required;
    const isPartial = completed > 0 && !isComplete;
    const attack = attackAt(index, isAttackView ? "out" : "in") || null;
    const ship = isAttackView ? null : state.ownTeam.ships.find(item => item.cells.includes(index)) || null;
    const percent = Math.round((completed / required) * 100);
    const showProgress = isAttackView;
    const canSubmit = Boolean(isAttackView && tile.name && state.phase === "active" && !isComplete);

    return {
      tile,
      index,
      required,
      completed,
      percent,
      showProgress,
      isComplete,
      isPartial,
      attack,
      ship,
      canSubmit,
      title: tile.name
        ? `${tile.name}${showProgress && required > 1 ? ` — ${completed}/${required} complete` : showProgress && isComplete ? " — completed" : ""}`
        : "Empty"
    };
  }

  function renderTile(model) {
    const { tile, index, required, completed, percent, showProgress, isComplete, isPartial, attack, ship, canSubmit, title } = model;
    const classes = [
      "team-tile",
      tile.name ? "" : "empty",
      attack?.result || "",
      ship ? "ship" : "",
      showProgress && isPartial ? "progress-partial" : ""
    ].filter(Boolean).join(" ");

    const quantityBadge = required > 1 ? `<small class="qty-badge">x${required}</small>` : "";
    const attackBadge = attack
      ? `<b class="status-badge">${attack.result === "hit" ? "HIT" : "MISS"}</b>`
      : "";
    const image = tile.image ? `<img src="${esc(tile.image)}" alt="">` : "";
    const progressMarkup = showProgress && required > 1 && completed > 0
      ? `<span class="team-progress-count">${completed}/${required}</span><span class="team-progress-line" aria-label="${completed} of ${required} complete"><i style="width:${percent}%"></i></span>`
      : "";
    return `<button class="${classes}" data-index="${index}" type="button" ${canSubmit ? "" : "disabled"} title="${esc(title)}">${quantityBadge}${attackBadge}${image}<span class="tile-name">${esc(tile.name || "Empty")}</span>${progressMarkup}</button>`;
  }

  function render() {
    const isAttackView = view === "attack";
    $("attackViewBtn").classList.toggle("active", isAttackView);
    $("watersViewBtn").classList.toggle("active", !isAttackView);
    $("boardTitle").textContent = isAttackView
      ? `Attacking ${state.opponent.name}'s Waters`
      : `${state.ownTeam.name}'s Waters`;

    const board = $("teamBoard");
    board.dataset.view = isAttackView ? "attack" : "waters";
    board.classList.toggle("is-attack-view", isAttackView);
    board.classList.toggle("is-waters-view", !isAttackView);
    board.innerHTML = state.tiles
      .map((tile, index) => renderTile(buildTileViewModel(tile, index, isAttackView)))
      .join("");

    // Defensive cleanup: progress belongs only on the attacking team's board.
    if (!isAttackView) {
      board.querySelectorAll(".team-progress-count,.team-progress-line").forEach(element => element.remove());
    }

    if (isAttackView) {
      board.querySelectorAll("button:not([disabled])").forEach(button => {
        button.addEventListener("click", () => openProof(Number(button.dataset.index)));
      });
    }
  }

  function openProof(index) {
    const tile = state.tiles[index];
    $("proofTileIndex").value = String(index);
    $("proofTitle").textContent = `Submit Proof — ${tile.name}`;
    $("proofQuantity").max = String(Math.max(1, Number(tile.quantity) - Number(teamProgress(tile).completedQuantity || 0)));
    $("proofQuantity").value = "1";
    $("proofError").textContent = "";
    $("proofDialog").showModal();
  }

  $("teamLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("loginError").textContent = "";
    try {
      await json("/api/bingo/team-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: accessTeam, password: $("teamPassword").value })
      });
      $("teamPassword").value = "";
      await loadBoard();
    } catch (error) {
      $("loginError").textContent = error.message;
    }
  });

  $("logoutTeamBtn").addEventListener("click", async () => {
    await fetch("/api/bingo/team-session", { method: "DELETE" });
    showLogin();
  });

  $("attackViewBtn").addEventListener("click", () => {
    view = "attack";
    render();
  });

  $("watersViewBtn").addEventListener("click", () => {
    view = "waters";
    render();
  });

  $("cancelProofBtn").addEventListener("click", () => $("proofDialog").close());

  $("proofForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("proofError").textContent = "";
    try {
      await json("/api/bingo/team-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tileIndex: Number($("proofTileIndex").value),
          player: $("proofPlayer").value,
          url: $("proofUrl").value,
          quantity: Number($("proofQuantity").value),
          note: $("proofNote").value
        })
      });
      $("proofDialog").close();
      $("proofForm").reset();
      await loadBoard();
      alert("Proof submitted for staff review.");
    } catch (error) {
      $("proofError").textContent = error.message;
    }
  });

  session().catch(error => showLogin(error.message));
})();
