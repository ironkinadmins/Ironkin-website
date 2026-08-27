let selectedEventId = null;
let allEvents = [];

async function fetchEvents() {
  const response = await fetch("/api/admin/events/list", { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load events.");
  }

  return data.events || [];
}

function getSelectedEvent() {
  return allEvents.find(event => event.id === selectedEventId);
}

function getBotwTierLabel(event) {
  if (event?.botwTier === "elite" || event?.id === "botw-elite") return "Elite";
  if (event?.botwTier === "standard" || event?.id === "botw-standard") return "Standard";
  return "";
}

function getResetEventTitle(event) {
  if (event?.type === "sotw") return "Skill of the Week";
  if (event?.type === "botw") {
    const tier = getBotwTierLabel(event);
    return tier ? `Boss of the Week - ${tier}` : "Boss of the Week";
  }
  if (String(event?.type || "").includes("clan-goal")) return "Clan Goal";
  if (event?.type === "bounties") return "Clan Bounties";
  if (event?.type === "pvm-entry" || event?.id === "pvm-entry") return "PvM Entry";
  return event?.label || event?.title || "Event";
}

function resetEventAfterArchive(event) {
  event.title = getResetEventTitle(event);
  event.description = "";
  event.womCompetitionId = null;
  event.eventPassword = null;
  event.target = null;
  event.startDate = null;
  event.endDate = null;
  event.active = false;
  event.featured = false;
  event.pluginEventId = null;
}

function getAdminEventOptionText(event) {
  const title = event.title || getResetEventTitle(event);
  const tier = event?.type === "botw" ? getBotwTierLabel(event) : "";
  const label = tier ? `BOTW ${tier}` : (event.label || event.type);
  return `${label} - ${title}${event.active ? " (Active)" : ""}`;
}

function getPluginTrackingLabel(event) {
  if (event?.type === "botw") {
    const tier = getBotwTierLabel(event);
    return tier ? `BOTW ${tier}` : "BOTW";
  }
  if (event?.type === "sotw") return "SOTW";
  if (isClanGoalEvent(event)) return "Clan Goal";
  if (isBountiesEvent(event)) return "Bounties";
  if (isPvmEntryEvent(event)) return "PvM Entry";
  return event?.label || event?.title || event?.type || "Event";
}

function updatePluginEventIdDisplay() {
  const event = getSelectedEvent();
  const input = document.getElementById("pluginEventIdInput");
  const help = document.getElementById("pluginEventIdHelp");
  if (!input || !event) return;

  input.value = event.pluginEventId || "";
  if (help) {
    help.textContent = event.pluginEventId
      ? "This ID is sent to RuneLite automatically through /events/item-list. It is shown here only for troubleshooting and Supabase lookups."
      : event.active
        ? "Save the event to create its Plugin Event ID."
        : "The Plugin Event ID is created automatically when this event is activated and saved.";
  }
}


let backfillRows = [];
let backfillTrackedItems = [];

function normalizeBackfillLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

function parseBackfillCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(header => header.trim());
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
    return row;
  });
}

function getBackfillSupportedEvents() {
  return allEvents.filter(event =>
    event && event.pluginEventId && (event.type === "sotw" || event.type === "botw" || isClanGoalEvent(event) || isBountiesEvent(event) || isPvmEntryEvent(event) || isPvmEntryEvent(event))
  );
}


function populateUnlinkedEventSelect() {
  const select = document.getElementById("unlinkedEventSelect");
  if (!select) return;
  const events = getBackfillSupportedEvents();
  select.innerHTML = events.length
    ? events.map(event => `<option value="${escapeHtml(event.id)}">${escapeHtml(getPluginTrackingLabel(event))} - ${escapeHtml(event.title || getResetEventTitle(event))}</option>`).join("")
    : `<option value="">No Plugin Event IDs available</option>`;
  const bounty = events.find(event => isBountiesEvent(event) && event.active) || events.find(event => isBountiesEvent(event));
  if (bounty) select.value = bounty.id;
}

async function searchUnlinkedOsrsItems(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  try {
    const response = await fetch(`/api/osrs/item-id-search?q=${encodeURIComponent(q)}&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    return Array.isArray(data) ? data.filter(item => Number(item?.id) > 0).slice(0, 12) : [];
  } catch {
    return [];
  }
}

async function loadUnlinkedTrackedItems() {
  const eventId = document.getElementById("unlinkedEventSelect")?.value || "";
  const mount = document.getElementById("unlinkedTrackedItemsList");
  const status = document.getElementById("unlinkedTrackedItemsStatus");
  if (!mount) return;
  if (status) status.textContent = "";
  if (!eventId) {
    mount.innerHTML = `<p class="admin-muted">Choose an event.</p>`;
    return;
  }

  mount.innerHTML = `<p class="admin-muted">Checking tracked items…</p>`;
  try {
    const response = await fetch(`/api/drops/list?eventId=${encodeURIComponent(eventId)}&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    const drops = Array.isArray(data.drops) ? data.drops : [];
    const unlinked = drops.filter(drop => !Number(drop?.itemId));

    if (!unlinked.length) {
      mount.innerHTML = `<div class="admin-success">All tracked items for this event are linked to OSRS item IDs.</div>`;
      return;
    }

    mount.innerHTML = unlinked.map((drop, index) => `
      <div class="admin-card unlinked-item-linker" style="margin:0 0 12px;padding:14px" data-unlinked-row="${index}">
        <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
          <div>
            <strong>${escapeHtml(drop.name || "Unknown item")}</strong>
            <div class="admin-muted">Currently saved by name only</div>
          </div>
          <div style="min-width:min(100%,440px);flex:1">
            <input type="text" data-unlinked-search="${index}" value="${escapeHtml(drop.name || "")}" placeholder="Type the real OSRS item name…" autocomplete="off" />
            <select data-unlinked-results="${index}" style="margin-top:8px;width:100%">
              <option value="">Type above to search OSRS items…</option>
            </select>
            <div class="admin-muted" data-unlinked-choice="${index}" style="margin-top:6px">No OSRS item selected.</div>
            <button type="button" class="btn secondary" data-unlinked-save="${index}" style="margin-top:8px" disabled>Save Link</button>
          </div>
        </div>
      </div>`).join("");

    unlinked.forEach((drop, index) => {
      const search = mount.querySelector(`[data-unlinked-search="${index}"]`);
      const select = mount.querySelector(`[data-unlinked-results="${index}"]`);
      const choice = mount.querySelector(`[data-unlinked-choice="${index}"]`);
      const save = mount.querySelector(`[data-unlinked-save="${index}"]`);
      let results = [];
      let timer = null;

      const runSearch = async () => {
        if (choice) choice.textContent = "Searching OSRS items…";
        results = await searchUnlinkedOsrsItems(search?.value || "");
        if (!select) return;
        select.innerHTML = `<option value="">${results.length ? "Select item…" : "No matches - try a different search"}</option>` + results.map(item =>
          `<option value="${Number(item.id)}">${escapeHtml(item.name)} (ID ${Number(item.id)})</option>`
        ).join("");
        const normalized = normalizeBackfillLabel(drop.name);
        const exact = results.find(item => normalizeBackfillLabel(item.name) === normalized);
        if (exact) {
          select.value = String(exact.id);
          if (choice) choice.textContent = `Selected: ${exact.name} (ID ${exact.id})`;
          if (save) save.disabled = false;
        } else if (choice) {
          choice.textContent = results.length ? `${results.length} match${results.length === 1 ? "" : "es"} found. Choose one below.` : "No OSRS item matches. Change the search text to the actual item name.";
        }
      };

      search?.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(runSearch, 250);
      });

      select?.addEventListener("change", () => {
        const selected = results.find(item => Number(item.id) === Number(select.value));
        if (choice) choice.textContent = selected ? `Selected: ${selected.name} (ID ${selected.id})` : "No OSRS item selected.";
        if (save) save.disabled = !selected;
      });

      save?.addEventListener("click", async () => {
        const selected = results.find(item => Number(item.id) === Number(select?.value));
        if (!selected) return;
        save.disabled = true;
        save.textContent = "Saving…";
        try {
          const saveResponse = await fetch("/api/drops/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId,
              name: drop.name,
              itemId: Number(selected.id),
              image: drop?.image || selected.image || "",
              wikiUrl: drop?.wikiUrl || selected.url || "",
              rewardEmbers: Number(drop?.rewardEmbers || 0),
              trackingRule: drop?.trackingRule || "repeatable"
            })
          });
          const saveData = await saveResponse.json().catch(() => ({}));
          if (!saveResponse.ok) throw new Error(saveData.error || "Could not save item link.");
          if (status) status.textContent = `${drop.name} linked to ${selected.name} (ID ${selected.id}).`;
          await loadUnlinkedTrackedItems();
          await loadBackfillTrackedItems();
          renderBackfillPreview();
        } catch (error) {
          if (status) status.textContent = error.message || "Could not save item link.";
          save.disabled = false;
          save.textContent = "Save Link";
        }
      });

      runSearch();
    });
  } catch (error) {
    mount.innerHTML = `<p class="admin-error">${escapeHtml(error.message || "Could not load tracked items.")}</p>`;
  }
}

function populateBackfillEventSelect() {
  const select = document.getElementById("backfillEventSelect");
  if (!select) return;
  const events = getBackfillSupportedEvents();
  select.innerHTML = events.length
    ? events.map(event => `<option value="${escapeHtml(event.id)}">${escapeHtml(getPluginTrackingLabel(event))} - ${escapeHtml(event.title || getResetEventTitle(event))}</option>`).join("")
    : `<option value="">No Plugin Event IDs available</option>`;
  const bounty = events.find(event => isBountiesEvent(event) && event.active) || events.find(event => isBountiesEvent(event));
  if (bounty) select.value = bounty.id;
}

async function resolveLegacyBackfillTrackedItem(eventId, drop) {
  const existingId = Number(drop?.itemId || 0);
  if (Number.isInteger(existingId) && existingId > 0) {
    return { ...drop, itemId: existingId };
  }

  const name = String(drop?.name || "").trim();
  if (!name) return { ...drop, itemId: null, _legacyUnresolved: true };

  try {
    const response = await fetch(`/api/osrs/search?q=${encodeURIComponent(name)}&t=${Date.now()}`, { cache: "no-store" });
    const results = await response.json();
    const normalizedName = normalizeBackfillLabel(name);
    const exact = (Array.isArray(results) ? results : []).find(item =>
      normalizeBackfillLabel(item?.name) === normalizedName && Number(item?.id) > 0
    );

    if (!exact) {
      return { ...drop, itemId: null, _legacyUnresolved: true };
    }

    const resolved = { ...drop, itemId: Number(exact.id), _legacyResolved: true };

    // Permanently upgrade the legacy tracked item so RuneLite and future
    // imports do not have to resolve the item name again.
    await fetch("/api/drops/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        name,
        itemId: resolved.itemId,
        image: drop?.image || exact.image || "",
        wikiUrl: drop?.wikiUrl || exact.url || "",
        rewardEmbers: Number(drop?.rewardEmbers || 0),
        trackingRule: drop?.trackingRule || "repeatable"
      })
    });

    return resolved;
  } catch {
    return { ...drop, itemId: null, _legacyUnresolved: true };
  }
}

async function loadBackfillTrackedItems() {
  const eventId = document.getElementById("backfillEventSelect")?.value || "";
  backfillTrackedItems = [];
  if (!eventId) return;
  try {
    const response = await fetch(`/api/drops/list?eventId=${encodeURIComponent(eventId)}&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    const drops = Array.isArray(data.drops) ? data.drops : [];
    backfillTrackedItems = await Promise.all(
      drops.map(drop => resolveLegacyBackfillTrackedItem(eventId, drop))
    );
  } catch {
    backfillTrackedItems = [];
  }
}

function autoMapBackfillItem(label) {
  const normalized = normalizeBackfillLabel(label);
  if (!normalized) return null;
  let exact = backfillTrackedItems.find(item => normalizeBackfillLabel(item.name) === normalized);
  if (exact) return exact;

  const aliases = new Map([
    ["chisel", ["jeweller s chisel", "jewellers chisel"]],
    ["jeweller s chisel", ["jeweller s chisel", "jewellers chisel"]],
    ["jewellers chisel", ["jeweller s chisel", "jewellers chisel"]]
  ]);
  const targets = aliases.get(normalized) || [];
  for (const target of targets) {
    exact = backfillTrackedItems.find(item => normalizeBackfillLabel(item.name) === target);
    if (exact) return exact;
  }

  // Combined labels such as "dust/mist battlestaff" are intentionally left
  // unmapped because each historical row may represent either real item.
  return null;
}

function renderBackfillPreview() {
  const mount = document.getElementById("backfillPreview");
  const importBtn = document.getElementById("importBackfillBtn");
  if (!mount || !importBtn) return;

  if (!backfillRows.length) {
    mount.innerHTML = "Choose an event and CSV file to preview the import.";
    importBtn.disabled = true;
    return;
  }
  const resolvedTrackedItems = backfillTrackedItems.filter(item => Number(item?.itemId) > 0);
  const unresolvedTrackedItems = backfillTrackedItems.filter(item => !Number(item?.itemId));
  if (!backfillTrackedItems.length) {
    mount.innerHTML = `<p class="admin-error">This event has no tracked bounty/drop items. Add the items under Events first, then retry the CSV.</p>`;
    importBtn.disabled = true;
    return;
  }
  if (!resolvedTrackedItems.length) {
    mount.innerHTML = `<p class="admin-error">The tracked items exist, but none could be matched to an OSRS item ID automatically. Link those items in the Unlinked Tracked Items section above, then retry the CSV.</p>`;
    importBtn.disabled = true;
    return;
  }

  backfillRows.forEach(row => {
    if (!row._mappedItemId) {
      const match = autoMapBackfillItem(row.item_label);
      if (match) row._mappedItemId = Number(match.itemId);
    }
  });

  const options = resolvedTrackedItems.map(item => `<option value="${Number(item.itemId)}">${escapeHtml(item.name)} (ID ${Number(item.itemId)})</option>`).join("");
  const legacyNote = unresolvedTrackedItems.length
    ? `<div class="admin-warning" style="margin-bottom:10px">${unresolvedTrackedItems.length} legacy tracked item${unresolvedTrackedItems.length === 1 ? "" : "s"} could not be matched automatically: ${unresolvedTrackedItems.map(item => escapeHtml(item.name || "Unknown item")).join(", ")}. Link them in the Unlinked Tracked Items section above, then they will appear here immediately.</div>`
    : backfillTrackedItems.some(item => item?._legacyResolved)
      ? `<div class="admin-success" style="margin-bottom:10px">Legacy tracked items were matched to OSRS item IDs and upgraded automatically.</div>`
      : "";
  mount.innerHTML = `
    ${legacyNote}
    <div class="admin-muted" style="margin-bottom:10px">${backfillRows.length} approved historical submission${backfillRows.length === 1 ? "" : "s"} found. Confirm the item mapping before importing.</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="text-align:left;padding:8px">Submission</th><th style="text-align:left;padding:8px">Player</th><th style="text-align:left;padding:8px">Historical Label</th><th style="text-align:left;padding:8px">Tracked Item</th></tr></thead>
        <tbody>${backfillRows.map((row, index) => `
          <tr>
            <td style="padding:8px">#${escapeHtml(row.submission_id || "?")}</td>
            <td style="padding:8px">${escapeHtml(row.player || "")}</td>
            <td style="padding:8px">${escapeHtml(row.item_label || "")}</td>
            <td style="padding:8px"><select data-backfill-map-index="${index}"><option value="">Select item…</option>${options}</select><div class="admin-muted" data-backfill-selected-label="${index}" style="margin-top:4px"></div></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;

  mount.querySelectorAll("[data-backfill-map-index]").forEach(select => {
    const index = Number(select.dataset.backfillMapIndex);
    const row = backfillRows[index];
    const selectedLabel = mount.querySelector(`[data-backfill-selected-label="${index}"]`);
    const updateSelectedFeedback = () => {
      const item = resolvedTrackedItems.find(item => Number(item.itemId) === Number(select.value));
      if (selectedLabel) selectedLabel.textContent = item ? `Mapped to: ${item.name} (ID ${item.itemId})` : "Not mapped";
    };
    if (row?._mappedItemId) select.value = String(row._mappedItemId);
    updateSelectedFeedback();
    select.addEventListener("change", () => {
      row._mappedItemId = Number(select.value || 0) || null;
      updateSelectedFeedback();
      importBtn.disabled = backfillRows.some(item => !item._mappedItemId);
      const status = document.getElementById("backfillImportStatus");
      if (status) status.textContent = row._mappedItemId ? `Submission #${row.submission_id || "?"} mapping saved in this preview.` : "";
    });
  });
  importBtn.disabled = backfillRows.some(row => !row._mappedItemId);
}

