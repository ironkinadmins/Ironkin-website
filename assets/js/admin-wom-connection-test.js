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
  const resolve = document.createElement("button");
  resolve.type = "button";
  resolve.textContent = "Resolve missing WOM test";
  resolve.hidden = true;
  resolve.style.marginLeft = "8px";
  refresh.insertAdjacentElement("afterend", resolve);
  resolve.addEventListener("click", async () => {
    if (!confirm("WOM competition was not found. Recheck its ID and archive this failed attempt? This does not delete anything in WOM.")) return;
    resolve.disabled = true;
    try {
      const response = await fetch("/api/admin/events/wom-connection-test", {
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"resolve_missing_competition",confirmation:"RESOLVE MISSING WOM TEST"})
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not resolve test");
      await update();
    } catch(error) { output.textContent = error.message; }
    finally { resolve.disabled = false; }
  });
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
    run.disabled = Boolean(test && test.status !== "resolved_missing");
    run.dataset.resolved = String(test?.status === "resolved_missing");
    resolve.hidden = !(test?.status === "needs_review" && test?.competitionId && test?.verificationError === "WOM returned 404: competition not found");
    reset.hidden = !(test?.status === "needs_review" && ["Private service", "Invalid WOM request", "Coordinator WOM verification secret not configured", "Coordinator WOM verification secret mismatch"].includes(test?.error) && !test?.competitionId);
    output.textContent = test ? `Status: ${test.status}\nCoordinator: ${test.coordinatorStatus || "Not recorded"} (HTTP ${test.coordinatorHttpStatus ?? "unknown"})\nWOM create HTTP: ${test.womCreateHttpStatus ?? "unknown"}\nVerification: ${test.verificationError || (test.status === "verified" ? "Verified against WOM" : "Not verified")}\nWOM ID: ${test.competitionId || "Not confirmed"}\nCompetition: ${test.womUrl || test.title}\n${test.error || ""}\nDelete manually in WOM after verification.` : "No WOM connection test attempted.";
  }
  refresh.addEventListener("click", () => update().catch(e => {output.textContent=e.message;}));
  run.addEventListener("click", async () => {
    const isRetry = run.dataset.resolved === "true";
    if (!confirm(isRetry ? "Previous failed attempt was archived. Create ONE NEW REAL public WOM test competition? Check WOM first for duplicates." : "Create ONE REAL, PUBLIC 24-hour WOM test competition in group 12095? It must be deleted manually afterward. No website event or Embers will be changed.")) return;
    run.disabled = true;
    output.textContent = "Submitting one-time WOM creation request…";
    try {
      const response = await fetch("/api/admin/events/wom-connection-test", {
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"create",confirmation:"CREATE WOM TEST",...(isRetry?{retryConfirmation:"CREATE NEW WOM TEST AFTER RESOLUTION"}:{})})
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || data.test?.error || "WOM creation requires review");
      await update();
    } catch(e) { output.textContent = `${e.message}\nDo not retry without reconciling WOM first.`; }
  });
  update().catch(e => {output.textContent=e.message;});
});
