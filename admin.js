let selectedEventId = null;

async function fetchEvents() {
  const response = await fetch("/api/current-events");
  const data = await response.json();

  return data.events || [];
}

async function loadAdmin() {
  const eventSelect = document.getElementById("adminEventSelect");
  const addDropBtn = document.getElementById("addDropBtn");

  if (!eventSelect || !addDropBtn) return;

  const events = await fetchEvents();

  eventSelect.innerHTML = "";

  events.forEach(event => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = event.title;
    eventSelect.appendChild(option);
  });

  selectedEventId = eventSelect.value;

  eventSelect.addEventListener("change", () => {
    selectedEventId = eventSelect.value;
    loadAdminDrops();
  });

  addDropBtn.addEventListener("click", addDrop);

  loadAdminDrops();
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