async function handleBackfillCsvChange(event) {
  const file = event.target.files?.[0];
  backfillRows = [];
  const status = document.getElementById("backfillImportStatus");
  if (status) status.textContent = "";
  if (!file) { renderBackfillPreview(); return; }
  try {
    const parsed = parseBackfillCsv(await file.text());
    backfillRows = parsed.filter(row => String(row.status || "approved").toLowerCase() === "approved");
    await loadBackfillTrackedItems();
    renderBackfillPreview();
  } catch (error) {
    if (status) status.textContent = error.message || "Could not read CSV.";
    renderBackfillPreview();
  }
}

async function importHistoricalDrops() {
  const eventId = document.getElementById("backfillEventSelect")?.value || "";
  const status = document.getElementById("backfillImportStatus");
  const button = document.getElementById("importBackfillBtn");
  if (!eventId || !backfillRows.length || backfillRows.some(row => !row._mappedItemId)) return;
  if (!confirm(`Import ${backfillRows.length} approved historical submissions into ${eventId}? Existing Discord Submission IDs will be skipped.`)) return;

  const itemById = new Map(backfillTrackedItems.map(item => [Number(item.itemId), item]));
  const rows = backfillRows.map(row => {
    const item = itemById.get(Number(row._mappedItemId));
    const local = String(row.submitted_at_local || "").trim();
    const parsedDate = local ? new Date(local.replace(" ", "T")) : null;
    return {
      submissionId: String(row.submission_id || "").trim(),
      playerName: String(row.player || "").trim(),
      itemId: Number(item?.itemId || 0),
      itemName: String(item?.name || ""),
      quantity: 1,
      approvedBy: String(row.approved_by || "").trim(),
      submittedAt: parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : null
    };
  });

  if (button) button.disabled = true;
  if (status) status.textContent = "Importing…";
  try {
    const response = await fetch("/api/admin/event-submissions/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteEventId: eventId, rows })
    });
    const rawResponse = await response.text();
    let data = {};
    try { data = rawResponse ? JSON.parse(rawResponse) : {}; } catch { data = {}; }
    if (!response.ok) {
      const serverMessage = data.error || data.message || rawResponse || `Import endpoint returned HTTP ${response.status}.`;
      throw new Error(serverMessage);
    }
    const failedDetails = Array.isArray(data.details)
      ? data.details.filter(entry => entry?.status === "failed").map(entry => `#${entry.submissionId || "?"}: ${entry.reason || "failed"}`)
      : [];
    if (status) {
      status.textContent = `Imported ${Number(data.imported || 0)}, skipped ${Number(data.skipped || 0)}, failed ${Number(data.failed || 0)}.${failedDetails.length ? ` ${failedDetails.slice(0, 3).join(" | ")}${failedDetails.length > 3 ? " …" : ""}` : ""}`;
    }
    await loadBackfillTrackedItems();
    renderBackfillPreview();
  } catch (error) {
    if (status) status.textContent = error.message || "Import failed.";
  } finally {
    if (button) button.disabled = backfillRows.some(row => !row._mappedItemId);
  }
}

function renderPluginTrackingOverview() {
  const mount = document.getElementById("pluginTrackingOverviewList");
  if (!mount) return;

  const supported = allEvents.filter(event =>
    event && (event.type === "sotw" || event.type === "botw" || isClanGoalEvent(event) || isBountiesEvent(event) || isPvmEntryEvent(event) || isPvmEntryEvent(event))
  );

  if (!supported.length) {
    mount.innerHTML = `<p class="admin-muted">No trackable events found.</p>`;
    return;
  }

  mount.innerHTML = supported.map(event => {
    const id = event.pluginEventId || "Not created yet";
    const state = event.active ? (event.dropsEnabled ? "Active - Drops Enabled" : "Active - Drops Disabled") : "Inactive";
    return `
      <div class="admin-info-box" style="margin-bottom:10px">
        <div class="admin-inline-row" style="justify-content:space-between;align-items:center">
          <div>
            <strong>${escapeHtml(getPluginTrackingLabel(event))}</strong>
            <div class="admin-muted">${escapeHtml(event.title || getResetEventTitle(event))} · ${escapeHtml(state)}</div>
          </div>
          <button type="button" class="btn secondary" data-copy-plugin-event-id="${escapeHtml(event.pluginEventId || "")}" ${event.pluginEventId ? "" : "disabled"}>Copy ID</button>
        </div>
        <code style="display:block;margin-top:8px;word-break:break-all">${escapeHtml(id)}</code>
      </div>
    `;
  }).join("");

  mount.querySelectorAll("[data-copy-plugin-event-id]").forEach(button => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyPluginEventId || "";
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const original = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = original; }, 1200);
      } catch {
        alert(`Plugin Event ID: ${value}`);
      }
    });
  });
}

async function copySelectedPluginEventId() {
  const value = document.getElementById("pluginEventIdInput")?.value.trim() || "";
  if (!value) {
    alert("This event does not have a Plugin Event ID yet. Activate and save it first.");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    const button = document.getElementById("copyPluginEventIdBtn");
    if (button) {
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1200);
    }
  } catch {
    alert(`Plugin Event ID: ${value}`);
  }
}

function formatAdminDate(value) {
  if (!value) return "Dates not loaded yet.";

  return new Date(value).toLocaleDateString("en-US");
}

function updateDetectedWomBox(event, details = null) {
  const titleEl = document.getElementById("detectedEventTitle");
  const metaEl = document.getElementById("detectedEventMeta");

  if (!titleEl || !metaEl) return;

  const source = details || event || {};
  const title = source.title || "No WOM competition loaded yet.";
  const metric = source.metric || "Metric not loaded";
  const startsAt = source.startsAt || source.startDate || null;
  const endsAt = source.endsAt || source.endDate || null;

  titleEl.textContent = title;

  if (startsAt || endsAt || source.metric) {
    metaEl.textContent = `${metric} • ${formatAdminDate(startsAt)} - ${formatAdminDate(endsAt)}`;
  } else {
    metaEl.textContent = "Enter a WOM competition ID and click Preview, or save and reload.";
  }
}

