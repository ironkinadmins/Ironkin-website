(() => {
  const accessTeam = document.body.dataset.accessTeam;
  const $ = id => document.getElementById(id);
  let state = null;
  let view = "attack";
  let isStaff = false;

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
    const data = await json(`/api/bingo/team-session?team=${encodeURIComponent(accessTeam)}`);
    const info = data.teams?.[accessTeam];
    $("pageTeamName").textContent = info?.name || (accessTeam === "team1" ? "Team 1" : "Team 2");
    if (data.authorizedTeam !== accessTeam) {
      showLogin("You are not assigned to this Bingo team.");
      $("teamPassword").disabled = true;
      $("teamLoginForm").querySelector('button[type="submit"]').disabled = true;
      return;
    }
    isStaff = Boolean(data.isStaff);
    $("staffAdminBoardBtn")?.classList.toggle("hidden", !isStaff);
    const watersButton = $("watersViewBtn");
    watersButton.classList.remove("hidden");
    watersButton.disabled = false;

    $("proofPlayer").value = data.displayName || "";
    $("proofPlayer").readOnly = true;
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
      isStaff = Boolean(state.isStaff);
      $("staffAdminBoardBtn")?.classList.toggle("hidden", !isStaff);
      const watersButton = $("watersViewBtn");
      watersButton.classList.remove("hidden");
      watersButton.disabled = false;
      $("loginPanel").classList.add("hidden");
      $("boardPanel").classList.remove("hidden");
      $("logoutTeamBtn").classList.remove("hidden");
      $("pageTeamName").textContent = state.ownTeam.name;
      $("ownName").textContent = state.ownTeam.name;
      $("opponentName").textContent = state.opponent.name;
      $("phaseName").textContent = state.phase;
      renderFleetSummary();
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

  function fleetFor(teamKey) {
    return state?.fleetSummary?.[teamKey] || { captain: "", hitsTaken: 0, ships: [] };
  }

  function renderFleetSummaryCard(teamKey, teamName, icon) {
    const fleet = fleetFor(teamKey);
    const ships = Array.isArray(fleet.ships) ? fleet.ships : [];
    const sunk = ships.filter(ship => ship.sunk).length;
    const afloat = Math.max(0, ships.length - sunk);
    const hitsTaken = Math.max(0, Number(fleet.hitsTaken) || 0);
    const completedTiles = Math.max(0, Number(state?.completedTiles?.[teamKey]) || 0);
    const captain = fleet.captain || "Not assigned";
    const shipTags = ships.length
      ? ships.map(ship => `<span class="fleet-ship-tag${ship.sunk ? " sunk" : ""}">${esc(ship.name || "Ship")} <b>(${Math.max(0, Number(ship.size) || 0)})</b></span>`).join("")
      : `<span class="fleet-empty">Fleet not placed yet.</span>`;
    return `<article class="team-fleet-card" data-team="${esc(teamKey)}"><div class="fleet-card-top"><span class="fleet-team-icon" aria-hidden="true">${icon}</span><div class="fleet-team-copy"><h3>${esc(teamName)}</h3><p>Captain: ${esc(captain)}</p></div><strong>${sunk}/${ships.length || 6} sunk</strong></div><div class="fleet-card-stats"><span>🛡 ${afloat} afloat</span><span>🔥 ${sunk} lost</span><span>💥 ${hitsTaken} hits taken</span><span>✅ ${completedTiles} tiles completed</span></div><div class="fleet-ship-tags">${shipTags}</div></article>`;
  }

  function renderFleetSummary() {
    const host = $("fleetSummary");
    if (!host || !state) return;
    try {
      const ownKey = state.ownTeam?.key || state.viewerTeam;
      const opponentKey = state.opponent?.key || (ownKey === "ember" ? "ash" : "ember");
      host.innerHTML = [
        renderFleetSummaryCard(ownKey, state.ownTeam?.name || "Your Team", "⚓"),
        renderFleetSummaryCard(opponentKey, state.opponent?.name || "Opponent", "⚔")
      ].join("");
    } catch (error) {
      console.error("Fleet summary render failed", error);
      host.innerHTML = `<p class="fleet-summary-error">Fleet status could not be displayed. Refresh the page to retry.</p>`;
    }
  }

  function buildTileViewModel(tile, index, isAttackView) {
    const progress = teamProgress(tile);
    const required = Math.max(1, Number(tile.quantity) || 1);
    const completed = Math.min(required, Math.max(0, Number(progress.completedQuantity) || 0));
    const isComplete = completed >= required;
    const isPartial = completed > 0 && !isComplete;
    const attack = attackAt(index, isAttackView ? "out" : "in") || null;
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
      canSubmit,
      title: tile.name
        ? `${tile.name}${showProgress && required > 1 ? ` — ${completed}/${required} complete` : showProgress && isComplete ? " — completed" : ""}`
        : "Empty"
    };
  }

  function renderTile(model) {
    const { tile, index, required, completed, percent, showProgress, isComplete, isPartial, attack, canSubmit, title } = model;
    const classes = [
      "team-tile",
      tile.name ? "" : "empty",
      attack?.result || "",
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
