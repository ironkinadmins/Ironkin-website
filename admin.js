let selectedEventId = null;
let allEvents = [];

async function fetchEvents() {
  const response = await fetch("/api/current-events");
  const data = await response.json();

  return data.events || [];
}

function getSelectedEvent() {
  return allEvents.find(event => event.id === selectedEventId);
}

function renderMilestonesEditor() {
  const editor = document.getElementById("milestonesEditor");
  const event = getSelectedEvent();

  if (!editor || !event) return;

  const milestones = event.milestones || [];

  editor.innerHTML = "";

  milestones.forEach((milestone, index) => {
    const row = document.createElement("div");
    row.className = "milestone-editor-row";

    row.innerHTML = `
      <input
        type="number"
        min="0"
        max="100"
        value="${milestone.percent || ""}"
        placeholder="%"
        data-milestone-percent="${index}"
      />

      <input
        type="text"
        value="${milestone.title || ""}"
        placeholder="Reward"
        data-milestone-title="${index}"
      />

      <button type="button" onclick="removeMilestone(${index})">
        Remove
      </button>
    `;

    editor.appendChild(row);
  });
}

function collectMilestonesFromEditor() {
  const event = getSelectedEvent();

  if (!event) return;

  const percentInputs = document.querySelectorAll("[data-milestone-percent]");
  const titleInputs = document.querySelectorAll("[data-milestone-title]");

  const milestones = [];

  percentInputs.forEach((percentInput, index) => {
    const percent = Number(percentInput.value);
    const title = titleInputs[index]?.value.trim();

    if (percent && title) {
      milestones.push({
        percent,
        title
      });
    }
  });

  milestones.sort((a, b) => a.percent - b.percent);

  event.milestones = milestones;
}

function addMilestone() {
  const event = getSelectedEvent();

  if (!event) return;

  if (!Array.isArray(event.milestones)) {
    event.milestones = [];
  }

  event.milestones.push({
    percent: 100,
    title: ""
  });

  renderMilestonesEditor();
}

function removeMilestone(index) {
  const event = getSelectedEvent();

  if (!event || !Array.isArray(event.milestones)) return;

  event.milestones.splice(index, 1);

  renderMilestonesEditor();
}

function populateEventFields() {
  const event = getSelectedEvent();

  if (!event) return;

  document.getElementById("eventTitleInput").value =
    event.title || "";

  document.getElementById("eventDescriptionInput").value =
    event.description || "";

  document.getElementById("eventWomInput").value =
    event.womCompetitionId || "";

  document.getElementById("eventTargetInput").value =
    event.target || "";

  document.getElementById("eventStartInput").value =
    event.startDate || "";

  document.getElementById("eventEndInput").value =
    event.endDate || "";

  document.getElementById("eventActiveInput").checked =
    Boolean(event.active);

  document.getElementById("eventFeaturedInput").checked =
    Boolean(event.featured);

  document.getElementById("eventDropsInput").checked =
    Boolean(event.dropsEnabled);

  renderMilestonesEditor();
}

async function loadAdmin() {
  const eventSelect = document.getElementById("adminEventSelect");
  const addDropBtn = document.getElementById("addDropBtn");
  const saveEventBtn = document.getElementById("saveEventBtn");
  const addMilestoneBtn = document.getElementById("addMilestoneBtn");

  if (!eventSelect || !addDropBtn || !saveEventBtn) return;

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

  if (addMilestoneBtn) {
    addMilestoneBtn.addEventListener("click", addMilestone);
  }
}

async function saveSelectedEvent() {
  const event = getSelectedEvent();

  if (!event) return;

  event.title =
    document.getElementById("eventTitleInput").value.trim();

  event.description =
    document.getElementById("eventDescriptionInput").value.trim();

  event.womCompetitionId =
    document.getElementById("eventWomInput").value.trim() || null;

  const targetValue =
    document.getElementById("eventTargetInput").value;

  event.target = targetValue
    ? Number(targetValue)
    : null;

  event.startDate =
    document.getElementById("eventStartInput").value || null;

  event.endDate =
    document.getElementById("eventEndInput").value || null;

  event.active =
    document.getElementById("eventActiveInput").checked;

  event.featured =
    document.getElementById("eventFeaturedInput").checked;

  event.dropsEnabled =
    document.getElementById("eventDropsInput").checked;

  collectMilestonesFromEditor();

  await fetch("/api/admin/events/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      events: allEvents
    })
  });

  alert("Event saved.");
}

async function loadAdminDrops() {
  const list = document.getElementById("adminDropsList");

  if (!list) return;

  if (!selectedEventId) {
    list.textContent = "No event selected.";
    return;
  }

  const response = await fetch(
    `/api/drops/list?eventId=${encodeURIComponent(selectedEventId)}`
  );

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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      eventId: selectedEventId,
      name
    })
  });

  input.value = "";
  loadAdminDrops();
}

async function changeDrop(name, direction) {
  const endpoint =
    direction > 0
      ? "/api/drops/increment"
      : "/api/drops/decrement";

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      eventId: selectedEventId,
      name
    })
  });

  loadAdminDrops();
}

async function deleteDrop(name) {
  await fetch("/api/drops/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      eventId: selectedEventId,
      name
    })
  });

  loadAdminDrops();
}

loadAdmin();