async function previewWomDetails() {
  const input = document.getElementById("eventWomInput");
  const event = getSelectedEvent();
  const competitionId = input?.value.trim();

  if (!competitionId) {
    updateDetectedWomBox(event, null);
    return;
  }

  try {
    const response = await fetch(`/api/event-standings?competitionId=${encodeURIComponent(competitionId)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not preview WOM competition.");
    }

    updateDetectedWomBox(event, {
      title: data.title,
      metric: data.metric,
      startsAt: data.startsAt,
      endsAt: data.endsAt
    });
  } catch (error) {
    const titleEl = document.getElementById("detectedEventTitle");
    const metaEl = document.getElementById("detectedEventMeta");

    if (titleEl) titleEl.textContent = "Could not load WOM competition.";
    if (metaEl) metaEl.textContent = error.message;
  }
}

function isClanGoalEvent(event) {
  return Boolean(event?.type && event.type.includes("clan-goal"));
}
function isBountiesEvent(event) { return event?.type === "bounties" || event?.id === "bounties"; }
function isPvmEntryEvent(event) { return event?.type === "pvm-entry" || event?.id === "pvm-entry"; }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getDefaultRewards(event) {
  if (isClanGoalEvent(event)) {
    return {
      placement: [
        { label: "25%", reward: "Clan Mass" },
        { label: "50%", reward: "Bond Giveaway" },
        { label: "75%", reward: "Bonus Embers" },
        { label: "100%", reward: "Bond Giveaway" }
      ],
      participation: []
    };
  }

  if (isBountiesEvent(event)) {
    return { placement: [], participation: [] };
  }

  if (event?.type === "botw") {
    return {
      placement: [
        { label: "🥇 1st Place", reward: "75 Embers + BOTW Rank" },
        { label: "🥈 2nd Place", reward: "50 Embers" },
        { label: "🥉 3rd Place", reward: "35 Embers" }
      ],
      participation: [
        { requirement: "High Tier", reward: "Participation Embers vary by boss" },
        { requirement: "Low Tier", reward: "Participation Embers vary by boss" }
      ]
    };
  }

  return {
    placement: [
      { label: "🥇 1st Place", reward: "50 Embers + SOTW Rank" },
      { label: "🥈 2nd Place", reward: "40 Embers" },
      { label: "🥉 3rd Place", reward: "35 Embers" }
    ],
    participation: [
      { requirement: "1250K XP", reward: "30 Embers" },
      { requirement: "750K XP", reward: "20 Embers" },
      { requirement: "300K XP", reward: "10 Embers" }
    ]
  };
}

function normalizeRewards(event) {
  if (!event.rewards || typeof event.rewards !== "object") {
    event.rewards = getDefaultRewards(event);
  }

  if (!Array.isArray(event.rewards.placement)) {
    event.rewards.placement = [];
  }

  if (!Array.isArray(event.rewards.participation)) {
    event.rewards.participation = [];
  }
}

function updateEventFieldVisibility() {
  const event = getSelectedEvent();
  const targetSection = document.getElementById("targetSection");
  const milestonesSection = document.getElementById("milestonesSection");
  const standardDrops = document.getElementById("standardDropsEditor");
  const dropsToggle = document.getElementById("eventDropsInput")?.closest("label");
  const showGoalFields = isClanGoalEvent(event);
  const showBounties = isBountiesEvent(event);
  const showPvmEntry = isPvmEntryEvent(event);
  const supportsTrackedDrops = Boolean(event && ["sotw", "botw", "bounties", "pvm-entry"].includes(event.type)) || showGoalFields;
  const bountiesEditor = document.getElementById("bountiesEditor");
  const womField = document.getElementById("eventWomInput")?.closest(".admin-field");
  const detectedBox = document.getElementById("womDetectedBox")?.closest(".admin-field");
  const rewardsDivider = document.getElementById("eventRewardsDivider");
  const rewardsHeader = document.getElementById("eventRewardsHeader");
  const rewardsGrid = document.getElementById("eventRewardsGrid");
  const archiveButton = document.getElementById("archiveEventBtn");
  const dropBossField = document.getElementById("dropBossField");
  const rewardsPlacement = document.getElementById("placementRewardsEditor")?.closest(".admin-reward-panel");
  const rewardsParticipation = document.getElementById("participationRewardsEditor")?.closest(".admin-reward-panel");

  if (targetSection) targetSection.style.display = showGoalFields ? "grid" : "none";
  if (milestonesSection) milestonesSection.style.display = showGoalFields ? "grid" : "none";
  if (standardDrops) standardDrops.style.display = (supportsTrackedDrops && !showBounties) ? "block" : "none";
  if (bountiesEditor) bountiesEditor.style.display = showBounties ? "block" : "none";
  if (dropsToggle) dropsToggle.style.display = supportsTrackedDrops ? "inline-flex" : "none";
  if (womField) womField.style.display = (showBounties || showPvmEntry) ? "none" : "grid";
  if (detectedBox) detectedBox.style.display = (showBounties || showPvmEntry) ? "none" : "grid";
  if (rewardsDivider) rewardsDivider.style.display = showPvmEntry ? "none" : "block";
  if (rewardsHeader) rewardsHeader.style.display = showPvmEntry ? "none" : "block";
  if (rewardsGrid) rewardsGrid.style.display = showPvmEntry ? "none" : "grid";
  if (rewardsPlacement) rewardsPlacement.style.display = showPvmEntry ? "none" : "block";
  if (rewardsParticipation) rewardsParticipation.style.display = showPvmEntry ? "none" : "block";
  if (archiveButton) archiveButton.style.display = showPvmEntry ? "none" : "inline-flex";
  if (dropBossField) dropBossField.style.display = showPvmEntry ? "grid" : "none";
}

function renderMilestonesEditor() {
  const editor = document.getElementById("milestonesEditor");
  const event = getSelectedEvent();

  if (!editor || !event) return;

  if (!isClanGoalEvent(event)) {
    editor.innerHTML = "";
    return;
  }

  const milestones = Array.isArray(event.milestones) ? event.milestones : [];
  editor.innerHTML = "";

  if (milestones.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-muted";
    empty.textContent = "No milestones added yet.";
    editor.appendChild(empty);
  }

  milestones.forEach((milestone, index) => {
    const row = document.createElement("div");
    row.className = "milestone-editor-row";

    row.innerHTML = `
      <input
        type="number"
        min="1"
        max="100"
        value="${escapeHtml(milestone.percent || "")}"
        placeholder="%"
        data-milestone-percent="${index}"
      />

      <input
        type="text"
        value="${escapeHtml(milestone.title || "")}"
        placeholder="Reward"
        data-milestone-title="${index}"
      />

      <button type="button" onclick="removeMilestone(${index})">Remove</button>
    `;

    editor.appendChild(row);
  });
}

function collectMilestonesFromEditor() {
  const event = getSelectedEvent();
  if (!event) return;

  if (!isClanGoalEvent(event)) {
    event.milestones = [];
    return;
  }

  const percentInputs = document.querySelectorAll("[data-milestone-percent]");
  const titleInputs = document.querySelectorAll("[data-milestone-title]");
  const milestones = [];

  percentInputs.forEach((percentInput, index) => {
    const percent = Number(percentInput.value);
    const title = titleInputs[index]?.value.trim();

    if (percent > 0 && percent <= 100 && title) {
      milestones.push({ percent, title });
    }
  });

  milestones.sort((a, b) => a.percent - b.percent);
  event.milestones = milestones;
}

function addMilestone() {
  const event = getSelectedEvent();
  if (!event || !isClanGoalEvent(event)) return;

  if (!Array.isArray(event.milestones)) {
    event.milestones = [];
  }

  event.milestones.push({ percent: 100, title: "" });
  renderMilestonesEditor();
}

function removeMilestone(index) {
  const event = getSelectedEvent();
  if (!event || !Array.isArray(event.milestones)) return;

  event.milestones.splice(index, 1);
  renderMilestonesEditor();
}

function renderRewardsEditor() {
  const event = getSelectedEvent();
  const placementEditor = document.getElementById("placementRewardsEditor");
  const participationEditor = document.getElementById("participationRewardsEditor");

  if (!event || !placementEditor || !participationEditor) return;

  normalizeRewards(event);

  const rewardsGrid = document.querySelector(".admin-rewards-grid");
  if (rewardsGrid) {
    rewardsGrid.style.display = isBountiesEvent(event) ? "none" : "";
  }

  placementEditor.innerHTML = "";
  participationEditor.innerHTML = "";

  if (event.rewards.placement.length === 0) {
    placementEditor.innerHTML = `<p class="admin-muted">No placement rewards added yet.</p>`;
  }

  if (event.rewards.participation.length === 0) {
    participationEditor.innerHTML = `<p class="admin-muted">No participation rewards added yet.</p>`;
  }

  event.rewards.placement.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "reward-editor-row";
    row.innerHTML = `
      <input
        type="text"
        value="${escapeHtml(item.label || "")}"
        placeholder="Label, e.g. 🥇 1st Place"
        data-placement-label="${index}"
      />

      <input
        type="text"
        value="${escapeHtml(item.reward || "")}"
        placeholder="Reward, e.g. 50 Embers + SOTW Rank"
        data-placement-reward="${index}"
      />

      <button type="button" onclick="removePlacementReward(${index})">Remove</button>
    `;
    placementEditor.appendChild(row);
  });

  event.rewards.participation.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "reward-editor-row";
    row.innerHTML = `
      <input
        type="text"
        value="${escapeHtml(item.requirement || "")}"
        placeholder="Requirement, e.g. 1250K XP"
        data-participation-requirement="${index}"
      />

      <input
        type="text"
        value="${escapeHtml(item.reward || "")}"
        placeholder="Reward, e.g. 30 Embers"
        data-participation-reward="${index}"
      />

      <button type="button" onclick="removeParticipationReward(${index})">Remove</button>
    `;
    participationEditor.appendChild(row);
  });
}

function collectRewardsFromEditor() {
  const event = getSelectedEvent();
  if (!event) return;

  // Bounties use per-item Ember rewards only. Remove any legacy event-level rewards.
  if (isBountiesEvent(event)) {
    delete event.rewards;
    return;
  }

  const placementLabels = document.querySelectorAll("[data-placement-label]");
  const placementRewards = document.querySelectorAll("[data-placement-reward]");
  const participationRequirements = document.querySelectorAll("[data-participation-requirement]");
  const participationRewards = document.querySelectorAll("[data-participation-reward]");

  const placement = [];
  const participation = [];

  placementLabels.forEach((labelInput, index) => {
    const label = labelInput.value.trim();
    const reward = placementRewards[index]?.value.trim();

    if (label || reward) {
      placement.push({ label, reward });
    }
  });

  participationRequirements.forEach((requirementInput, index) => {
    const requirement = requirementInput.value.trim();
    const reward = participationRewards[index]?.value.trim();

    if (requirement || reward) {
      participation.push({ requirement, reward });
    }
  });

  event.rewards = { placement, participation };
}

function addPlacementReward() {
  const event = getSelectedEvent();
  if (!event) return;

  normalizeRewards(event);
  event.rewards.placement.push({ label: "", reward: "" });
  renderRewardsEditor();
}

function removePlacementReward(index) {
  const event = getSelectedEvent();
  if (!event) return;

  normalizeRewards(event);
  event.rewards.placement.splice(index, 1);
  renderRewardsEditor();
}

function addParticipationReward() {
  const event = getSelectedEvent();
  if (!event) return;

  normalizeRewards(event);
  event.rewards.participation.push({ requirement: "", reward: "" });
  renderRewardsEditor();
}

function removeParticipationReward(index) {
  const event = getSelectedEvent();
  if (!event) return;

  normalizeRewards(event);
  event.rewards.participation.splice(index, 1);
  renderRewardsEditor();
}

function populateEventFields() {
  const event = getSelectedEvent();
  if (!event) return;

  normalizeRewards(event);

  const botwTierNotice = document.getElementById("botwTierNotice");
  if (botwTierNotice) {
    const tier = getBotwTierLabel(event);
    botwTierNotice.style.display = event.type === "botw" ? "block" : "none";
    botwTierNotice.innerHTML = tier
      ? `<strong>Editing BOTW ${escapeHtml(tier)}.</strong> WOM ID, rewards, active status, and archive are saved separately for this tier.`
      : `<strong>Editing BOTW.</strong> This event is separated from other BOTW tiers.`;
  }

  document.getElementById("eventDescriptionInput").value = event.description || "";
  document.getElementById("eventWomInput").value = event.womCompetitionId || "";
  const eventPasswordInput = document.getElementById("eventPasswordInput");
  if (eventPasswordInput) eventPasswordInput.value = event.eventPassword || "";
  document.getElementById("eventTargetInput").value = event.target || "";
  updateDetectedWomBox(event);
  const pvmEntry = isPvmEntryEvent(event);
  const activeInput = document.getElementById("eventActiveInput");
  const featuredInput = document.getElementById("eventFeaturedInput");
  const dropsInput = document.getElementById("eventDropsInput");
  activeInput.checked = pvmEntry ? true : Boolean(event.active);
  featuredInput.checked = pvmEntry ? false : Boolean(event.featured);
  dropsInput.checked = pvmEntry ? true : Boolean(event.dropsEnabled);
  activeInput.disabled = pvmEntry;
  featuredInput.disabled = pvmEntry;
  dropsInput.disabled = pvmEntry;
  updatePluginEventIdDisplay();
  renderPluginTrackingOverview();

  updateEventFieldVisibility();
  renderMilestonesEditor();
  renderRewardsEditor();
}



function activateAdminPanel(target) {
  const panels = Array.from(document.querySelectorAll(".admin-tab-panel"));
  const adminButtons = Array.from(document.querySelectorAll(".admin-tab-btn"));
  const eventButtons = Array.from(document.querySelectorAll(".event-subtab-btn"));

  panels.forEach(panel => {
    panel.classList.toggle("active", panel.id === `adminTab-${target}`);
  });

  adminButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.adminTab === target);
  });

  if (target !== "events") {
    eventButtons.forEach(button => button.classList.remove("active"));
  }
}

function setupAdminTabs() {
  const buttons = Array.from(document.querySelectorAll(".admin-tab-btn"));
  const panels = Array.from(document.querySelectorAll(".admin-tab-panel"));

  if (!buttons.length || !panels.length) return;

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      activateAdminPanel(button.dataset.adminTab);
    });
  });
}

function setupEventSubtabs() {
  const buttons = Array.from(document.querySelectorAll(".event-subtab-btn"));
  const panels = Array.from(document.querySelectorAll(".event-subtab-panel"));
  if (!buttons.length || !panels.length) return;

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.eventSubtab;

      activateAdminPanel("events");
      buttons.forEach(item => item.classList.toggle("active", item === button));
      panels.forEach(panel => panel.classList.toggle("active", panel.id === `eventSubtab-${target}`));
    });
  });
}

function renderSelectedAdminMode() {
  populateEventFields();
  loadAdminDrops();
}

function toDateTimeLocalValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

async function fetchBingoSettings() {
  const response = await fetch(`/api/bingo/settings?t=${Date.now()}`, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load Bingo settings.");
  }

  return data.settings || {};
}

async function loadBingoSettings() {
  const titleInput = document.getElementById("bingoTitleInput");
  const descriptionInput = document.getElementById("bingoDescriptionInput");
  const activeInput = document.getElementById("bingoActiveInput");
  const showOnEventsInput = document.getElementById("bingoShowOnEventsInput");
  const signupOpenInput = document.getElementById("bingoSignupOpenInput");
  const viewEventInput = document.getElementById("bingoViewEventInput");
  const registrationEndsAtInput = document.getElementById("bingoRegistrationEndsAtInput");
  const boardRevealAtInput = document.getElementById("bingoBoardRevealAtInput");
  const teamOneNameInput = document.getElementById("bingoTeamOneNameInput");
  const teamTwoNameInput = document.getElementById("bingoTeamTwoNameInput");

  if (!titleInput || !descriptionInput || !activeInput || !signupOpenInput || !viewEventInput) return;

  try {
    const settings = await fetchBingoSettings();
    titleInput.value = settings.title || "Battleship Bingo";
    descriptionInput.value = settings.description || "";
    activeInput.checked = settings.active === true;
    if (showOnEventsInput) showOnEventsInput.checked = settings.showOnEventsPage === true;
    signupOpenInput.checked = settings.signupOpen === true;
    viewEventInput.checked = settings.enableViewEvent === true;
    if (registrationEndsAtInput) registrationEndsAtInput.value = toDateTimeLocalValue(settings.registrationEndsAt);
    if (boardRevealAtInput) boardRevealAtInput.value = toDateTimeLocalValue(settings.boardRevealAt);
    if (teamOneNameInput) teamOneNameInput.value = settings.teamOneName || "Team 1";
    if (teamTwoNameInput) teamTwoNameInput.value = settings.teamTwoName || "Team 2";
  } catch (error) {
    const status = document.getElementById("bingoSettingsStatus");
    if (status) status.textContent = error.message;
  }
}

async function saveBingoSettings() {
  const titleInput = document.getElementById("bingoTitleInput");
  const descriptionInput = document.getElementById("bingoDescriptionInput");
  const activeInput = document.getElementById("bingoActiveInput");
  const showOnEventsInput = document.getElementById("bingoShowOnEventsInput");
  const signupOpenInput = document.getElementById("bingoSignupOpenInput");
  const viewEventInput = document.getElementById("bingoViewEventInput");
  const registrationEndsAtInput = document.getElementById("bingoRegistrationEndsAtInput");
  const boardRevealAtInput = document.getElementById("bingoBoardRevealAtInput");
  const teamOneNameInput = document.getElementById("bingoTeamOneNameInput");
  const teamTwoNameInput = document.getElementById("bingoTeamTwoNameInput");
  const status = document.getElementById("bingoSettingsStatus");

  if (!titleInput || !descriptionInput || !activeInput || !signupOpenInput || !viewEventInput) return;

  const response = await fetch("/api/admin/bingo/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: titleInput.value.trim() || "Battleship Bingo",
      description: descriptionInput.value.trim(),
      active: activeInput.checked,
      showOnEventsPage: showOnEventsInput?.checked === true,
      signupOpen: signupOpenInput.checked,
      enableViewEvent: viewEventInput.checked,
      registrationEndsAt: fromDateTimeLocalValue(registrationEndsAtInput?.value || ""),
      boardRevealAt: fromDateTimeLocalValue(boardRevealAtInput?.value || ""),
      teamOneName: teamOneNameInput?.value.trim() || "Team 1",
      teamTwoName: teamTwoNameInput?.value.trim() || "Team 2"
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (status) status.textContent = data.error || "Could not save Bingo settings.";
    return;
  }

  if (status) status.textContent = "Bingo settings saved.";
}


async function loadGuessKcSettings() {
  const input = document.getElementById("guessKcShowOnEventsInput");
  if (!input) return;
  try {
    const response = await fetch(`/api/giveaways/settings?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load Guess the KC settings.");
    input.checked = data.settings?.showOnEventsPage !== false;
  } catch (error) {
    const status = document.getElementById("guessKcSettingsStatus");
    if (status) status.textContent = error.message;
  }
}

async function saveGuessKcSettings() {
  const input = document.getElementById("guessKcShowOnEventsInput");
  const status = document.getElementById("guessKcSettingsStatus");
  if (!input) return;
  const response = await fetch("/api/admin/giveaways/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showOnEventsPage: input.checked })
  });
  const data = await response.json().catch(() => ({}));
  if (status) status.textContent = response.ok ? "Guess the KC visibility saved." : (data.error || "Could not save settings.");
}


function applyBingoMode(mode) {
  const activeInput = document.getElementById("bingoActiveInput");
  const signupOpenInput = document.getElementById("bingoSignupOpenInput");
  const viewEventInput = document.getElementById("bingoViewEventInput");

  if (!activeInput || !signupOpenInput || !viewEventInput) return;

  activeInput.checked = true;
  signupOpenInput.checked = mode === "registration";
  viewEventInput.checked = mode === "started";

  saveBingoSettings();
}


function renderProfileSearchResults(results) {
  const mount = document.getElementById("profileSearchResults");
  if (!mount) return;

  if (!results.length) {
    mount.innerHTML = `<p class="admin-muted">No matching members found.</p>`;
    return;
  }

  mount.innerHTML = results.map(member => `
    <button type="button" class="admin-profile-result" data-profile-member='${escapeHtml(JSON.stringify(member))}'>
      <span>
        <strong>${escapeHtml(member.displayName || "Unknown member")}</strong>
        <small>${escapeHtml(member.username || member.discordId || "")}</small>
      </span>
      <span class="admin-profile-embers">${formatNumber(member.embers || 0)} Embers</span>
    </button>
  `).join("");

  mount.querySelectorAll("[data-profile-member]").forEach(button => {
    button.addEventListener("click", () => {
      try {
        openProfileEditor(JSON.parse(button.dataset.profileMember));
      } catch {
        // Ignore malformed embedded data.
      }
    });
  });
}

