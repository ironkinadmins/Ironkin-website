(() => {
"use strict";
const button=document.getElementById("runCycleDryRuns");
const summary=document.getElementById("cycleDrySummary");
const output=document.getElementById("cycleDryResults");
if(!button||!summary||!output)return;
button.addEventListener("click",async()=>{
  button.disabled=true;summary.textContent="Running read-only checks…";output.replaceChildren();
  try{
    const response=await fetch("/api/admin/events/cycle-dry-run",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    const counts={pass:0,warning:0,fail:0};
    for(const result of data.results||[]){
      const status=["pass","warning","fail"].includes(result.status)?result.status:"warning";
      counts[status]++;
      const row=document.createElement("div");row.className="check";
      const description=document.createElement("div");
      const heading=document.createElement("strong");heading.textContent=result.name;
      const detail=document.createElement("small");detail.textContent=result.detail;
      description.append(heading,detail);
      const label=document.createElement("strong");label.className=status==="pass"?"good":"bad";label.textContent=status.toUpperCase();
      row.append(description,label);output.append(row);
    }
    summary.textContent=`Read-only checks: ${counts.pass} passed · ${counts.warning} warnings · ${counts.fail} failed. No external actions performed.`;
  }catch(error){summary.textContent=`Dry run failed: ${error.message}`;}
  finally{button.disabled=false;}
});
})();
