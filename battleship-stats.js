let bsSummary = null;
let bsFilter = "total";
let bsIsStaff = false;
let bsShowAllSlayers = false;
const bsExpanded = new Set();

const BS_SLAYER_PREVIEW = 10;

function bsEscapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function bsEscapeAttr(value) {
  return bsEscapeHtml(value).replace(/`/g, "&#096;");
}

function bsFormatGp(value) {
  const gp = Math.round(Number(value) || 0);
  if (gp >= 1e9) return (gp / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (gp >= 1e6) return (gp / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (gp >= 1e3) return Math.round(gp / 1e3) + "K";
  return String(gp);
}

function bsFormatTimestamp(value) {
  if (!value) return "never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "never";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Sequential single-hue ramp: dark roast (cold) -> bright ember (hot).
// The exponent < 1 makes the warm end fade slowly: mid-ranked items stay
// noticeably warm and only the bottom of the range drops to cold.
// Returns the cell background plus whether it is light enough for dark text.
function bsHeatColor(ratio) {
  const cold = [33, 24, 18];
  const hot = [236, 146, 69];
  const k = Math.pow(Math.max(0, Math.min(1, ratio)), 0.5);
  const channel = index => Math.round(cold[index] + (hot[index] - cold[index]) * k);
  return {
    background: `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`,
    hot: k > 0.45
  };
}

async function bsCheckStaff() {
  try {
    const response = await fetch("/api/bingo/signups");
    const data = await response.json();
    bsIsStaff = data?.isStaff === true;
  } catch {
    bsIsStaff = false;
  }
  const toolbar = document.getElementById("bsStaffToolbar");
  if (toolbar) toolbar.style.display = bsIsStaff ? "flex" : "none";
}

async function bsLoad() {
  const container = document.getElementById("bsContent");
  if (!container) return;

  try {
    const response = await fetch("/api/bingo/boss-tracker");
    if (!response.ok) throw new Error("Could not load stats.");
    bsSummary = await response.json();
    bsRender();
  } catch {
    container.className = "bs-notice";
    container.textContent = "Could not load boss kill stats. Try again in a moment.";
  }
}

function bsCellHtml(boss, teamOneName, teamTwoName, ratio) {
  const heat = bsHeatColor(ratio);
  const gpText = boss.gpEach ? ` - approx ${bsFormatGp(boss.count * boss.gpEach)} gp` : "";
  const tooltip = (bsFilter === "total"
    ? `${boss.name}: ${boss.count.toLocaleString()} (${teamOneName} ${Number(boss.team1 || 0).toLocaleString()} / ${teamTwoName} ${Number(boss.team2 || 0).toLocaleString()})`
    : `${boss.name}: ${boss.count.toLocaleString()} (${Number(boss.total || 0).toLocaleString()} total across both teams)`) + gpText;
  return `
    <div class="bs-cell ${heat.hot ? "hot" : "cold"}" style="background:${heat.background}" title="${bsEscapeAttr(tooltip)}">
      <span class="bs-cell-name">${bsEscapeHtml(boss.name)}</span>
      <span class="bs-cell-count">${Number(boss.count).toLocaleString()}</span>
    </div>`;
}

// An auto-matched RSN is a guess from the Discord nickname, so the kills behind
// it may belong to someone else entirely. Staff get the badge as a button that
// opens the same Set RSN prompt used for untracked members.
function bsAutoBadgeHtml(player) {
  if (!player.guessed) return "";
  const rsn = player.rsn || "?";
  if (!bsIsStaff) {
    return `<span class="bs-auto-badge" title="${bsEscapeAttr(`Auto-matched to "${rsn}" on Wise Old Man`)}">auto</span>`;
  }
  return `<button type="button" class="bs-auto-badge is-staff"
    data-bs-set-rsn="${bsEscapeAttr(player.discordId)}"
    data-bs-name="${bsEscapeAttr(player.displayName)}"
    title="${bsEscapeAttr(`Auto-matched to "${rsn}" - click to correct`)}">auto</button>`;
}

function bsSlayerRowHtml(player, index, teamOneName, teamTwoName, maxGained) {
  // Bar widths are relative to the leader on screen, so the ranking stays
  // readable whether the top slayer has 40 kills or 4,000.
  const width = maxGained ? Math.max(3, Math.round((player.gained / maxGained) * 100)) : 0;
  const teamKey = player.team === "team2" ? "team2" : "team1";
  const teamPill = bsFilter === "total"
    ? `<span class="bs-contrib-team ${teamKey}">${bsEscapeHtml(teamKey === "team2" ? teamTwoName : teamOneName)}</span>`
    : "";
  return `
    <div class="bs-slayer-row">
      <span class="bs-feed-rank">${String(index + 1).padStart(2, "0")}</span>
      <span class="bs-slayer-name"><span class="bs-slayer-label">${bsEscapeHtml(player.displayName)}</span>${bsAutoBadgeHtml(player)}</span>
      ${teamPill}
      <span class="bs-slayer-bar" aria-hidden="true"><span style="width:${width}%"></span></span>
      <span class="bs-contrib-kills">${Number(player.gained).toLocaleString()}</span>
    </div>`;
}

function bsRender() {
  const container = document.getElementById("bsContent");
  const summary = bsSummary;
  if (!container || !summary) return;
  container.className = "";

  if (!summary.tracking) {
    container.className = "bs-notice";
    container.textContent = "Boss kill tracking starts when the competition begins. Check back after the board reveal!";
    return;
  }

  const teamOneName = summary.settings?.teamOneName || "Team 1";
  const teamTwoName = summary.settings?.teamTwoName || "Team 2";
  const totals = summary.totals || { overall: 0, team1: 0, team2: 0 };

  const filterLabel = {
    total: "all teams",
    team1: teamOneName,
    team2: teamTwoName
  }[bsFilter];

  const filterTotal = bsFilter === "total" ? totals.overall : totals[bsFilter] || 0;

  const bosses = (Array.isArray(summary.bosses) ? summary.bosses : [])
    .map(boss => ({ ...boss, count: bsFilter === "total" ? boss.total : boss[bsFilter] || 0 }))
    .filter(boss => boss.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const maxCount = bosses.length ? bosses[0].count : 0;
  const heatBosses = bosses.slice(0, 15);

  // The heat scale spans only what is on screen: hottest = rank 1,
  // coldest = the last shown rank, so the top 15 always use the full ramp.
  const heatMax = heatBosses.length ? heatBosses[0].count : 0;
  const heatMin = heatBosses.length ? heatBosses[heatBosses.length - 1].count : 0;
  const heatRange = heatMax - heatMin;
  const heatRatio = boss => (heatRange > 0 ? (boss.count - heatMin) / heatRange : 1);

  const featured = heatBosses.length >= 3 ? heatBosses.slice(0, 3) : [];
  const rest = heatBosses.length >= 3 ? heatBosses.slice(3) : heatBosses;

  const players = Array.isArray(summary.players) ? summary.players : [];
  const untrackedPlayers = players.filter(player => !player.tracked);

  const summaryCard = `
    <div class="bs-summary">
      <div class="bs-total-row">
        <strong>${Number(filterTotal).toLocaleString()}</strong>
        <span>bosses slain by ${bsEscapeHtml(filterLabel)}</span>
      </div>
      <div class="bs-gp-row">&asymp; <strong>${bsFormatGp(bsFilter === "total" ? summary.gpTotals?.overall : summary.gpTotals?.[bsFilter])}</strong> gp made</div>
      <p class="bs-meta">
        Tracking since ${bsFormatTimestamp(summary.startedAt)} &middot;
        Updated ${bsFormatTimestamp(summary.lastUpdatedAt)}${summary.refreshing ? " &middot; refresh in progress" : ""} &middot;
        ${summary.trackedCount}/${players.length} tracked
      </p>
      <div class="bs-toggle" role="group" aria-label="Filter boss kills by team">
        <button type="button" data-bs-filter="total" class="${bsFilter === "total" ? "active" : ""}">All teams</button>
        <button type="button" data-bs-filter="team1" class="${bsFilter === "team1" ? "active" : ""}">${bsEscapeHtml(teamOneName)}</button>
        <button type="button" data-bs-filter="team2" class="${bsFilter === "team2" ? "active" : ""}">${bsEscapeHtml(teamTwoName)}</button>
      </div>
    </div>`;

  // summary.players is already sorted by kills descending server-side.
  const slayers = players.filter(player => player.tracked && player.gained > 0
    && (bsFilter === "total" || player.team === bsFilter));
  const maxGained = slayers.length ? slayers[0].gained : 0;
  const shownSlayers = bsShowAllSlayers ? slayers : slayers.slice(0, BS_SLAYER_PREVIEW);
  const autoCount = slayers.filter(player => player.guessed).length;

  const slayerSection = slayers.length ? `
    <div class="bs-section-head">
      <h2>Top Slayers</h2>
      <span class="bs-section-hint">${slayers.length} with kills${autoCount ? ` &middot; ${autoCount} auto-matched` : ""}</span>
    </div>
    <div class="bs-slayers">
      ${shownSlayers.map((player, index) => bsSlayerRowHtml(player, index, teamOneName, teamTwoName, maxGained)).join("")}
      ${slayers.length > BS_SLAYER_PREVIEW ? `
        <button type="button" class="bs-show-all" id="bsShowAllSlayers">
          ${bsShowAllSlayers ? "Show top " + BS_SLAYER_PREVIEW : `Show all ${slayers.length}`}
        </button>` : ""}
    </div>` : "";

  const heatSection = bosses.length ? `
    <div class="bs-section-head">
      <h2>Heat Map</h2>
      <span class="bs-section-hint">${bosses.length > 15 ? "top 15 &middot; " : ""}cold <span class="bs-legend-bar"></span> hot</span>
    </div>
    ${featured.length ? `<div class="bs-heat-featured">${featured.map(boss => bsCellHtml(boss, teamOneName, teamTwoName, heatRatio(boss))).join("")}</div>` : ""}
    ${rest.length ? `<div class="bs-heat-grid">${rest.map(boss => bsCellHtml(boss, teamOneName, teamTwoName, heatRatio(boss))).join("")}</div>` : ""}` : "";

  const feedSection = bosses.length ? `
    <div class="bs-section-head">
      <h2>Kill Feed</h2>
      <span class="bs-section-hint">rank &middot; boss &middot; gp &middot; kills &middot; click for top 5</span>
    </div>
    <div class="bs-feed">
      ${bosses.map((boss, index) => {
        const heat = bsHeatColor(maxCount ? boss.count / maxCount : 0);
        const expanded = bsExpanded.has(boss.metric);
        const contributors = (boss.contributors || [])
          .filter(entry => bsFilter === "total" || entry.team === bsFilter)
          .slice(0, 5);
        const detail = expanded && contributors.length ? `
          <div class="bs-feed-detail">
            ${contributors.map((entry, place) => `
              <div class="bs-contrib-row">
                <span class="bs-feed-rank">${place + 1}</span>
                <span class="bs-contrib-name">${bsEscapeHtml(entry.name)}</span>
                ${bsFilter === "total" ? `<span class="bs-contrib-team ${entry.team}">${bsEscapeHtml(entry.team === "team2" ? teamTwoName : teamOneName)}</span>` : ""}
                <span class="bs-feed-gp">${boss.gpEach ? "&asymp; " + bsFormatGp(entry.kills * boss.gpEach) : ""}</span>
                <span class="bs-contrib-kills">${Number(entry.kills).toLocaleString()}</span>
              </div>`).join("")}
          </div>` : "";
        return `
          <div class="bs-feed-item${expanded ? " expanded" : ""}">
            <div class="bs-feed-row" data-bs-boss="${bsEscapeAttr(boss.metric)}" role="button" aria-expanded="${expanded}">
              <span class="bs-feed-rank">${String(index + 1).padStart(2, "0")}</span>
              <span class="bs-feed-name">${bsEscapeHtml(boss.name)}</span>
              <span class="bs-feed-gp">${boss.gpEach ? "&asymp; " + bsFormatGp(boss.count * boss.gpEach) : ""}</span>
              <span class="bs-feed-pill ${heat.hot ? "hot" : "cold"}" style="background:${heat.background};color:${heat.hot ? "#1f130b" : "var(--text)"}">${Number(boss.count).toLocaleString()}</span>
              <span class="bs-feed-chevron">${expanded ? "&#9662;" : "&#9656;"}</span>
            </div>
            ${detail}
          </div>`;
      }).join("")}
    </div>` : "";

  const emptyNotice = bosses.length ? "" : `<p class="bs-notice">No boss kills recorded for ${bsEscapeHtml(filterLabel)} yet. Get out there!</p>`;

  const untrackedBlock = untrackedPlayers.length ? `
    <div class="bs-untracked">
      <strong>Not tracked yet (${untrackedPlayers.length})</strong>
      <p>These members could not be matched to a RuneScape name on Wise Old Man, so their kills are not counted yet.</p>
      ${untrackedPlayers.map(player => `
        <div class="bs-untracked-row">
          <span class="bs-untracked-name">${bsEscapeHtml(player.displayName)}</span>
          <span class="bs-untracked-error">${bsEscapeHtml(player.error || "Waiting for first refresh...")}</span>
          ${bsIsStaff ? `<button class="btn secondary bs-set-rsn" type="button" data-bs-set-rsn="${bsEscapeAttr(player.discordId)}" data-bs-name="${bsEscapeAttr(player.displayName)}">Set RSN</button>` : ""}
        </div>`).join("")}
    </div>` : "";

  container.innerHTML = `${summaryCard}${slayerSection}${heatSection}${feedSection}${emptyNotice}${untrackedBlock}`;
}

async function bsRefreshBatch() {
  const button = document.getElementById("bsRefreshBtn");
  if (button) { button.disabled = true; button.textContent = "Refreshing..."; }

  try {
    const response = await fetch("/api/bingo/boss-tracker?force=1", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Refresh failed.");
    if (button) {
      button.textContent = data.cycleComplete
        ? "Refreshed!"
        : `Batch done (${data.cursor}/${data.totalPlayers})`;
    }
    await bsLoad();
  } catch (error) {
    if (button) button.textContent = "Refresh failed";
    console.warn("Boss tracker refresh failed", error);
  } finally {
    if (button) {
      button.disabled = false;
      setTimeout(() => { button.textContent = "Refresh Next Batch"; }, 4000);
    }
  }
}

async function bsAdminAction(payload) {
  const response = await fetch("/api/admin/bingo/boss-tracker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data?.error || "That action failed.");
    return;
  }
  bsSummary = data.summary;
  bsRender();
}

function bsBindControls() {
  document.getElementById("bsRefreshBtn")?.addEventListener("click", bsRefreshBatch);

  document.getElementById("bsResetBtn")?.addEventListener("click", () => {
    if (!confirm("Reset the boss kill baseline? All progress counts restart from the next refresh.")) return;
    bsAdminAction({ action: "reset" });
  });

  document.getElementById("bsContent")?.addEventListener("click", event => {
    const filterButton = event.target.closest("[data-bs-filter]");
    if (filterButton) {
      bsFilter = filterButton.dataset.bsFilter;
      bsRender();
      return;
    }

    if (event.target.closest("#bsShowAllSlayers")) {
      bsShowAllSlayers = !bsShowAllSlayers;
      bsRender();
      return;
    }

    const bossRow = event.target.closest("[data-bs-boss]");
    if (bossRow) {
      const metric = bossRow.dataset.bsBoss;
      if (bsExpanded.has(metric)) bsExpanded.delete(metric);
      else bsExpanded.add(metric);
      bsRender();
      return;
    }

    const rsnButton = event.target.closest("[data-bs-set-rsn]");
    if (rsnButton) {
      const rsn = prompt(`Enter the RuneScape name for ${rsnButton.dataset.bsName}:`);
      if (!rsn || !rsn.trim()) return;
      bsAdminAction({ action: "set-rsn", discordId: rsnButton.dataset.bsSetRsn, rsn: rsn.trim() });
    }
  });
}

(async function initBattleshipStats() {
  bsBindControls();
  await bsCheckStaff();
  await bsLoad();
})();