async function searchMemberProfiles() {
  const input = document.getElementById("profileSearchInput");
  const mount = document.getElementById("profileSearchResults");
  const query = input?.value.trim() || "";

  if (!query || query.length < 2) {
    if (mount) mount.innerHTML = `<p class="admin-muted">Enter at least 2 characters.</p>`;
    return;
  }

  if (mount) mount.innerHTML = `<p class="admin-muted">Searching...</p>`;

  const response = await fetch(`/api/admin/profiles/search?q=${encodeURIComponent(query)}&t=${Date.now()}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (mount) mount.innerHTML = `<p class="admin-error">${escapeHtml(data.error || "Could not search profiles.")}</p>`;
    return;
  }

  renderProfileSearchResults(data.results || []);
}

function openProfileEditor(member) {
  const editor = document.getElementById("profileAdminEditor");
  const title = document.getElementById("profileEditorTitle");
  const meta = document.getElementById("profileEditorMeta");
  const discordIdInput = document.getElementById("profileEditorDiscordId");
  const displayNameInput = document.getElementById("profileEditorDisplayName");
  const usernameInput = document.getElementById("profileEditorUsername");
  const avatarInput = document.getElementById("profileAvatarOverrideInput");
  const blurbInput = document.getElementById("profileBlurbOverrideInput");
  const rankInput = document.getElementById("profileRankOverrideInput");
  const status = document.getElementById("profileAdminStatus");

  if (editor) editor.style.display = "block";
  if (title) title.textContent = member.displayName || "Selected Member";
  if (meta) meta.textContent = `Discord ID: ${member.discordId || "Unknown"} • ${formatNumber(member.embers || 0)} Embers`;
  if (discordIdInput) discordIdInput.value = member.discordId || "";
  if (displayNameInput) displayNameInput.value = member.displayName || "Unknown member";
  if (usernameInput) usernameInput.value = member.username || "";
  if (avatarInput) avatarInput.value = member.adminAvatarOverride || "";
  if (blurbInput) blurbInput.value = member.adminBlurbOverride || "";
  if (rankInput) rankInput.value = member.rankOverride || "";
  if (status) status.textContent = "";
}

async function saveProfileOverrides(clear = false) {
  const discordId = document.getElementById("profileEditorDiscordId")?.value.trim();
  const displayName = document.getElementById("profileEditorDisplayName")?.value.trim();
  const username = document.getElementById("profileEditorUsername")?.value.trim();
  const avatarInput = document.getElementById("profileAvatarOverrideInput");
  const blurbInput = document.getElementById("profileBlurbOverrideInput");
  const rankInput = document.getElementById("profileRankOverrideInput");
  const status = document.getElementById("profileAdminStatus");

  if (!discordId) {
    if (status) status.textContent = "Select a member first.";
    return;
  }

  if (status) status.textContent = clear ? "Clearing overrides..." : "Saving overrides...";

  const response = await fetch("/api/admin/profiles/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      discordId,
      displayName,
      username,
      adminAvatarOverride: clear ? "" : avatarInput?.value.trim() || "",
      adminBlurbOverride: clear ? "" : blurbInput?.value.trim() || "",
      rankOverride: clear ? "" : rankInput?.value.trim() || ""
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (status) status.textContent = data.error || "Could not save profile overrides.";
    return;
  }

  if (clear) {
    if (avatarInput) avatarInput.value = "";
    if (blurbInput) blurbInput.value = "";
    if (rankInput) rankInput.value = "";
  }

  if (status) status.textContent = clear ? "Overrides cleared." : "Profile overrides saved.";
}


function formatSyncAge(iso) {
  if (!iso) return "Never";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "Unknown";
  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function renderDiscordSyncMeta(meta, options = {}) {
  const health = document.getElementById("discordSyncHealth");
  const count = document.getElementById("discordSyncMemberCount");
  const last = document.getElementById("discordSyncLastSync");
  const writes = document.getElementById("discordSyncWrites");
  const failures = document.getElementById("discordSyncFailures");
  const summary = document.getElementById("discordSyncSummary");

  const failureCount = Number(meta?.profileRecordFailures || 0);
  const isReady = Boolean(meta?.directoryReady);
  if (count) count.textContent = meta?.memberCount != null ? formatNumber(meta.memberCount) : "—";
  if (last) {
    last.textContent = formatSyncAge(meta?.syncedAt);
    last.title = meta?.syncedAt ? new Date(meta.syncedAt).toLocaleString() : "";
  }
  if (writes) writes.textContent = meta?.profileRecordsWritten != null ? formatNumber(meta.profileRecordsWritten) : "—";
  if (failures) failures.textContent = meta?.profileRecordFailures != null ? formatNumber(meta.profileRecordFailures) : "—";

  if (health) {
    health.className = "discord-sync-health";
    if (!isReady) {
      health.classList.add("is-warning");
      health.textContent = "Not synced";
    } else if (failureCount > 0) {
      health.classList.add("is-warning");
      health.textContent = "Partial";
    } else {
      health.classList.add("is-healthy");
      health.textContent = "Healthy";
    }
  }

  if (summary && options.showSummary) {
    const seconds = Number(meta?.durationMs || 0) / 1000;
    summary.hidden = false;
    summary.innerHTML = `<strong>✓ Sync complete</strong><br>` +
      `Members scanned: ${formatNumber(meta?.memberCount || 0)} &nbsp;•&nbsp; ` +
      `Added: ${formatNumber(meta?.added || 0)} &nbsp;•&nbsp; ` +
      `Updated: ${formatNumber(meta?.updated || 0)} &nbsp;•&nbsp; ` +
      `Removed from search: ${formatNumber(meta?.removed || 0)} &nbsp;•&nbsp; ` +
      `Time: ${seconds ? seconds.toFixed(1) : "0.0"}s`;
  }
}

function escapeAdminHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderDiscordRankEmblems(diagnostics) {
  const grid = document.getElementById("discordRankEmblemGrid");
  if (!grid) return;

  const ranks = Array.isArray(diagnostics?.ranks) ? diagnostics.ranks : [];
  const emojis = Array.isArray(diagnostics?.emojis) ? diagnostics.emojis : [];
  const mappings = diagnostics?.mappings && typeof diagnostics.mappings === "object" ? diagnostics.mappings : {};

  if (!ranks.length) {
    grid.innerHTML = '<span class="admin-muted">No tracked Discord ranks were found.</span>';
    return;
  }

  const emojiOptions = emojis.map(emoji => {
    const label = `${emoji.name} · ${emoji.id}`;
    return `<option value="${escapeAdminHtml(emoji.id)}">${escapeAdminHtml(label)}</option>`;
  }).join("");

  grid.innerHTML = ranks.map(rank => {
    const mappedId = String(mappings?.[rank.id] || rank.mappedEmojiId || "");
    const selectedEmoji = emojis.find(emoji => String(emoji.id) === mappedId) || null;
    const automaticUrl = rank.nativeIconUrl || "";
    const previewUrl = selectedEmoji?.url || automaticUrl;
    const preview = previewUrl
      ? `<img class="discord-rank-emblem-preview" src="${escapeAdminHtml(previewUrl)}" alt="" />`
      : `<span class="discord-rank-emblem-preview is-empty">◇</span>`;
    const automaticLabel = rank.nativeIconUrl
      ? "Discord role icon available"
      : rank.unicodeEmoji
        ? `Role emoji: ${escapeAdminHtml(rank.unicodeEmoji)}`
        : "No native role icon";

    return `
      <div class="discord-rank-emblem-row" data-rank-id="${escapeAdminHtml(rank.id)}">
        ${preview}
        <div class="discord-rank-emblem-copy">
          <strong>${escapeAdminHtml(rank.name)}</strong>
          <small>${automaticLabel}</small>
        </div>
        <select class="discord-rank-emblem-select" data-rank-id="${escapeAdminHtml(rank.id)}">
          <option value="">Use native/automatic</option>
          ${emojiOptions}
        </select>
      </div>`;
  }).join("");

  grid.querySelectorAll(".discord-rank-emblem-select").forEach(select => {
    const roleId = select.dataset.rankId || "";
    select.value = String(mappings?.[roleId] || "");
    select.addEventListener("change", () => {
      const row = select.closest(".discord-rank-emblem-row");
      const preview = row?.querySelector(".discord-rank-emblem-preview");
      const selected = emojis.find(emoji => String(emoji.id) === select.value);
      const rank = ranks.find(item => String(item.id) === roleId);
      const previewUrl = selected?.url || rank?.nativeIconUrl || "";
      if (!preview) return;
      if (previewUrl) {
        if (preview.tagName === "IMG") {
          preview.src = previewUrl;
        } else {
          const image = document.createElement("img");
          image.className = "discord-rank-emblem-preview";
          image.src = previewUrl;
          image.alt = "";
          preview.replaceWith(image);
        }
      } else if (preview.tagName === "IMG") {
        const fallback = document.createElement("span");
        fallback.className = "discord-rank-emblem-preview is-empty";
        fallback.textContent = "◇";
        preview.replaceWith(fallback);
      }
    });
  });
}

async function saveDiscordRankEmblems() {
  const button = document.getElementById("saveDiscordRankEmblemsBtn");
  const status = document.getElementById("discordRankEmblemStatus");
  const mappings = {};
  document.querySelectorAll(".discord-rank-emblem-select").forEach(select => {
    const roleId = String(select.dataset.rankId || "").trim();
    const emojiId = String(select.value || "").trim();
    if (roleId && emojiId) mappings[roleId] = emojiId;
  });

  if (button) button.disabled = true;
  if (status) status.textContent = "Saving mappings and re-syncing member profiles…";
  try {
    const response = await fetch("/api/admin/profiles/sync-discord", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not save rank emblems.");
    renderDiscordRankEmblems(data.diagnostics || {});
    if (status) status.textContent = "Rank emblems saved. Re-syncing member profiles in safe batches…";
    await syncDiscordMembersNow();
    if (status) status.textContent = "Rank emblems saved and member profiles re-synced with the exact Discord emoji IDs.";
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadDiscordSyncStatus() {
  const health = document.getElementById("discordSyncHealth");
  if (!health) return;
  try {
    const response = await fetch(`/api/admin/profiles/sync-discord?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load sync status.");
    renderDiscordSyncMeta(data.meta || null);
    renderDiscordRankEmblems(data.diagnostics || {});
  } catch (error) {
    health.className = "discord-sync-health is-error";
    health.textContent = "Unavailable";
    const status = document.getElementById("discordSyncStatus");
    if (status) status.textContent = error.message;
  }
}

async function syncDiscordMembersNow() {
  const button = document.getElementById("syncDiscordMembersBtn");
  const status = document.getElementById("discordSyncStatus");
  const health = document.getElementById("discordSyncHealth");
  const summary = document.getElementById("discordSyncSummary");

  if (button) button.disabled = true;
  if (summary) summary.hidden = true;
  if (status) status.textContent = "Starting Discord member sync…";
  if (health) {
    health.className = "discord-sync-health is-loading";
    health.textContent = "Syncing…";
  }

  try {
    let offset = 0;
    let finalData = null;
    while (true) {
      const response = await fetch("/api/admin/profiles/sync-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not sync Discord members.");
      finalData = data;
      const processed = Number(data.processed || 0);
      const total = Number(data.total || data.memberCount || 0);
      if (status) status.textContent = total
        ? `Syncing Discord profiles… ${Math.min(processed, total)} / ${total}`
        : "Syncing Discord profiles…";
      if (data.done || data.nextOffset == null) break;
      offset = Number(data.nextOffset);
      if (!Number.isFinite(offset)) throw new Error("Discord sync returned an invalid batch cursor.");
    }

    renderDiscordSyncMeta(finalData, { showSummary: true });
    if (finalData?.diagnostics) renderDiscordRankEmblems(finalData.diagnostics);
    if (status) {
      const updated = Number(finalData?.profileRecordsWritten || 0);
      const unchanged = Number(finalData?.profileRecordsUnchanged || 0);
      status.textContent = `Discord member profiles are up to date. ${updated} updated${unchanged ? `, ${unchanged} unchanged` : ""}.`;
    }
  } catch (error) {
    if (health) {
      health.className = "discord-sync-health is-error";
      health.textContent = "Sync failed";
    }
    if (status) status.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadAdmin() {
  setupAdminTabs();
  setupEventSubtabs();

  const eventSelect = document.getElementById("adminEventSelect");
  const addDropBtn = document.getElementById("addDropBtn");
  const saveEventBtn = document.getElementById("saveEventBtn");
  const copyPluginEventIdBtn = document.getElementById("copyPluginEventIdBtn");
  const addMilestoneBtn = document.getElementById("addMilestoneBtn");
  const addPlacementRewardBtn = document.getElementById("addPlacementRewardBtn");
  const addParticipationRewardBtn = document.getElementById("addParticipationRewardBtn");
  const archiveEventBtn = document.getElementById("archiveEventBtn");
  const previewWomBtn = document.getElementById("previewWomBtn");
  const saveBingoSettingsBtn = document.getElementById("saveBingoSettingsBtn");
  const openBingoRegistrationBtn = document.getElementById("openBingoRegistrationBtn");
  const startBingoEventBtn = document.getElementById("startBingoEventBtn");
  const saveGuessKcSettingsBtn = document.getElementById("saveGuessKcSettingsBtn");
  const profileSearchBtn = document.getElementById("profileSearchBtn");
  const profileSearchInput = document.getElementById("profileSearchInput");
  const saveProfileOverrideBtn = document.getElementById("saveProfileOverrideBtn");
  const clearProfileOverrideBtn = document.getElementById("clearProfileOverrideBtn");
  const syncDiscordMembersBtn = document.getElementById("syncDiscordMembersBtn");
  const saveDiscordRankEmblemsBtn = document.getElementById("saveDiscordRankEmblemsBtn");
  const backfillCsvInput = document.getElementById("backfillCsvInput");
  const backfillEventSelect = document.getElementById("backfillEventSelect");
  const unlinkedEventSelect = document.getElementById("unlinkedEventSelect");
  const importBackfillBtn = document.getElementById("importBackfillBtn");

  // User Management must initialize independently of the Events admin controls.
  // Previously these listeners/status calls were below the Events guard, so if an
  // event control was missing or failed to initialize the Discord Sync card stayed
  // on "Checking…" and the Sync Now button had no click handler.
  if (profileSearchBtn) profileSearchBtn.addEventListener("click", searchMemberProfiles);
  if (profileSearchInput) {
    profileSearchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") searchMemberProfiles();
    });
  }
  if (saveProfileOverrideBtn) saveProfileOverrideBtn.addEventListener("click", () => saveProfileOverrides(false));
  if (clearProfileOverrideBtn) clearProfileOverrideBtn.addEventListener("click", () => saveProfileOverrides(true));
  if (syncDiscordMembersBtn) syncDiscordMembersBtn.addEventListener("click", syncDiscordMembersNow);
  if (saveDiscordRankEmblemsBtn) saveDiscordRankEmblemsBtn.addEventListener("click", saveDiscordRankEmblems);
  loadDiscordSyncStatus();
  if (backfillCsvInput) backfillCsvInput.addEventListener("change", handleBackfillCsvChange);
  if (backfillEventSelect) backfillEventSelect.addEventListener("change", async () => { await loadBackfillTrackedItems(); renderBackfillPreview(); });
  if (unlinkedEventSelect) unlinkedEventSelect.addEventListener("change", loadUnlinkedTrackedItems);
  if (importBackfillBtn) importBackfillBtn.addEventListener("click", importHistoricalDrops);

  // The rest of loadAdmin configures the Events tab. Do not let missing event
  // controls disable unrelated User Management functionality.
  if (!eventSelect || !addDropBtn || !saveEventBtn) {
    loadBingoSettings();
    loadGuessKcSettings();
    return;
  }

  try {
    allEvents = await fetchEvents();
    populateBackfillEventSelect();
  populateUnlinkedEventSelect();
  loadUnlinkedTrackedItems();
    renderPluginTrackingOverview();
    eventSelect.innerHTML = "";

    allEvents.forEach(event => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = getAdminEventOptionText(event);
      eventSelect.appendChild(option);
    });

    selectedEventId = eventSelect.value;
    populateEventFields();
    loadAdminDrops();

    eventSelect.addEventListener("change", () => {
      selectedEventId = eventSelect.value;
      populateEventFields();
      loadAdminDrops();
    });

    addDropBtn.addEventListener("click", addDrop);
    saveEventBtn.addEventListener("click", saveSelectedEvent);
    if (copyPluginEventIdBtn) copyPluginEventIdBtn.addEventListener("click", copySelectedPluginEventId);

    if (addMilestoneBtn) addMilestoneBtn.addEventListener("click", addMilestone);
    if (addPlacementRewardBtn) addPlacementRewardBtn.addEventListener("click", addPlacementReward);
    if (addParticipationRewardBtn) addParticipationRewardBtn.addEventListener("click", addParticipationReward);
    if (archiveEventBtn) archiveEventBtn.addEventListener("click", archiveSelectedEvent);
    if (previewWomBtn) previewWomBtn.addEventListener("click", previewWomDetails);
    if (saveBingoSettingsBtn) saveBingoSettingsBtn.addEventListener("click", saveBingoSettings);
    if (openBingoRegistrationBtn) {
      openBingoRegistrationBtn.addEventListener("click", () => applyBingoMode("registration"));
    }
    if (startBingoEventBtn) {
      startBingoEventBtn.addEventListener("click", () => {
        if (!confirm("Start Battleship Bingo now? This locks signups and sends users to the board from the Events page.")) return;
        applyBingoMode("started");
      });
    }
    if (saveGuessKcSettingsBtn) saveGuessKcSettingsBtn.addEventListener("click", saveGuessKcSettings);
    loadBingoSettings();
    loadGuessKcSettings();
  } catch (error) {
    document.body.insertAdjacentHTML("beforeend", `<p class="admin-error">${error.message}</p>`);
  }
}

