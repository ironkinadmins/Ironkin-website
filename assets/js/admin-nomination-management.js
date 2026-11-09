document.addEventListener('DOMContentLoaded',()=>{
 const type=document.getElementById('ikAdminNominationType'),refresh=document.getElementById('ikAdminNominationRefresh'),panel=document.getElementById('ikAdminNominationPanel');
 if(!type||!refresh||!panel)return;
 let records=[];
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 async function load(){refresh.disabled=true;panel.textContent='Loading nominations…';try{const r=await fetch('/api/admin/events/nomination-management',{credentials:'same-origin',cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Could not load nominations');records=j.statuses||[];render();}catch(e){panel.textContent=e.message;}finally{refresh.disabled=false;}}
 function render(){panel.replaceChildren();const x=records.find(v=>v.type===type.value);if(!x)return;
 panel.append(el('p',`Previous winner: ${x.winner?.rsn||'Not verified'} | Deadline: ${x.window?.deadline?.replace('T',' ')||'Not scheduled'} Eastern | ${x.locked?'Poll locked':x.window?.open?'Nominations open':'Nominations closed'}`));
 if(!x.winner){panel.append(el('p','Verify the previous winner before editing nominations.'));return;}
 const selections=[];
 for(let i=0;i<2;i++){const label=el('label',`Choice ${i+1} `),select=el('select');select.style.maxWidth='100%';const blank=el('option','Choose an eligible option');blank.value='';select.append(blank);for(const name of x.pool){const opt=el('option',name);opt.value=name;select.append(opt);}select.value=x.picks[i]||'';select.disabled=x.locked||!x.window?.open;label.append(select);panel.append(label,el('div'));selections.push(select);}
 const help=el('p',x.locked?'Poll options are already reserved or published. Edits are disabled.':!x.window?.open?'Nomination window is closed.':'This saves the winner’s nominations without impersonating their Discord account or sending a DM.');panel.append(help);
 const save=el('button','Save nominations as admin');save.type='button';save.disabled=x.locked||!x.window?.open||x.pool.length<2;panel.append(save);const status=el('p','');status.setAttribute('role','status');panel.append(status);
 save.onclick=async()=>{const options=selections.map(s=>s.value);if(options.some(v=>!v)||options[0]===options[1]){status.textContent='Choose two different eligible options.';return;}if(!confirm(`Save nominations for ${x.type.toUpperCase()} on behalf of ${x.winner.rsn}?`))return;save.disabled=true;try{const r=await fetch('/api/admin/events/nomination-management',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-picks',type:x.type,options})});const j=await r.json();if(!r.ok)throw Error(j.error||'Could not save');await load();}catch(e){status.textContent=e.message;save.disabled=false;}};
 }
 type.addEventListener('change',render);refresh.addEventListener('click',load);load();
});
