(() => {
"use strict";
const $ = id => document.getElementById(id);
const api = "/api/admin/events/cycle-recovery";
const el = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value == null ? "—" : String(value);
  if (className) node.className = className;
  return node;
};
async function refresh() {
  $("refresh").disabled = true;
  $("status").textContent = "Checking cycles…";
  try {
    const response = await fetch(api, {credentials:"same-origin", cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    $("status").textContent = `Cycle automation: ${data.enabled ? "enabled" : "disabled"} · Automatic finalization: ${data.autoFinalizeEnabled ? "enabled" : "disabled"}`;
    const tbody = $("cycles"), select = $("cycle");
    tbody.replaceChildren(); select.replaceChildren();
    for (const cycle of data.cycles || []) {
      const row = document.createElement("tr");
      const fields = [
        `${cycle.type.toUpperCase()} · ${cycle.date}`,
        cycle.pollClosed ? `Closed · ${cycle.winner || cycle.outcome || "no winner"}` : cycle.pollPublished ? "Open" : "Not posted",
        cycle.womCompetitionId ? `#${cycle.womCompetitionId} · ${cycle.womStatus || "recorded"}` : cycle.womStatus || "Not created",
        cycle.websiteStatus || "Pending",
        cycle.finalizationStatus || "Pending",
        cycle.errors?.join("; ") || (cycle.needsReview ? "Review needed" : "—")
      ];
      fields.forEach((value, index) => row.append(el("td",value,index === 5 && cycle.needsReview ? "bad" : "")));
      tbody.append(row);
      if (cycle.pollClosed && cycle.outcome === "winner" && !cycle.womCompetitionId && ["creating","needs_review"].includes(cycle.womStatus)) {
        const option = document.createElement("option"); option.value = cycle.id; option.textContent = `${cycle.type.toUpperCase()} · ${cycle.date}`; select.append(option);
      }
    }
    if (!tbody.children.length) {
      const row=document.createElement("tr"), cell=el("td","No recent cycles available.");cell.colSpan=6;row.append(cell);tbody.append(row);
    }
    $("attach").querySelector('button[type="submit"]').disabled = !select.options.length;
  } catch(error) {
    $("status").textContent = `Unable to load: ${error.message}`;
    $("cycles").replaceChildren();
  } finally { $("refresh").disabled=false; }
}
$("refresh").addEventListener("click",refresh);
$("attach").addEventListener("submit", async event => {
  event.preventDefault();
  const id=$("cycle").value, competitionId=$("competition").value.trim();
  if (!id || !/^\\d{1,15}$/.test(competitionId)) return;
  if (!confirm(`Attach WOM competition ${competitionId} to ${id}? Confirm the competition is correct in WOM first.`)) return;
  const button=$("attach").querySelector('button[type="submit"]'); button.disabled=true;
  $("feedback").textContent="Verifying competition with WOM…";
  try {
    const response=await fetch(api,{method:"POST",credentials:"same-origin",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"attach_existing_wom",id,competitionId})});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    $("feedback").textContent=`Competition #${data.womCompetitionId} verified. Website status: ${data.websiteStatus || "pending"}. ${data.websiteError || ""}`;
    await refresh();
  } catch(error) {$("feedback").textContent=`Recovery failed: ${error.message}`;}
  finally {button.disabled=false;}
});
refresh();
})();