async function saveSelectedEvent() {
  const event = getSelectedEvent();
  if (!event) return;

  event.description = document.getElementById("eventDescriptionInput").value.trim();
  event.womCompetitionId = isPvmEntryEvent(event) ? null : (document.getElementById("eventWomInput").value.trim() || null);
  const eventPasswordInput = document.getElementById("eventPasswordInput");
  event.eventPassword = eventPasswordInput?.value.trim() || null;

  const targetValue = document.getElementById("eventTargetInput").value;
  event.target = isClanGoalEvent(event) && targetValue ? Number(targetValue) : null;
  event.active = isPvmEntryEvent(event) ? true : document.getElementById("eventActiveInput").checked;
  event.featured = isPvmEntryEvent(event) ? false : document.getElementById("eventFeaturedInput").checked;
  event.dropsEnabled = isPvmEntryEvent(event) ? true : document.getElementById("eventDropsInput").checked;
  if (isPvmEntryEvent(event)) {
    event.pluginEventId = "pvm-entry";
    event.pluginOnly = true;
  }

  collectMilestonesFromEditor();
  collectRewardsFromEditor();

  // Ensure legacy bounty placement/participation rewards are not persisted.
  const eventsToSave = allEvents.map(item => {
    if (!isBountiesEvent(item) && !isPvmEntryEvent(item)) return item;
    const cleanItem = { ...item };
    delete cleanItem.rewards;
    return cleanItem;
  });

  const response = await fetch("/api/admin/events/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: eventsToSave })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    alert(data.error || "Could not save event.");
    return;
  }

  if (Array.isArray(data.events)) {
    const keepSelectedId = selectedEventId;
    allEvents = data.events;
    selectedEventId = keepSelectedId;
    populateBackfillEventSelect();
    populateUnlinkedEventSelect();
    loadUnlinkedTrackedItems();
    populateEventFields();

    const eventSelect = document.getElementById("adminEventSelect");
    if (eventSelect) {
      Array.from(eventSelect.options).forEach(option => {
        const updated = allEvents.find(item => item.id === option.value);
        if (updated) option.textContent = getAdminEventOptionText(updated);
      });
      eventSelect.value = keepSelectedId;
    }
  }

  alert("Event saved.");
}

async function archiveSelectedEvent() {
  const event = getSelectedEvent();

  if (!event) return;

  const confirmed = confirm(
    `End and archive "${event.title}"?\n\nThis will save the current standings snapshot and mark the event inactive.`
  );

  if (!confirmed) return;

  // Capture any unsaved edits before archiving.
  event.description = document.getElementById("eventDescriptionInput").value.trim();
  event.womCompetitionId = document.getElementById("eventWomInput").value.trim() || null;
  const eventPasswordInput = document.getElementById("eventPasswordInput");
  event.eventPassword = eventPasswordInput?.value.trim() || null;

  const targetValue = document.getElementById("eventTargetInput").value;
  event.target = isClanGoalEvent(event) && targetValue ? Number(targetValue) : null;
  event.active = document.getElementById("eventActiveInput").checked;
  event.featured = document.getElementById("eventFeaturedInput").checked;
  event.dropsEnabled = document.getElementById("eventDropsInput").checked;

  collectMilestonesFromEditor();
  collectRewardsFromEditor();

  const eventToArchive = { ...event };
  if (isBountiesEvent(eventToArchive)) delete eventToArchive.rewards;

  const eventsToArchive = allEvents.map(item => {
    if (!isBountiesEvent(item) && !isPvmEntryEvent(item)) return item;
    const cleanItem = { ...item };
    delete cleanItem.rewards;
    return cleanItem;
  });

  const response = await fetch("/api/admin/events/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: eventToArchive,
      events: eventsToArchive
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data.details ? `\n\n${data.details}` : "";
    alert(`${data.error || "Could not archive event."}${detail}`);
    return;
  }

  resetEventAfterArchive(event);

  const eventSelect = document.getElementById("adminEventSelect");
  const selectedOption = eventSelect?.querySelector(`option[value="${CSS.escape(event.id)}"]`);
  if (selectedOption) {
    selectedOption.textContent = getAdminEventOptionText(event);
  }

  populateEventFields();

  alert("Event archived and marked inactive.");
}

function formatDropTrackingRule(value) {
  const rule = String(value || "repeatable");
  if (rule === "once_per_player") return "Duplicate rule: Once per player";
  if (rule === "once_per_event") return "Duplicate rule: Once per event (clan-wide)";
  return "Duplicate rule: Count every drop";
}

async function loadAdminDrops() {
  const list = isBountiesEvent(getSelectedEvent())
    ? document.getElementById("adminBountiesList")
    : document.getElementById("adminDropsList");
  if (!list) return;

  if (!selectedEventId) {
    list.textContent = "No event selected.";
    return;
  }

  const response = await fetch(`/api/drops/list?eventId=${encodeURIComponent(selectedEventId)}`);
  const data = await response.json();

  list.innerHTML = "";

  if (!data.drops || data.drops.length === 0) {
    list.textContent = "No drops added yet.";
    return;
  }

  const pvmEntry = isPvmEntryEvent(getSelectedEvent());
  const bossOrder = [];
  if (pvmEntry) {
    data.drops.forEach(drop => {
      const boss = String(drop.boss || "").trim() || "Unassigned";
      if (!bossOrder.includes(boss)) bossOrder.push(boss);
    });
  }
  let previousBoss = null;
  data.drops.forEach((drop, index) => {
    const currentBoss = String(drop.boss || "").trim() || "Unassigned";
    if (pvmEntry && currentBoss !== previousBoss) {
      const bossIndex = bossOrder.indexOf(currentBoss);
      const header = document.createElement("div");
      header.className = "pvm-boss-header";
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 8px 6px;margin-top:8px;border-bottom:1px solid rgba(255,255,255,.12)";
      header.innerHTML = `
        <strong>${escapeHtml(currentBoss)}</strong>
        <span style="display:flex;gap:6px">
          <button type="button" data-boss-action="up" ${bossIndex <= 0 ? "disabled" : ""}>Move Boss ↑</button>
          <button type="button" data-boss-action="down" ${bossIndex < 0 || bossIndex >= bossOrder.length - 1 ? "disabled" : ""}>Move Boss ↓</button>
        </span>`;
      header.querySelector('[data-boss-action="up"]')?.addEventListener("click", () => updatePvmBossOrder(currentBoss, "up"));
      header.querySelector('[data-boss-action="down"]')?.addEventListener("click", () => updatePvmBossOrder(currentBoss, "down"));
      list.appendChild(header);
      previousBoss = currentBoss;
    }
    const row = document.createElement("div");
    row.className = "drop-row";
    const bossEditor = pvmEntry ? `
      <div class="pvm-boss-order-controls" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px">
        <input type="text" data-drop-boss value="${escapeHtml(drop.boss || "")}" placeholder="Boss name" style="min-width:140px" />
        <button type="button" data-drop-action="save-boss">Save Boss</button>
        <button type="button" data-drop-action="up" ${index === 0 || (String(data.drops[index - 1]?.boss || "").trim() || "Unassigned") !== currentBoss ? "disabled" : ""}>↑</button>
        <button type="button" data-drop-action="down" ${index === data.drops.length - 1 || (String(data.drops[index + 1]?.boss || "").trim() || "Unassigned") !== currentBoss ? "disabled" : ""}>↓</button>
      </div>` : "";
    row.innerHTML = `
      <div class="bounty-drop-main">
        ${drop.image ? `<img src="${escapeHtml(drop.image)}" alt="">` : ""}
        <span><strong>${escapeHtml(drop.name)}</strong><small>${pvmEntry ? `Boss: ${escapeHtml(drop.boss || "Unassigned")}` : ""}</small><small>${drop.itemId ? `Item ID ${Number(drop.itemId)}` : "Legacy item - re-add from search to enable RuneLite tracking"}</small><small>${Number(drop.rewardEmbers || 0)} Embers each</small><small>${formatDropTrackingRule(drop.trackingRule)}</small>${bossEditor}</span>
      </div>
      <div class="drop-controls">
        <strong>${drop.count}</strong>
        <button type="button" data-drop-action="delete">Delete</button>
      </div>
    `;

    row.querySelector('[data-drop-action="delete"]')?.addEventListener("click", () => deleteDrop(drop.name));
    row.querySelector('[data-drop-action="save-boss"]')?.addEventListener("click", () => updatePvmDropOrder(drop.name, { boss: row.querySelector('[data-drop-boss]')?.value || "" }));
    row.querySelector('[data-drop-action="up"]')?.addEventListener("click", () => updatePvmDropOrder(drop.name, { move: "up" }));
    row.querySelector('[data-drop-action="down"]')?.addEventListener("click", () => updatePvmDropOrder(drop.name, { move: "down" }));

    list.appendChild(row);
  });
}

