document.addEventListener("DOMContentLoaded", () => {
  const run = document.getElementById("ikWomConnectionCreate");
  const refresh = document.getElementById("ikWomConnectionRefresh");
  const output = document.getElementById("ikWomConnectionStatus");
  if (!run || !refresh || !output) return;
  async function update() {
    const response = await fetch("/api/admin/events/wom-connection-test", {credentials:"same-origin",cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Could not load test status");
    const test = data.test;
    run.disabled = Boolean(test);
    output.textContent = test ? `Status: ${test.status}\nWOM ID: ${test.competitionId || "Not confirmed"}\nCompetition: ${test.womUrl || test.title}\n${test.error || ""}\nDelete manually in WOM after verification.` : "No WOM connection test attempted.";
  }
  refresh.addEventListener("click", () => update().catch(e => {output.textContent=e.message;}));
  run.addEventListener("click", async () => {
    if (!confirm("Create ONE REAL, PUBLIC 24-hour WOM test competition in group 12095? It must be deleted manually afterward. No website event or Embers will be changed.")) return;
    run.disabled = true;
    output.textContent = "Submitting one-time WOM creation request…";
    try {
      const response = await fetch("/api/admin/events/wom-connection-test", {
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"create",confirmation:"CREATE WOM TEST"})
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || data.test?.error || "WOM creation requires review");
      await update();
    } catch(e) { output.textContent = `${e.message}\nDo not retry without reconciling WOM first.`; }
  });
  update().catch(e => {output.textContent=e.message;});
});
