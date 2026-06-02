let selectedEventId = null;
let allEvents = [];

async function fetchEvents() {
  const response = await fetch("/api/current-events");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not load events.");
  }

  return data.events || [];
}

function getSelectedEvent() {
  return allEvents.find(event => event.id === selectedEventId);
}

function formatAdminDate(value) {
  if (!value) return "Dates not loaded yet.";

  return new Date(value).toLocaleDateString();
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
  const showGoalFields = isClanGoalEvent(event);

  if (targetSection) targetSection.style.display = showGoalFields ? "grid" : "none";
  if (milestonesSection) milestonesSection.style.display = showGoalFields ? "grid" : "none";
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

  document.getElementById("eventDescriptionInput").value = event.description || "";
  document.getElementById("eventWomInput").value = event.womCompetitionId || "";
  document.getElementById("eventTargetInput").value = event.target || "";
  updateDetectedWomBox(event);
  document.getElementById("eventActiveInput").checked = Boolean(event.active);
  document.getElementById("eventFeaturedInput").checked = Boolean(event.featured);
  document.getElementById("eventDropsInput").checked = Boolean(event.dropsEnabled);

  updateEventFieldVisibility();
  renderMilestonesEditor();
  renderRewardsEditor();
}

async function loadAdmin() {
  const eventSelect = document.getElementById("adminEventSelect");
  const addDropBtn = document.getElementById("addDropBtn");
  const saveEventBtn = document.getElementById("saveEventBtn");
  const addMilestoneBtn = document.getElementById("addMilestoneBtn");
  const addPlacementRewardBtn = document.getElementById("addPlacementRewardBtn");
  const addParticipationRewardBtn = document.getElementById("addParticipationRewardBtn");
  const archiveEventBtn = document.getElementById("archiveEventBtn");
  const previewWomBtn = document.getElementById("previewWomBtn");

  if (!eventSelect || !addDropBtn || !saveEventBtn) return;

  try {
    allEvents = await fetchEvents();
    eventSelect.innerHTML = "";

    allEvents.forEach(event => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = `${event.label || event.type} — ${event.title}`;
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

    if (addMilestoneBtn) addMilestoneBtn.addEventListener("click", addMilestone);
    if (addPlacementRewardBtn) addPlacementRewardBtn.addEventListener("click", addPlacementReward);
    if (addParticipationRewardBtn) addParticipationRewardBtn.addEventListener("click", addParticipationReward);
    if (archiveEventBtn) archiveEventBtn.addEventListener("click", archiveSelectedEvent);
    if (previewWomBtn) previewWomBtn.addEventListener("click", previewWomDetails);
  } catch (error) {
    document.body.insertAdjacentHTML("beforeend", `<p class="admin-error">${error.message}</p>`);
  }
}

async function saveSelectedEvent() {
  const event = getSelectedEvent();
  if (!event) return;

  event.description = document.getElementById("eventDescriptionInput").value.trim();
  event.womCompetitionId = document.getElementById("eventWomInput").value.trim() || null;

  const targetValue = document.getElementById("eventTargetInput").value;
  event.target = isClanGoalEvent(event) && targetValue ? Number(targetValue) : null;
  event.active = document.getElementById("eventActiveInput").checked;
  event.featured = document.getElementById("eventFeaturedInput").checked;
  event.dropsEnabled = document.getElementById("eventDropsInput").checked;

  collectMilestonesFromEditor();
  collectRewardsFromEditor();

  const response = await fetch("/api/admin/events/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: allEvents })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Could not save event.");
    return;
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

  const targetValue = document.getElementById("eventTargetInput").value;
  event.target = isClanGoalEvent(event) && targetValue ? Number(targetValue) : null;
  event.active = document.getElementById("eventActiveInput").checked;
  event.featured = document.getElementById("eventFeaturedInput").checked;
  event.dropsEnabled = document.getElementById("eventDropsInput").checked;

  collectMilestonesFromEditor();
  collectRewardsFromEditor();

  const response = await fetch("/api/admin/events/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      events: allEvents
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    alert(data.error || "Could not archive event.");
    return;
  }

  event.active = false;
  event.featured = false;

  populateEventFields();

  alert("Event archived and marked inactive.");
}

async function loadAdminDrops() {
  const list = document.getElementById("adminDropsList");
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

  data.drops.forEach(drop => {
    const row = document.createElement("div");
    row.className = "drop-row";
    row.innerHTML = `
      <span>${drop.name}</span>
      <div class="drop-controls">
        <button onclick="changeDrop('${drop.name}', -1)">−</button>
        <strong>${drop.count}</strong>
        <button onclick="changeDrop('${drop.name}', 1)">+</button>
        <button onclick="deleteDrop('${drop.name}')">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });
}

async function addDrop() {
  const input = document.getElementById("dropNameInput");
  const name = input.value.trim();
  if (!name || !selectedEventId) return;

  await fetch("/api/drops/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: selectedEventId, name })
  });

  input.value = "";
  loadAdminDrops();
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

loadAdmin();