async function updatePvmDropOrder(name, changes = {}) {
  if (!selectedEventId || !name) return;
  const response = await fetch("/api/drops/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: selectedEventId, name, ...changes })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { alert(data.error || "Could not update PvM Entry order."); return; }
  loadAdminDrops();
}

async function updatePvmBossOrder(boss, move) {
  if (!selectedEventId || !boss || !move) return;
  const response = await fetch("/api/drops/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: selectedEventId, boss, moveBoss: move })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { alert(data.error || "Could not update boss order."); return; }
  loadAdminDrops();
}

async function addDrop() {
  const input = document.getElementById("dropNameInput");
  const itemIdInput = document.getElementById("dropItemIdInput");
  const imageInput = document.getElementById("dropImageInput");
  const name = input.value.trim();
  const itemId = Number(itemIdInput?.value || 0);
  const trackingRule = String(document.getElementById("dropTrackingRuleInput")?.value || "repeatable");
  const rewardEmbers = Math.max(0, Math.floor(Number(document.getElementById("dropRewardInput")?.value || 0)));
  const boss = isPvmEntryEvent(getSelectedEvent()) ? String(document.getElementById("dropBossInput")?.value || "").trim() : "";
  if (!name || !selectedEventId) return;
  if (!Number.isInteger(itemId) || itemId <= 0) { alert("Select an OSRS item from the search results first."); return; }

  const response = await fetch("/api/drops/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: selectedEventId, name, itemId, image: imageInput?.value || "", wikiUrl: imageInput?.dataset.wikiUrl || "", rewardEmbers, trackingRule, boss })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { alert(data.error || "Could not add tracked item."); return; }
  if (data.supabaseWarning && data.supabaseWarning !== "not-configured") console.warn("Supabase sync warning:", data.supabaseWarning);

  input.value = "";
  if (itemIdInput) itemIdInput.value = "";
  if (imageInput) { imageInput.value = ""; imageInput.dataset.wikiUrl = ""; }
  const reward = document.getElementById("dropRewardInput");
  if (reward) reward.value = "";
  const bossInput = document.getElementById("dropBossInput");
  if (bossInput) bossInput.value = "";
  const idLookup = document.getElementById("dropItemIdLookupInput");
  if (idLookup) idLookup.value = "";
  const idStatus = document.getElementById("dropItemIdLookupStatus");
  if (idStatus) idStatus.textContent = "";
  const search = document.getElementById("dropItemSearchInput");
  if (search) search.value = "";
  const results = document.getElementById("dropWikiSearchResults");
  if (results) results.innerHTML = "";
  loadAdminDrops();
}

let standardDropWikiTimer = null;
async function searchStandardDropWiki(query) {
  const resultsEl = document.getElementById("dropWikiSearchResults");
  if (!resultsEl) return;
  if (!query || query.length < 2) { resultsEl.innerHTML = ""; return; }
  resultsEl.innerHTML = `<div class="wiki-loading">Searching...</div>`;
  try {
    const response = await fetch(`/api/osrs/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    const results = (Array.isArray(data) ? data : data.results || []).filter(item => item?.name && item?.image && Number(item?.id) > 0);
    resultsEl.innerHTML = results.length ? results.map(item => `
      <div class="wiki-result"><img src="${escapeHtml(item.image)}" alt=""><span class="wiki-result-name">${escapeHtml(item.name)}</span><button type="button" data-id="${Number(item.id)}" data-id="${Number(item.id || 0)}" data-name="${escapeHtml(item.name)}" data-image="${escapeHtml(item.image)}" data-url="${escapeHtml(item.url || "")}">Select</button></div>`).join("") : `<div class="wiki-loading">No RuneLite-trackable item results found.</div>`;
    resultsEl.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      document.getElementById("dropNameInput").value = button.dataset.name || "";
      document.getElementById("dropItemIdInput").value = button.dataset.id || "";
      const imageInput = document.getElementById("dropImageInput");
      imageInput.value = button.dataset.image || "";
      imageInput.dataset.wikiUrl = button.dataset.url || "";
      resultsEl.innerHTML = "";
    }));
  } catch { resultsEl.innerHTML = `<div class="wiki-loading">Could not search OSRS items.</div>`; }
}


async function lookupItemByExactId({ inputId, statusId, nameId, hiddenId, imageId, resultsId, datasetId = false }) {
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const itemId = Number(input?.value || 0);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    if (status) status.textContent = "Enter a valid positive OSRS item ID.";
    return;
  }
  if (status) status.textContent = "Looking up item ID...";
  try {
    const response = await fetch(`/api/osrs/item-id-search?q=${encodeURIComponent(itemId)}&t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Lookup failed.");
    const results = Array.isArray(data) ? data : [];
    const exact = results.find(item => Number(item?.id) === itemId && !item?.excluded);
    const replacement = results.find(item => item?.excluded && Number(item?.canonicalId) > 0);
    if (!exact) {
      if (replacement) {
        if (status) status.textContent = `ID ${itemId} is an alternate/variant item. Use canonical ID ${Number(replacement.canonicalId)} (${replacement.canonicalName || replacement.name}).`;
      } else if (status) {
        status.textContent = `No selectable canonical OSRS item found for ID ${itemId}.`;
      }
      return;
    }
    let enriched = exact;
    try {
      const wikiResponse = await fetch(`/api/osrs/search?q=${encodeURIComponent(exact.name || "")}&t=${Date.now()}`, { cache: "no-store" });
      const wikiData = await wikiResponse.json();
      const wikiResults = Array.isArray(wikiData) ? wikiData : wikiData?.results || [];
      enriched = wikiResults.find(item => Number(item?.id) === Number(exact.id)) || exact;
    } catch {}

    const nameInput = document.getElementById(nameId);
    if (nameInput) {
      nameInput.value = exact.name || "";
      if (datasetId) nameInput.dataset.itemId = String(exact.id);
    }
    if (!datasetId) {
      const idInput = document.getElementById(hiddenId);
      if (idInput) idInput.value = String(exact.id);
    }
    const imageInput = document.getElementById(imageId);
    if (imageInput) {
      imageInput.value = enriched.image || "";
      imageInput.dataset.wikiUrl = enriched.url || "";
    }
    const resultsEl = document.getElementById(resultsId);
    if (resultsEl) resultsEl.innerHTML = "";
    if (status) status.textContent = `Selected ${exact.name} (ID ${exact.id}).`;
  } catch (error) {
    if (status) status.textContent = error?.message || "Could not look up that OSRS item ID.";
  }
}

async function changeDrop(name, direction) {
  const endpoint = direction > 0 ? "/api/drops/increment" : "/api/drops/decrement";

  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: selectedEventId, name })
  });

  loadAdminDrops();
}

async function deleteDrop(name) {
  await fetch("/api/drops/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: selectedEventId, name })
  });

  loadAdminDrops();
}

