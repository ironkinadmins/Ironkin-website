let bsSummary = null;
let bsTimeline = null;
let bsFilter = "total";
let bsIsStaff = false;
let bsShowAllSlayers = false;
const bsExpanded = new Set();

const BS_SLAYER_PREVIEW = 10;

// Chart geometry in viewBox units; the SVG itself scales to the page width.
const BS_CHART = { w: 1000, h: 300, padL: 54, padR: 104, padT: 16, padB: 32 };

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

// The timeline is a separate, slower artefact: a failure there must never take
// the totals down with it.
async function bsLoadTimeline() {
  try {
    const response = await fetch("/api/bingo/boss-timeline");
    bsTimeline = response.ok ? await response.json() : null;
  } catch {
    bsTimeline = null;
  }
}

async function bsLoad() {
  const container = document.getElementById("bsContent");
  if (!container) return;

  try {
    const response = await fetch("/api/bingo/boss-tracker");
    if (!response.ok) throw new Error("Could not load stats.");
    bsSummary = await response.json();
  } catch {
    container.className = "bs-notice";
    container.textContent = "Could not load boss kill stats. Try again in a moment.";
    return;
  }

  await bsLoadTimeline();
  bsRender();
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

function bsNiceMax(value) {
  if (!(value > 0)) return 5;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function bsChartScales(points) {
  const first = new Date(points[0].at).getTime();
  const last = new Date(points[points.length - 1].at).getTime();
  const span = Math.max(1, last - first);
  const peak = points.reduce((best, point) => Math.max(best, point.team1, point.team2), 0);
  const max = bsNiceMax(peak);
  const { w, h, padL, padR, padT, padB } = BS_CHART;
  return {
    first,
    last,
    max,
    x: time => padL + ((time - first) / span) * (w - padL - padR),
    y: value => h - padB - (value / max) * (h - padT - padB)
  };
}

function bsLinePath(points, key, scales) {
  return points
    .map((point, index) => `${index ? "L" : "M"}${scales.x(new Date(point.at).getTime()).toFixed(1)} ${scales.y(point[key]).toFixed(1)}`)
    .join(" ");
}

// One label per UTC midnight, so the axis reads as days rather than a wall of
// timestamps.
function bsDayTicks(points, scales) {
  const seen = new Set();
  const ticks = [];
  for (const point of points) {
    const date = new Date(point.at);
    const key = date.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    ticks.push({
      x: scales.x(date.getTime()),
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    });
  }
  return ticks.length > 8 ? ticks.filter((_, index) => index % 2 === 0) : ticks;
}

function bsTimelineHtml(teamOneName, teamTwoName) {
  const timeline = bsTimeline;

  const rebuildBtn = bsIsStaff
    ? `<button type="button" class="bs-show-all" id="bsRebuildTimelineBtn">Rebuild timeline from Wise Old Man</button>`
    : "";

  if (!timeline || !timeline.ready || timeline.points.length < 2) {
    const message = timeline?.rebuilding
      ? "Building the timeline from Wise Old Man history..."
      : "The timeline has not been built yet. It reconstructs the whole event from Wise Old Man history, so nothing is lost.";
    return `
      <div class="bs-section-head"><h2>The Race</h2></div>
      <div class="bs-chart-empty">
        <p>${bsEscapeHtml(message)}</p>
        ${rebuildBtn}
      </div>`;
  }

  const points = timeline.points;
  const scales = bsChartScales(points);
  const { w, h, padL, padR, padT, padB } = BS_CHART;
  const last = points[points.length - 1];
  const leader = last.team1 === last.team2 ? null : (last.team1 > last.team2 ? "team1" : "team2");
  const gap = Math.abs(last.team1 - last.team2);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
    const value = scales.max * fraction;
    const y = scales.y(value);
    return `
      <line class="bs-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" />
      <text class="bs-axis-label" x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${Math.round(value).toLocaleString()}</text>`;
  }).join("");

  const dayLines = bsDayTicks(points, scales).map(tick => `
    <line class="bs-grid bs-grid-day" x1="${tick.x.toFixed(1)}" y1="${padT}" x2="${tick.x.toFixed(1)}" y2="${h - padB}" />
    <text class="bs-axis-label" x="${tick.x.toFixed(1)}" y="${h - padB + 20}" text-anchor="middle">${bsEscapeHtml(tick.label)}</text>`).join("");

  // Direct labels at the line ends: identity never rests on colour alone.
  // A close race puts both lines at nearly the same height, so keep each dot on
  // its true value and nudge only the text apart, then hold it inside the plot.
  const dotY = { team1: scales.y(last.team1), team2: scales.y(last.team2) };
  const labelY = { ...dotY };
  const minLabelGap = 28;
  if (Math.abs(labelY.team1 - labelY.team2) < minLabelGap) {
    const middle = (labelY.team1 + labelY.team2) / 2;
    const upper = labelY.team1 <= labelY.team2 ? "team1" : "team2";
    const lower = upper === "team1" ? "team2" : "team1";
    labelY[upper] = middle - minLabelGap / 2;
    labelY[lower] = middle + minLabelGap / 2;
  }

  // Shift the pair as a unit to stay inside the plot. Clamping each label on its
  // own would squash them back together whenever both sit against an edge -
  // exactly the 0-0 start of every event.
  const labelTop = padT + 12;
  const labelBottom = h - padB - 6;
  const highest = Math.min(labelY.team1, labelY.team2);
  const lowest = Math.max(labelY.team1, labelY.team2);
  const shift = highest < labelTop ? labelTop - highest
    : lowest > labelBottom ? labelBottom - lowest
      : 0;
  labelY.team1 += shift;
  labelY.team2 += shift;

  const endLabel = (key, name) => {
    const dot = dotY[key];
    const text = labelY[key];
    return `
      <circle class="bs-end-dot ${key}" cx="${(w - padR).toFixed(1)}" cy="${dot.toFixed(1)}" r="4" />
      <text class="bs-end-label" x="${(w - padR + 10).toFixed(1)}" y="${(text - 3).toFixed(1)}">${bsEscapeHtml(name)}</text>
      <text class="bs-end-value" x="${(w - padR + 10).toFixed(1)}" y="${(text + 12).toFixed(1)}">${Number(last[key]).toLocaleString()}</text>`;
  };

  // A daily table keeps the numbers available to screen readers and to anyone
  // who cannot separate the two lines by colour.
  const tableRows = points.filter((_, index) => index % 12 === 0 || index === points.length - 1)
    .map(point => `<tr><td>${bsEscapeHtml(bsFormatTimestamp(point.at))}</td><td>${point.team1.toLocaleString()}</td><td>${point.team2.toLocaleString()}</td></tr>`)
    .join("");

  return `
    <div class="bs-section-head">
      <h2>The Race</h2>
      <span class="bs-section-hint">cumulative kills &middot; every ${timeline.stepMinutes / 60}h</span>
    </div>
    <div class="bs-chart-wrap">
      <div class="bs-legend">
        <span class="bs-legend-item"><i class="team1"></i>${bsEscapeHtml(teamOneName)}</span>
        <span class="bs-legend-item"><i class="team2"></i>${bsEscapeHtml(teamTwoName)}</span>
        ${leader ? `<span class="bs-legend-lead">${bsEscapeHtml(leader === "team1" ? teamOneName : teamTwoName)} ahead by ${gap.toLocaleString()}</span>` : `<span class="bs-legend-lead">Dead level</span>`}
      </div>

      <div class="bs-chart" id="bsChart">
        <svg viewBox="0 0 ${w} ${h}" role="img"
             aria-label="Cumulative boss kills over the event for ${bsEscapeAttr(teamOneName)} and ${bsEscapeAttr(teamTwoName)}">
          ${gridLines}
          ${dayLines}
          <path class="bs-line team1" d="${bsLinePath(points, "team1", scales)}" />
          <path class="bs-line team2" d="${bsLinePath(points, "team2", scales)}" />
          ${endLabel("team1", teamOneName)}
          ${endLabel("team2", teamTwoName)}
          <line class="bs-crosshair" id="bsCrosshair" x1="0" y1="${padT}" x2="0" y2="${h - padB}" style="display:none" />
          <rect class="bs-chart-hit" id="bsChartHit" x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" />
        </svg>
        <div class="bs-tip" id="bsChartTip" hidden></div>
      </div>

      <details class="bs-chart-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Time</th><th>${bsEscapeHtml(teamOneName)}</th><th>${bsEscapeHtml(teamTwoName)}</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </details>
      ${rebuildBtn}
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

  // A player with a baseline but an error is the dangerous case: they still
  // count as tracked, so their kills sit frozen at the last good sweep while
  // the page looks perfectly healthy. Usually an in-game name change.
  const needsAttention = players.filter(player => !player.tracked || player.error);

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

  const untrackedBlock = needsAttention.length ? `
    <div class="bs-untracked">
      <strong>Needs attention (${needsAttention.length})</strong>
      <p>
        A <em>stalled</em> member's kills are frozen at their last successful update &mdash;
        usually an in-game name change. A <em>not tracked</em> member has never been counted.
        ${bsIsStaff ? "Fixing the name rebuilds their history from Wise Old Man, so nothing is lost." : "Ask staff to fix the RuneScape name."}
      </p>
      ${needsAttention.map(player => `
        <div class="bs-untracked-row">
          <span class="bs-untracked-name">${bsEscapeHtml(player.displayName)}${player.rsn ? ` <span class="bs-untracked-rsn">tried "${bsEscapeHtml(player.rsn)}"</span>` : ""}</span>
          <span class="bs-untracked-tag ${player.tracked ? "stalled" : ""}">${player.tracked ? "stalled" : "not tracked"}</span>
          <span class="bs-untracked-error">${bsEscapeHtml(player.error || "Waiting for first refresh...")}</span>
          ${bsIsStaff ? `<button class="btn secondary bs-set-rsn" type="button" data-bs-set-rsn="${bsEscapeAttr(player.discordId)}" data-bs-name="${bsEscapeAttr(player.displayName)}">Fix RSN</button>` : ""}
        </div>`).join("")}
    </div>` : "";

  const timelineSection = bsTimelineHtml(teamOneName, teamTwoName);

  container.innerHTML = `${summaryCard}${timelineSection}${slayerSection}${heatSection}${feedSection}${emptyNotice}${untrackedBlock}`;
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

  // Whether the fix kept their kills or restarted the count is the thing staff
  // actually need to know, so say it outright instead of leaving them to guess.
  if (data.repair?.restored) {
    alert(`Kills restored from Wise Old Man history (${data.repair.snapshots} snapshots since the event started). Nothing was lost.`);
  } else if (data.repair && !data.repair.restored) {
    alert(`RSN saved, but their kills restart from the next refresh.\n\n${data.repair.reason}`);
  }

  await bsLoadTimeline();
  bsRender();
}

function bsHideChartTip() {
  const tip = document.getElementById("bsChartTip");
  const crosshair = document.getElementById("bsCrosshair");
  if (tip) tip.hidden = true;
  if (crosshair) crosshair.style.display = "none";
}

// The viewBox scales uniformly to the page width, so a client x maps to a
// viewBox x by simple ratio.
function bsChartMove(event) {
  const hit = event.target.closest?.("#bsChartHit");
  if (!hit || !bsTimeline?.points?.length) {
    bsHideChartTip();
    return;
  }

  const svg = hit.ownerSVGElement;
  const tip = document.getElementById("bsChartTip");
  const crosshair = document.getElementById("bsCrosshair");
  if (!svg || !tip || !crosshair) return;

  const box = svg.getBoundingClientRect();
  const viewX = ((event.clientX - box.left) / box.width) * BS_CHART.w;

  const points = bsTimeline.points;
  const scales = bsChartScales(points);

  let nearest = 0;
  let nearestGap = Infinity;
  points.forEach((point, index) => {
    const gap = Math.abs(scales.x(new Date(point.at).getTime()) - viewX);
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = index;
    }
  });

  const point = points[nearest];
  const pointX = scales.x(new Date(point.at).getTime());
  crosshair.setAttribute("x1", pointX.toFixed(1));
  crosshair.setAttribute("x2", pointX.toFixed(1));
  crosshair.style.display = "";

  const teamOneName = bsSummary?.settings?.teamOneName || "Team 1";
  const teamTwoName = bsSummary?.settings?.teamTwoName || "Team 2";

  tip.innerHTML = `
    <strong>${bsEscapeHtml(bsFormatTimestamp(point.at))}</strong>
    <span><i class="team1"></i>${bsEscapeHtml(teamOneName)}<b>${point.team1.toLocaleString()}</b></span>
    <span><i class="team2"></i>${bsEscapeHtml(teamTwoName)}<b>${point.team2.toLocaleString()}</b></span>`;
  tip.hidden = false;

  // Keep the tooltip inside the chart instead of letting it run off the edge.
  const pixelX = (pointX / BS_CHART.w) * box.width;
  const half = tip.offsetWidth / 2;
  const clamped = Math.max(half, Math.min(box.width - half, pixelX));
  tip.style.left = `${clamped}px`;
}

// Wise Old Man rate-limits at roughly 20 requests a minute without an API key,
// and a batch is one request per player. The cron worker spaces its batches 65s
// apart for the same reason; firing them back to back just earns a wall of 429s.
const BS_REBUILD_BATCH_GAP_MS = 65 * 1000;

function bsWait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bsRebuildTimeline() {
  const button = document.getElementById("bsRebuildTimelineBtn");
  if (button) { button.disabled = true; button.textContent = "Rebuilding..."; }

  try {
    for (let batch = 0; batch < 12; batch += 1) {
      const response = await fetch("/api/bingo/boss-timeline?force=1", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Rebuild failed.");
      if (data.waiting || data.skipped || data.cycleComplete) break;

      if (button && data.totalPlayers) {
        const done = Math.min(data.cursor || data.totalPlayers, data.totalPlayers);
        button.textContent = `Rebuilding ${done}/${data.totalPlayers} - about ${Math.max(1, Math.round(((data.totalPlayers - done) / 9) * 65 / 60))} min left`;
      }
      await bsWait(BS_REBUILD_BATCH_GAP_MS);
    }
    await bsLoadTimeline();
    bsRender();
  } catch (error) {
    if (button) button.textContent = "Rebuild failed";
    console.warn("Timeline rebuild failed", error);
    setTimeout(() => bsRender(), 3000);
  }
}

function bsBindControls() {
  document.getElementById("bsRefreshBtn")?.addEventListener("click", bsRefreshBatch);

  const content = document.getElementById("bsContent");
  content?.addEventListener("mousemove", bsChartMove);
  content?.addEventListener("mouseleave", bsHideChartTip);

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

    if (event.target.closest("#bsRebuildTimelineBtn")) {
      bsRebuildTimeline();
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
