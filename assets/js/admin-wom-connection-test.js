document.addEventListener("DOMContentLoaded", () => {
  const run = document.getElementById("ikWomConnectionCreate");
  const refresh = document.getElementById("ikWomConnectionRefresh");
  const output = document.getElementById("ikWomConnectionStatus");
  if (!run || !refresh || !output) return;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset Failed Connection Test";
  reset.hidden = true;
  reset.style.marginLeft = "8px";
  refresh.insertAdjacentElement("afterend", reset);
  reset.addEventListener("click", async () => {
    if (!confirm("Reset only a coordinator-rejected test (before WOM creation)? This does not delete WOM competitions.")) return;
    reset.disabled = true;
    try {
      const response = await fetch("/api/admin/events/wom-connection-test", {
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"reset_preflight_rejection",confirmation:"RESET FAILED TEST"})
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Reset failed");
      await update();
    } catch (error) { output.textContent = error.message; }
    finally { reset.disabled = false; }
  });
  async function update() {
    const response = await fetch("/api/admin/events/wom-connection-test", {credentials:"same-origin",cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Could not load test status");
    const test = data.test;
    run.disabled = Boolean(test);
    reset.hidden = !(test?.status === "needs_review" && ["Private service", "Invalid WOM request", "Coordinator WOM verification secret not configured", "Coordinator WOM verification secret mismatch"].includes(test?.error) && !test?.competitionId);
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