let bountyWikiTimer = null;
async function searchBountyWiki(query) {
  const resultsEl = document.getElementById("bountyWikiSearchResults");
  if (!resultsEl) return;
  if (!query || query.length < 2) { resultsEl.innerHTML = ""; return; }
  resultsEl.innerHTML = `<div class="wiki-loading">Searching...</div>`;
  try {
    const response = await fetch(`/api/osrs/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    const results = (Array.isArray(data) ? data : data.results || []).filter(item => item?.name && item?.image);
    resultsEl.innerHTML = results.length ? results.map(item => `
      <div class="wiki-result"><img src="${escapeHtml(item.image)}" alt=""><span class="wiki-result-name">${escapeHtml(item.name)}</span><button type="button" data-id="${Number(item.id || 0)}" data-name="${escapeHtml(item.name)}" data-image="${escapeHtml(item.image)}" data-url="${escapeHtml(item.url || "")}">Select</button></div>`).join("") : `<div class="wiki-loading">No item results found.</div>`;
    resultsEl.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      document.getElementById("bountySelectedItemInput").value = button.dataset.name || "";
      document.getElementById("bountySelectedItemInput").dataset.itemId = button.dataset.id || "";
      document.getElementById("bountySelectedImageInput").value = button.dataset.image || "";
      document.getElementById("bountySelectedImageInput").dataset.wikiUrl = button.dataset.url || "";
      resultsEl.innerHTML = "";
    }));
  } catch { resultsEl.innerHTML = `<div class="wiki-loading">Could not search the OSRS Wiki.</div>`; }
}
async function addBountyItem() {
  const name = document.getElementById("bountySelectedItemInput")?.value.trim();
  const imageInput = document.getElementById("bountySelectedImageInput");
  const rewardEmbers = Number(document.getElementById("bountyRewardInput")?.value || 0);
  const trackingRule = String(document.getElementById("bountyTrackingRuleInput")?.value || "repeatable");
  if (!name || !selectedEventId) { alert("Select an OSRS item first."); return; }
  const itemId = Number(document.getElementById("bountySelectedItemInput")?.dataset.itemId || 0);
  if (!Number.isInteger(itemId) || itemId <= 0) { alert("Select an OSRS item from the search results first."); return; }
  const response = await fetch("/api/drops/add", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ eventId:selectedEventId, itemId, name, image:imageInput?.value || "", wikiUrl:imageInput?.dataset.wikiUrl || "", rewardEmbers, trackingRule }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { alert(data.error || "Could not add bounty."); return; }
  document.getElementById("bountySelectedItemInput").value = "";
  document.getElementById("bountySelectedItemInput").dataset.itemId = "";
  imageInput.value = "";
  document.getElementById("bountyRewardInput").value = "";
  const bountyIdLookup = document.getElementById("bountyItemIdLookupInput");
  if (bountyIdLookup) bountyIdLookup.value = "";
  const bountyIdStatus = document.getElementById("bountyItemIdLookupStatus");
  if (bountyIdStatus) bountyIdStatus.textContent = "";
  document.getElementById("bountyItemSearchInput").value = "";
  loadAdminDrops();
}

loadAdmin();

document.getElementById("dropItemSearchInput")?.addEventListener("input", event => { clearTimeout(standardDropWikiTimer); standardDropWikiTimer = setTimeout(() => searchStandardDropWiki(event.target.value.trim()), 250); });
document.getElementById("bountyItemSearchInput")?.addEventListener("input", event => { clearTimeout(bountyWikiTimer); bountyWikiTimer = setTimeout(() => searchBountyWiki(event.target.value.trim()), 250); });
document.getElementById("dropItemIdLookupBtn")?.addEventListener("click", () => lookupItemByExactId({ inputId:"dropItemIdLookupInput", statusId:"dropItemIdLookupStatus", nameId:"dropNameInput", hiddenId:"dropItemIdInput", imageId:"dropImageInput", resultsId:"dropWikiSearchResults" }));
document.getElementById("bountyItemIdLookupBtn")?.addEventListener("click", () => lookupItemByExactId({ inputId:"bountyItemIdLookupInput", statusId:"bountyItemIdLookupStatus", nameId:"bountySelectedItemInput", hiddenId:null, imageId:"bountySelectedImageInput", resultsId:"bountyWikiSearchResults", datasetId:true }));
document.getElementById("addBountyItemBtn")?.addEventListener("click", addBountyItem);


// ---- Event item spreadsheet import -------------------------------------------------
let pendingEventItemImportRows = [];

function normalizeImportHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_");
}

function normalizedImportRow(row) {
  const out = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    out[normalizeImportHeader(key)] = value;
  });
  return out;
}

function firstImportValue(row, aliases) {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeTrackingRuleForImport(value) {
  const raw = String(value || "repeatable").trim().toLowerCase().replace(/[\s\-]+/g, "_");
  if (["once_per_player", "onceplayer", "per_player", "player"].includes(raw)) return "once_per_player";
  if (["once_per_event", "onceevent", "per_event", "event"].includes(raw)) return "once_per_event";
  return "repeatable";
}

function parseRewardEmbersForImport(value) {
  const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function parseItemIdForImport(value) {
  const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function eventItemImportRowFromSheet(rawRow, rowNumber) {
  const row = normalizedImportRow(rawRow);
  return {
    rowNumber,
    websiteEventId: String(firstImportValue(row, ["website_event_id", "event_id", "eventid", "websiteeventid", "event"]) || "").trim(),
    itemId: parseItemIdForImport(firstImportValue(row, ["item_id", "osrs_item_id", "osrs_id", "itemid", "osrsid", "id"])),
    itemName: String(firstImportValue(row, ["item_name", "item", "name", "itemname"]) || "").trim(),
    rewardEmbers: parseRewardEmbersForImport(firstImportValue(row, ["reward_embers", "embers", "reward", "ember_reward", "rewardembers"])),
    trackingRule: normalizeTrackingRuleForImport(firstImportValue(row, ["tracking_rule", "tracking", "duplicate_rule", "rule", "trackingrule"])),
    imageUrl: String(firstImportValue(row, ["image_url", "image", "imageurl"]) || "").trim(),
    wikiUrl: String(firstImportValue(row, ["wiki_url", "wiki", "wikiurl", "url"]) || "").trim()
  };
}

function renderEventItemImportPreview(rows) {
  const status = document.getElementById("eventItemsImportStatus");
  const button = document.getElementById("importEventItemsBtn");
  if (!status || !button) return;

  if (!rows.length) {
    status.innerHTML = "No importable rows were found. Make sure the sheet has <code>item_id</code> and <code>item_name</code> columns.";
    button.disabled = true;
    return;
  }

  const valid = rows.filter(row => row.itemId && row.itemName);
  const invalid = rows.length - valid.length;
  const eventCounts = new Map();
  valid.forEach(row => {
    const key = row.websiteEventId || "(selected event)";
    eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
  });
  const summary = [...eventCounts.entries()].slice(0, 8).map(([eventId, count]) => `${escapeHtml(eventId)}: ${count}`).join(" · ");

  status.innerHTML = `<strong>${valid.length}</strong> importable item${valid.length === 1 ? "" : "s"}${invalid ? ` · ${invalid} row${invalid === 1 ? "" : "s"} skipped (missing item ID/name)` : ""}<br><small>${summary}</small>`;
  button.disabled = valid.length === 0;
}

async function readEventItemsImportFile(file) {
  if (!window.XLSX) throw new Error("Excel parser did not load. Refresh the admin page and try again.");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error("The workbook does not contain a worksheet.");
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  return rawRows.map((row, index) => eventItemImportRowFromSheet(row, index + 2));
}

async function handleEventItemsImportFile(event) {
  const file = event.target.files?.[0];
  const status = document.getElementById("eventItemsImportStatus");
  const button = document.getElementById("importEventItemsBtn");
  pendingEventItemImportRows = [];
  if (button) button.disabled = true;
  if (!file) {
    if (status) status.textContent = "Choose an Excel or CSV file to preview the import.";
    return;
  }

  if (status) status.textContent = `Reading ${file.name}...`;
  try {
    pendingEventItemImportRows = await readEventItemsImportFile(file);
    renderEventItemImportPreview(pendingEventItemImportRows);
  } catch (error) {
    if (status) status.textContent = error?.message || "Could not read that spreadsheet.";
  }
}

async function resolveImportedItemMedia(row) {
  if (row.imageUrl) {
    return { imageUrl: row.imageUrl, wikiUrl: row.wikiUrl || "" };
  }

  try {
    const response = await fetch(`/api/osrs/search?q=${encodeURIComponent(row.itemName)}`);
    if (!response.ok) return { imageUrl: "", wikiUrl: row.wikiUrl || "" };
    const data = await response.json().catch(() => []);
    const results = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);

    const exactId = results.find(item => Number(item?.id) === Number(row.itemId) && item?.image);
    const exactName = results.find(item => String(item?.name || "").trim().toLowerCase() === String(row.itemName || "").trim().toLowerCase() && item?.image);
    const selected = exactId || exactName || results.find(item => item?.image) || null;

    return {
      imageUrl: String(selected?.image || "").trim(),
      wikiUrl: row.wikiUrl || String(selected?.url || "").trim()
    };
  } catch {
    return { imageUrl: "", wikiUrl: row.wikiUrl || "" };
  }
}

async function importEventItemBatch(jobs) {
  // Resolve Wiki media up-front, then submit the whole spreadsheet in one
  // server request. The server performs a single read/merge/write per event,
  // so 19 rows cannot race and overwrite one another.
  const prepared = await Promise.all(jobs.map(async ({ row, targetEventId }) => {
    const media = await resolveImportedItemMedia(row);
    return {
      rowNumber: row.rowNumber,
      eventId: targetEventId,
      itemId: row.itemId,
      name: row.itemName,
      image: media.imageUrl,
      wikiUrl: media.wikiUrl,
      rewardEmbers: row.rewardEmbers,
      trackingRule: row.trackingRule,
      imageResolved: Boolean(media.imageUrl)
    };
  }));

  const response = await fetch("/api/drops/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: prepared })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return { ...data, prepared };
}

async function importEventItemsFromSpreadsheet() {
  const status = document.getElementById("eventItemsImportStatus");
  const button = document.getElementById("importEventItemsBtn");
  const useRowEvent = Boolean(document.getElementById("eventItemsImportUseRowEvent")?.checked);
  const validRows = pendingEventItemImportRows.filter(row => row.itemId && row.itemName);
  if (!validRows.length) return;
  if (!selectedEventId && !useRowEvent) {
    alert("Select an event first, or enable use of website_event_id from the spreadsheet.");
    return;
  }

  const knownEventIds = new Set((Array.isArray(allEvents) ? allEvents : []).map(event => String(event?.id || "").trim()).filter(Boolean));
  knownEventIds.add("pvm-entry");
  const jobs = [];
  const skipped = [];

  for (const row of validRows) {
    const targetEventId = useRowEvent && row.websiteEventId ? row.websiteEventId : selectedEventId;
    if (!targetEventId) {
      skipped.push(`Row ${row.rowNumber}: no target event`);
      continue;
    }
    if (knownEventIds.size && !knownEventIds.has(targetEventId)) {
      skipped.push(`Row ${row.rowNumber}: unknown event '${targetEventId}'`);
      continue;
    }
    jobs.push({ row, targetEventId });
  }

  if (!jobs.length) {
    if (status) status.innerHTML = `Nothing was imported. ${escapeHtml(skipped.join(" · "))}`;
    return;
  }

  if (button) button.disabled = true;
  if (status) status.textContent = `Resolving item images and importing all ${jobs.length} items...`;

  try {
    const result = await importEventItemBatch(jobs);
    const succeeded = Number(result.imported || result.updated || result.processed || jobs.length);
    const imagesResolved = result.prepared.filter(item => item.imageResolved).length;
    const failed = Array.isArray(result.failures) ? result.failures : [];
    const parts = [`Imported/updated ${succeeded} item${succeeded === 1 ? "" : "s"} in one batch.`];
    if (imagesResolved) parts.push(`Resolved ${imagesResolved} item image${imagesResolved === 1 ? "" : "s"}.`);
    if (skipped.length) parts.push(`Skipped ${skipped.length}.`);
    if (failed.length) parts.push(`Supabase sync warnings: ${failed.length}.`);
    if (status) {
      status.innerHTML = `<strong>${escapeHtml(parts.join(" "))}</strong>${failed.length ? `<br><small>${escapeHtml(failed.slice(0, 6).map(f => f.message || f.error || String(f)).join(" · "))}${failed.length > 6 ? " …" : ""}</small>` : ""}${skipped.length ? `<br><small>${escapeHtml(skipped.slice(0, 6).join(" · "))}${skipped.length > 6 ? " …" : ""}</small>` : ""}`;
    }
  } catch (error) {
    if (status) status.innerHTML = `<strong>Import failed.</strong><br><small>${escapeHtml(error?.message || "Could not import the spreadsheet.")}</small>`;
  } finally {
    if (button) button.disabled = false;
  }

  await loadAdminDrops();
}

function clearEventItemsImport() {
  pendingEventItemImportRows = [];
  const file = document.getElementById("eventItemsImportFile");
  const status = document.getElementById("eventItemsImportStatus");
  const button = document.getElementById("importEventItemsBtn");
  if (file) file.value = "";
  if (button) button.disabled = true;
  if (status) status.textContent = "Choose an Excel or CSV file to preview the import.";
}

document.getElementById("eventItemsImportFile")?.addEventListener("change", handleEventItemsImportFile);
document.getElementById("importEventItemsBtn")?.addEventListener("click", importEventItemsFromSpreadsheet);
document.getElementById("clearEventItemsImportBtn")?.addEventListener("click", clearEventItemsImport);


// -----------------------------------------------------------------------------
// Staff Handbook CMS
// -----------------------------------------------------------------------------
let handbookEditorLoaded = false;
let handbookEditorSections = [];
let handbookEditorMeta = { updatedAt: "", updatedBy: "" };

function handbookSlug(value, fallback = "section") {
  const slug = String(value || "")
    .trim().toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function handbookUniqueId(base, index, sections = handbookEditorSections) {
  const root = handbookSlug(base, `section-${index + 1}`);
  let candidate = root;
  let suffix = 2;
  const used = new Set(sections.map(section => section.id).filter(Boolean));
  while (used.has(candidate)) candidate = `${root}-${suffix++}`;
  return candidate;
}

function handbookSanitizeHtml(htmlValue) {
  const template = document.createElement("template");
  template.innerHTML = String(htmlValue || "");
  template.content.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,link,meta").forEach(node => node.remove());
  template.content.querySelectorAll("*").forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim();
      if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && /^javascript:/i.test(value)) node.removeAttribute(attr.name);
      if (name === "style") node.removeAttribute("style");
    });
  });
  return template.innerHTML;
}

function handbookTextToHtml(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let html = "";
  let listType = "";
  function closeList() {
    if (listType) html += `</${listType}>`;
    listType = "";
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const numbered = line.match(/^\d+[.)]\s+(.+)/);
    if (bullet) {
      if (listType !== "ul") { closeList(); html += "<ul>"; listType = "ul"; }
      html += `<li>${escapeHtml(bullet[1])}</li>`;
      continue;
    }
    if (numbered) {
      if (listType !== "ol") { closeList(); html += "<ol>"; listType = "ol"; }
      html += `<li>${escapeHtml(numbered[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${escapeHtml(line)}</p>`;
  }
  closeList();
  return html;
}

function handbookMarkdownInline(text) {
  let value = escapeHtml(text);
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return value;
}

function handbookMarkdownBodyToHtml(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let html = "";
  let listType = "";
  const closeList = () => {
    if (listType) html += `</${listType}>`;
    listType = "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const h = line.match(/^(#{3,6})\s+(.+)/);
    if (h) {
      closeList();
      const level = Math.min(4, h[1].length);
      html += `<h${level}>${handbookMarkdownInline(h[2])}</h${level}>`;
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)/);
    const number = line.match(/^\d+[.)]\s+(.+)/);
    if (bullet) {
      if (listType !== "ul") { closeList(); html += "<ul>"; listType = "ul"; }
      html += `<li>${handbookMarkdownInline(bullet[1])}</li>`;
      continue;
    }
    if (number) {
      if (listType !== "ol") { closeList(); html += "<ol>"; listType = "ol"; }
      html += `<li>${handbookMarkdownInline(number[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${handbookMarkdownInline(line)}</p>`;
  }
  closeList();
  return handbookSanitizeHtml(html);
}

function handbookSectionsFromMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const sections = [];
  let current = null;

  function flush() {
    if (!current) return;
    current.bodyHtml = handbookMarkdownBodyToHtml(current.lines.join("\n"));
    delete current.lines;
    sections.push(current);
  }

  for (const raw of lines) {
    const match = raw.match(/^#{1,2}\s+(.+)\s*$/);
    if (match) {
      flush();
      current = {
        id: handbookUniqueId(match[1], sections.length, sections),
        eyebrow: "",
        title: match[1].trim(),
        lines: [],
        images: [],
        visible: true
      };
    } else {
      if (!current) {
        current = {
          id: "overview",
          eyebrow: "",
          title: "Overview",
          lines: [],
          images: [],
          visible: true
        };
      }
      current.lines.push(raw);
    }
  }
  flush();
  return sections.filter(section => section.title || section.bodyHtml);
}

function handbookSectionsFromHtml(htmlValue) {
  const doc = new DOMParser().parseFromString(String(htmlValue || ""), "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed").forEach(node => node.remove());

  const existingArticles = [...doc.querySelectorAll("article.handbook-card")];
  if (existingArticles.length) {
    return existingArticles.map((article, index) => {
      const titleNode = article.querySelector("h1,h2");
      const eyebrowNode = article.querySelector(".eyebrow");
      const clone = article.cloneNode(true);
      clone.querySelector("h1,h2")?.remove();
      clone.querySelector(".eyebrow")?.remove();
      clone.querySelectorAll("img").forEach(img => img.remove());
      return {
        id: article.id || handbookUniqueId(titleNode?.textContent, index, []),
        eyebrow: eyebrowNode?.textContent?.trim() || "",
        title: titleNode?.textContent?.trim() || `Section ${index + 1}`,
        bodyHtml: handbookSanitizeHtml(clone.innerHTML),
        images: [],
        visible: true
      };
    });
  }

  const body = doc.body;
  const sections = [];
  let current = null;
  for (const node of [...body.childNodes]) {
    const isElement = node.nodeType === Node.ELEMENT_NODE;
    const nodeText = isElement ? String(node.textContent || "").trim() : "";
    const strongOnlyHeading = isElement
      && node.nodeName === "P"
      && nodeText.length > 0
      && nodeText.length <= 140
      && node.children.length >= 1
      && [...node.children].every(child => child.nodeName === "STRONG" || child.nodeName === "B");
    const isHeading = isElement && (/^(H1|H2)$/i.test(node.nodeName) || strongOnlyHeading);

    if (isHeading) {
      if (current) sections.push(current);
      const title = nodeText;
      current = {
        id: handbookUniqueId(title, sections.length, sections),
        eyebrow: "",
        title,
        bodyHtml: "",
        images: [],
        visible: true
      };
    } else {
      if (!current) current = { id: "overview", eyebrow: "", title: "Overview", bodyHtml: "", images: [], visible: true };
      if (isElement) current.bodyHtml += node.outerHTML;
      else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) current.bodyHtml += `<p>${escapeHtml(node.textContent.trim())}</p>`;
    }
  }
  if (current) sections.push(current);
  sections.forEach(section => { section.bodyHtml = handbookSanitizeHtml(section.bodyHtml); });
  return sections;
}

async function handbookLoadFallbackSections() {
  const response = await fetch("/staff-handbook.html", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the current handbook fallback.");
  const text = await response.text();
  const sections = handbookSectionsFromHtml(text);
  if (!sections.length) throw new Error("The current handbook did not contain any editable sections.");
  return sections;
}

function handbookCollectEditor() {
  document.querySelectorAll(".handbook-section-editor").forEach((card, index) => {
    if (!handbookEditorSections[index]) return;
    const section = handbookEditorSections[index];
    section.eyebrow = card.querySelector("[data-handbook-eyebrow]")?.value.trim() || "";
    section.title = card.querySelector("[data-handbook-title]")?.value.trim() || `Section ${index + 1}`;
    section.bodyHtml = handbookSanitizeHtml(card.querySelector("[data-handbook-body]")?.innerHTML || "");
    section.visible = Boolean(card.querySelector("[data-handbook-visible]")?.checked);
    if (!section.id) section.id = handbookUniqueId(section.title, index);
  });
}

function handbookRenderImages(section, index) {
  if (!section.images?.length) return '<p class="admin-muted">No screenshots attached to this section.</p>';
  return `<div class="handbook-admin-image-grid">${section.images.map((image, imageIndex) => `
    <div class="handbook-admin-image-card">
      <img src="/api/handbook-image?path=${encodeURIComponent(image.path)}" alt="${escapeHtml(image.caption || section.title || "Handbook screenshot")}" loading="lazy" />
      <input type="text" value="${escapeHtml(image.caption || "")}" data-handbook-image-caption="${imageIndex}" placeholder="Screenshot caption" />
      <button type="button" class="btn secondary handbook-remove-image-btn" data-section-index="${index}" data-image-index="${imageIndex}">Remove Image</button>
    </div>
  `).join("")}</div>`;
}

function handbookRenderEditor() {
  const container = document.getElementById("handbookSectionsEditor");
  if (!container) return;
  if (!handbookEditorSections.length) {
    container.innerHTML = '<div class="admin-info-box">No sections yet. Click <strong>+ Add Section</strong> or import a handbook file.</div>';
    return;
  }

  container.innerHTML = handbookEditorSections.map((section, index) => `
    <section class="handbook-section-editor" data-section-index="${index}">
      <div class="handbook-section-editor-head">
        <div>
          <span class="handbook-section-number">Section ${index + 1}</span>
          <strong>${escapeHtml(section.title || `Section ${index + 1}`)}</strong>
        </div>
        <div class="handbook-section-actions">
          <button type="button" class="btn secondary handbook-move-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn secondary handbook-move-down" data-index="${index}" ${index === handbookEditorSections.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn secondary handbook-delete-section" data-index="${index}">Delete</button>
        </div>
      </div>

      <div class="admin-form-grid">
        <div class="admin-field">
          <label>Eyebrow / Category</label>
          <input type="text" data-handbook-eyebrow value="${escapeHtml(section.eyebrow || "")}" placeholder="Example: Work Instruction" />
        </div>
        <div class="admin-field">
          <label>Section title</label>
          <input type="text" data-handbook-title value="${escapeHtml(section.title || "")}" />
        </div>
        <div class="admin-field">
          <label><input type="checkbox" data-handbook-visible ${section.visible !== false ? "checked" : ""} /> Show this section</label>
        </div>
      </div>

      <label class="handbook-editor-label">Content</label>
      <div class="handbook-rich-editor" data-handbook-body contenteditable="true">${handbookSanitizeHtml(section.bodyHtml || "")}</div>
      <p class="admin-muted">Paste formatted text here. Basic headings, lists, links, bold, and italics are preserved.</p>

      <div class="handbook-section-media">
        <div class="handbook-media-header">
          <div>
            <strong>Screenshots</strong>
            <p class="admin-muted">PNG, JPG, WEBP, or GIF up to 6 MB.</p>
          </div>
          <label class="btn secondary handbook-upload-label">
            Upload Screenshot
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-handbook-image-upload="${index}" hidden />
          </label>
        </div>
        ${handbookRenderImages(section, index)}
      </div>
    </section>
  `).join("");

  container.querySelectorAll(".handbook-move-up").forEach(button => button.addEventListener("click", () => handbookMoveSection(Number(button.dataset.index), -1)));
  container.querySelectorAll(".handbook-move-down").forEach(button => button.addEventListener("click", () => handbookMoveSection(Number(button.dataset.index), 1)));
  container.querySelectorAll(".handbook-delete-section").forEach(button => button.addEventListener("click", () => handbookDeleteSection(Number(button.dataset.index))));
  container.querySelectorAll("[data-handbook-image-upload]").forEach(input => input.addEventListener("change", event => handbookUploadImage(Number(input.dataset.handbookImageUpload), event.target.files?.[0])));
  container.querySelectorAll(".handbook-remove-image-btn").forEach(button => button.addEventListener("click", () => handbookRemoveImage(Number(button.dataset.sectionIndex), Number(button.dataset.imageIndex))));
  container.querySelectorAll("[data-handbook-image-caption]").forEach(input => input.addEventListener("change", () => {
    const card = input.closest(".handbook-section-editor");
    const sectionIndex = Number(card?.dataset.sectionIndex);
    const imageIndex = Number(input.dataset.handbookImageCaption);
    if (handbookEditorSections[sectionIndex]?.images?.[imageIndex]) handbookEditorSections[sectionIndex].images[imageIndex].caption = input.value.trim();
  }));
}

async function handbookLoadEditor(force = false) {
  if (handbookEditorLoaded && !force) return;
  const status = document.getElementById("handbookEditorStatus");
  if (status) status.textContent = "Loading handbook…";
  try {
    const response = await fetch("/api/admin/handbook", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load handbook.");

    const handbook = data.handbook;
    if (handbook?.document?.sections?.length) {
      handbookEditorSections = handbook.document.sections.map(section => ({
        id: String(section.id || ""),
        eyebrow: String(section.eyebrow || ""),
        title: String(section.title || ""),
        bodyHtml: handbookSanitizeHtml(section.bodyHtml || ""),
        images: Array.isArray(section.images) ? section.images : [],
        visible: section.visible !== false
      }));
      const titleInput = document.getElementById("handbookTitleInput");
      if (titleInput) titleInput.value = handbook.title || "Staff Handbook";
      handbookEditorMeta.updatedAt = handbook.updated_at || "";
      handbookEditorMeta.updatedBy = handbook.updated_by || "";
      if (status) status.textContent = `Loaded saved handbook${handbook.updated_by ? ` · Last updated by ${handbook.updated_by}` : ""}.`;
    } else {
      handbookEditorSections = await handbookLoadFallbackSections();
      if (status) status.textContent = "Loaded the current code-based handbook as your starting point. Click Save Handbook once to move it into the editor system.";
    }

    handbookEditorLoaded = true;
    handbookRenderEditor();
  } catch (error) {
    if (status) status.textContent = error.message || "Could not load handbook.";
  }
}

function handbookAddSection() {
  handbookCollectEditor();
  const index = handbookEditorSections.length;
  handbookEditorSections.push({
    id: handbookUniqueId(`section-${index + 1}`, index),
    eyebrow: "",
    title: "New Section",
    bodyHtml: "<p>Add handbook instructions here.</p>",
    images: [],
    visible: true
  });
  handbookRenderEditor();
  document.querySelector(".handbook-section-editor:last-child")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handbookMoveSection(index, direction) {
  handbookCollectEditor();
  const next = index + direction;
  if (index < 0 || next < 0 || index >= handbookEditorSections.length || next >= handbookEditorSections.length) return;
  [handbookEditorSections[index], handbookEditorSections[next]] = [handbookEditorSections[next], handbookEditorSections[index]];
  handbookRenderEditor();
}

function handbookDeleteSection(index) {
  if (!handbookEditorSections[index]) return;
  const title = handbookEditorSections[index].title || `Section ${index + 1}`;
  if (!confirm(`Delete "${title}" from the handbook editor? This is not live until you click Save Handbook.`)) return;
  handbookCollectEditor();
  handbookEditorSections.splice(index, 1);
  handbookRenderEditor();
}

async function handbookUploadImage(sectionIndex, file) {
  if (!file || !handbookEditorSections[sectionIndex]) return;
  handbookCollectEditor();
  const status = document.getElementById("handbookEditorStatus");
  if (status) status.textContent = `Uploading ${file.name}…`;
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/admin/handbook-image", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not upload image.");
    handbookEditorSections[sectionIndex].images = handbookEditorSections[sectionIndex].images || [];
    handbookEditorSections[sectionIndex].images.push({ path: data.path, caption: "" });
    handbookRenderEditor();
    if (status) status.textContent = "Screenshot uploaded. Click Save Handbook to publish the section changes.";
  } catch (error) {
    if (status) status.textContent = error.message || "Could not upload image.";
  }
}

async function handbookRemoveImage(sectionIndex, imageIndex) {
  handbookCollectEditor();
  const image = handbookEditorSections[sectionIndex]?.images?.[imageIndex];
  if (!image) return;
  if (!confirm("Remove this screenshot from the handbook?")) return;

  handbookEditorSections[sectionIndex].images.splice(imageIndex, 1);
  handbookRenderEditor();
  // Remove the stored object as best effort. The handbook save is separate.
  fetch("/api/admin/handbook-image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: image.path })
  }).catch(() => {});
}

async function handbookSave() {
  handbookCollectEditor();
  const status = document.getElementById("handbookEditorStatus");
  const button = document.getElementById("handbookSaveBtn");
  if (!handbookEditorSections.length) {
    alert("Add at least one handbook section before saving.");
    return;
  }
  if (button) button.disabled = true;
  if (status) status.textContent = "Saving handbook…";

  try {
    // Rebuild stable, unique IDs before save.
    const used = new Set();
    handbookEditorSections.forEach((section, index) => {
      const root = handbookSlug(section.id || section.title, `section-${index + 1}`);
      let candidate = root;
      let suffix = 2;
      while (used.has(candidate)) candidate = `${root}-${suffix++}`;
      used.add(candidate);
      section.id = candidate;
    });

    const response = await fetch("/api/admin/handbook", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: document.getElementById("handbookTitleInput")?.value.trim() || "Staff Handbook",
        document: { version: 1, sections: handbookEditorSections }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not save handbook.");

    handbookEditorLoaded = false;
    await handbookLoadEditor(true);
    if (status) status.textContent = `Saved. The live staff handbook now uses this version${data.handbook?.updated_by ? ` · Updated by ${data.handbook.updated_by}` : ""}.`;
  } catch (error) {
    if (status) status.textContent = error.message || "Could not save handbook.";
  } finally {
    if (button) button.disabled = false;
  }
}

async function handbookImportFile() {
  const input = document.getElementById("handbookImportFile");
  const status = document.getElementById("handbookImportStatus");
  const file = input?.files?.[0];
  if (!file) {
    if (status) status.textContent = "Choose a handbook file first.";
    return;
  }

  if (status) status.textContent = `Reading ${file.name}…`;
  try {
    const name = file.name.toLowerCase();
    let sections = [];
    let importedTitle = "";

    if (name.endsWith(".json")) {
      const parsed = JSON.parse(await file.text());
      const source = parsed.handbook?.document || parsed.document || parsed;
      sections = Array.isArray(source.sections) ? source.sections.map(section => ({
        id: String(section.id || ""),
        eyebrow: String(section.eyebrow || ""),
        title: String(section.title || ""),
        bodyHtml: handbookSanitizeHtml(section.bodyHtml || ""),
        images: Array.isArray(section.images) ? section.images : [],
        visible: section.visible !== false
      })) : [];
      importedTitle = parsed.handbook?.title || parsed.title || "";
    } else if (name.endsWith(".docx")) {
      if (!window.mammoth) throw new Error("The DOCX importer did not load. Refresh the page and try again.");
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      sections = handbookSectionsFromHtml(result.value);
      if (result.messages?.length && status) {
        status.textContent = `DOCX converted with ${result.messages.length} note(s). Review the imported formatting before saving.`;
      }
    } else if (name.endsWith(".html") || name.endsWith(".htm")) {
      sections = handbookSectionsFromHtml(await file.text());
    } else if (name.endsWith(".md") || name.endsWith(".markdown")) {
      sections = handbookSectionsFromMarkdown(await file.text());
    } else if (name.endsWith(".txt")) {
      const text = await file.text();
      sections = [{
        id: "overview",
        eyebrow: "",
        title: file.name.replace(/\.[^.]+$/, "") || "Imported Handbook",
        bodyHtml: handbookTextToHtml(text),
        images: [],
        visible: true
      }];
    } else {
      throw new Error("Supported handbook files: DOCX, Markdown, TXT, HTML, and JSON.");
    }

    sections = sections.filter(section => String(section.title || "").trim() || String(section.bodyHtml || "").trim());
    if (!sections.length) throw new Error("No handbook sections could be found in that file.");

    handbookEditorSections = sections.map((section, index) => ({
      id: section.id || handbookUniqueId(section.title, index, sections),
      eyebrow: String(section.eyebrow || ""),
      title: String(section.title || `Section ${index + 1}`),
      bodyHtml: handbookSanitizeHtml(section.bodyHtml || ""),
      images: Array.isArray(section.images) ? section.images : [],
      visible: section.visible !== false
    }));
    if (importedTitle) {
      const titleInput = document.getElementById("handbookTitleInput");
      if (titleInput) titleInput.value = importedTitle;
    }
    handbookEditorLoaded = true;
    handbookRenderEditor();
    if (status) status.textContent = `Imported ${sections.length} section${sections.length === 1 ? "" : "s"} from ${file.name}. Review them below, then click Save Handbook to publish.`;
  } catch (error) {
    if (status) status.textContent = error.message || "Could not import handbook file.";
  }
}

function handbookExportJson() {
  handbookCollectEditor();
  const payload = {
    title: document.getElementById("handbookTitleInput")?.value.trim() || "Staff Handbook",
    document: { version: 1, sections: handbookEditorSections }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ironkin-staff-handbook-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function setupHandbookEditor() {
  document.querySelectorAll('[data-admin-tab="handbook"]').forEach(button => {
    button.addEventListener("click", () => handbookLoadEditor());
  });
  document.getElementById("handbookAddSectionBtn")?.addEventListener("click", handbookAddSection);
  document.getElementById("handbookSaveBtn")?.addEventListener("click", handbookSave);
  document.getElementById("handbookImportBtn")?.addEventListener("click", handbookImportFile);
  document.getElementById("handbookExportBtn")?.addEventListener("click", handbookExportJson);
}

setupHandbookEditor();


/* Integrated admin UX overhaul — 2026-08-26 */
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  function eventLabel(){
    const sel = $('#adminEventSelect');
    const txt = sel?.selectedOptions?.[0]?.textContent?.trim() || 'Event';
    const event = (window.allEvents || []).find?.(x => x.id === sel?.value);
    return { name: txt, type: event?.type || sel?.value || 'event' };
  }
  function updateEventContext(){
    const {name,type}=eventLabel();
    const nameEl=$('#luxEventName'), typeEl=$('#luxEventType');
    if(nameEl) nameEl.textContent=name;
    if(typeEl) typeEl.textContent=String(type).replaceAll('-',' ').replace(/\b\w/g,m=>m.toUpperCase());
    const active=$('#eventActiveInput')?.checked?'Active':'Inactive';
    const featured=$('#eventFeaturedInput')?.checked?'Featured':'Standard';
    const drops=$('#eventDropsInput')?.checked?'Tracking On':'Tracking Off';
    const vals=[['luxState',active],['luxFeatured',featured],['luxTracking',drops]];
    vals.forEach(([id,v])=>{const el=$('#'+id);if(el)el.textContent=v;});
  }
  function setStandardView(view){
    const core=$('#standardEventEditor'), drops=$('#standardDropsEditor'), bounty=$('#bountiesEditor'), imp=$('#eventItemImportCard');
    if(!core)return;
    $$('.lux-segmented [data-lux-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.luxView===view));
    [drops,bounty,imp].forEach(el=>el?.classList.add('lux-section-hidden'));
    const rewardNodes=['#eventRewardsDivider','#eventRewardsHeader','#eventRewardsGrid'];
    const goalNodes=['#targetSection','#milestonesSection'];
    const configFields=$$('#standardEventEditor > .admin-form-grid > .admin-field').filter(el=>!el.matches('#targetSection,#milestonesSection'));
    rewardNodes.concat(goalNodes).forEach(s=>$(s)?.classList.remove('lux-section-hidden'));
    configFields.forEach(el=>el.classList.remove('lux-section-hidden'));
    // Each workspace exposes only the controls relevant to that task. Global status/save controls remain available.
    if(view==='setup'){
      rewardNodes.concat(goalNodes).forEach(s=>$(s)?.classList.add('lux-section-hidden'));
    } else if(view==='rewards'){
      configFields.forEach(el=>el.classList.add('lux-section-hidden'));
    } else if(view==='items'){
      rewardNodes.concat(goalNodes).forEach(s=>$(s)?.classList.add('lux-section-hidden'));
      configFields.forEach(el=>el.classList.add('lux-section-hidden'));
      drops?.classList.remove('lux-section-hidden');
      bounty?.classList.remove('lux-section-hidden');
    } else if(view==='import'){
      rewardNodes.concat(goalNodes).forEach(s=>$(s)?.classList.add('lux-section-hidden'));
      configFields.forEach(el=>el.classList.add('lux-section-hidden'));
      imp?.classList.remove('lux-section-hidden');
    }
    sessionStorage.setItem('ironkinAdminEventView',view);
  }
  function enhanceStandard(){
    const panel=$('#eventSubtab-standard');
    if(!panel || $('#luxEventToolbar')) return;
    const toolbar=document.createElement('div');
    toolbar.id='luxEventToolbar'; toolbar.className='lux-event-toolbar';
    toolbar.innerHTML=`<div class="lux-event-context"><div class="lux-event-icon">IK</div><div><strong id="luxEventName">Event</strong><small id="luxEventType">Event</small></div></div><div class="lux-segmented" role="tablist" aria-label="Event editor sections"><button type="button" data-lux-view="setup">Setup</button><button type="button" data-lux-view="rewards">Rewards & Milestones</button><button type="button" data-lux-view="items">Tracked Items</button><button type="button" data-lux-view="import">Data Import</button></div>`;
    panel.prepend(toolbar);
    const summary=document.createElement('div'); summary.className='lux-standard-summary';
    summary.innerHTML=`<div class="lux-summary-tile"><span>Status</span><strong id="luxState">—</strong></div><div class="lux-summary-tile"><span>Homepage</span><strong id="luxFeatured">—</strong></div><div class="lux-summary-tile"><span>Item tracking</span><strong id="luxTracking">—</strong></div><div class="lux-summary-tile"><span>WOM competition</span><strong id="luxWom">—</strong></div>`;
    toolbar.after(summary);
    toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-lux-view]');if(b)setStandardView(b.dataset.luxView)});
    $('#adminEventSelect')?.addEventListener('change',()=>setTimeout(()=>{updateEventContext(); const w=$('#luxWom'); if(w)w.textContent=$('#eventWomInput')?.value||'Not linked';},0));
    ['eventActiveInput','eventFeaturedInput','eventDropsInput','eventWomInput'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{updateEventContext(); const w=$('#luxWom'); if(w)w.textContent=$('#eventWomInput')?.value||'Not linked';}));
    updateEventContext(); const w=$('#luxWom'); if(w)w.textContent=$('#eventWomInput')?.value||'Not linked';
    setStandardView(sessionStorage.getItem('ironkinAdminEventView')||'setup');
  }
  function polishShortPanels(){
    ['#eventSubtab-bingo','#eventSubtab-guess-kc'].forEach(s=>{const p=$(s);if(p)p.classList.add('lux-event-shell')});
  }
  document.addEventListener('DOMContentLoaded',()=>{enhanceStandard();polishShortPanels();});
  setTimeout(()=>{enhanceStandard();polishShortPanels();},500);
})();
