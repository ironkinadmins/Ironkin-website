<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>Ironkin Admin Dashboard</title>

  <link rel="stylesheet" href="styles.css" />
</head>

<body>
  <main class="admin-page">
    <section class="admin-hero">
      <p class="eyebrow">Ironkin Admin</p>
      <h1>Admin Dashboard</h1>
      <p>
        Manage event-specific drops for SOTW, BOTW, and Clan Goals.
      </p>
    </section>

    <section class="admin-card">
      <div class="admin-form-grid">
        <div class="admin-field">
          <label for="adminEventSelect">Select Event</label>
          <select id="adminEventSelect"></select>
        </div>

        <div class="admin-field">
          <label for="dropNameInput">Add Drop</label>
          <div class="admin-add-row">
            <input
              id="dropNameInput"
              type="text"
              placeholder="Example: Huey Hide"
            />

            <button class="btn primary" id="addDropBtn">
              Add Drop
            </button>
          </div>
        </div>
      </div>

      <div class="admin-divider"></div>

      <div class="admin-section-header">
        <div>
          <h2>Current Drops</h2>
          <p>These drops are saved only for the selected event.</p>
        </div>
      </div>

      <div id="adminDropsList" class="admin-drops-list">
        Loading...
      </div>
    </section>
  </main>

  <script src="admin.js"></script>
</body>
</html>