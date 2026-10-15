(() => {
  const grid = document.getElementById('recordsGrid');
  const host = document.getElementById('recordsLegends');
  const dialog = document.getElementById('recordsProfileDialog');
  if (!grid || !host) return;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = v => String(v || '').trim().toLocaleLowerCase();
  const tabs = [...document.querySelectorAll('[data-record-filter]')];
  let active = 'all';
  function classify() {
    [...grid.children].forEach(card => {
      if (card.classList.contains('records-loading')) return;
      const category = card.classList.contains('records-champions-section') ? 'champions' : 'milestones';
      card.dataset.recordCategory = category;
      card.hidden = active !== 'all' && category !== active;
    });
    host.hidden = active === 'milestones';
    grid.setAttribute('aria-busy', String(!!grid.querySelector('.records-loading')));
  }
  tabs.forEach(tab => tab.addEventListener('click', () => {
    active = tab.dataset.recordFilter;
    tabs.forEach(item => { const on = item === tab; item.classList.toggle('is-active', on); item.setAttribute('aria-pressed', String(on)); });
    classify();
  }));
  new MutationObserver(classify).observe(grid, {childList:true});
  classify();
  const players = new Map();
  const ensure = name => {
    const id = key(name);
    if (!id) return null;
    if (!players.has(id)) players.set(id, {name:String(name).trim(), wins:0, podiums:0, events:[], titles:new Set(), badges:[]});
    return players.get(id);
  };
  function badges(p, mostWins, mostPodiums) {
    const out = [];
    if (p.wins >= 1) out.push('First Champion');
    if (p.wins >= 3) out.push('Three-Time Champion');
    if (p.wins >= 5) out.push('Five-Time Champion');
    if (p.podiums >= 5) out.push('Five Podiums');
    if (p.wins > 0 && p.wins === mostWins) out.push('Most Decorated Champion');
    if (p.podiums > 0 && p.podiums === mostPodiums) out.push('Podium Leader');
    return out;
  }
  function showProfile(id) {
    const p = players.get(id); if (!p || !dialog) return;
    const body = dialog.querySelector('#recordsProfileContent');
    body.innerHTML = `<p class="eyebrow">IRONKIN LEGEND</p><h2 id="recordsProfileTitle">${escape(p.name)}</h2><div class="records-profile-stats"><span><b>${p.wins}</b> event wins</span><span><b>${p.podiums}</b> podiums</span><span><b>${p.events.length}</b> recorded appearances</span></div><div class="records-badges">${p.badges.map(b=>`<span class="records-badge">✦ ${escape(b)}</span>`).join('') || '<span class="admin-muted">No unlocked badges yet</span>'}</div><h3>Event history</h3><div class="records-profile-events">${p.events.length ? p.events.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(e=>`<div><strong>${escape(e.title)}</strong><span>${escape(e.result)}${e.date ? ' · '+escape(String(e.date).slice(0,10)) : ''}</span></div>`).join('') : '<p>No archived appearances yet.</p>'}</div><p class="records-profile-note">Achievements reflect the available event archive. Legacy winner records without dates may not appear in the timeline.</p>`;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
  }
  host.addEventListener('click', e => { const btn=e.target.closest('[data-record-player]'); if(btn) showProfile(btn.dataset.recordPlayer); });
  dialog?.addEventListener('click', e => { if(e.target === dialog || e.target.closest('.records-modal-close')) dialog.close(); });
  document.addEventListener('ironkin:records-loaded', ({detail}) => {
    players.clear();
    const archive = Array.isArray(detail.archive) ? detail.archive : [];
    const events = [];
    const recorded = new Set();
    archive.forEach((e,index) => {
      const title = e.title || e.metric || 'Archived event';
      const date = e.endedAt || e.endDate || e.startDate || '';
      const winner = e.winner?.name;
      const eventKey = String(e.id || e.womCompetitionId || `${e.type}|${title}|${date}|${index}`);
      const seenPodiums = new Set();
      (Array.isArray(e.topFive) ? e.topFive : []).slice(0,3).forEach((row,i) => {
        const p=ensure(row.name); if(!p || seenPodiums.has(key(row.name))) return;
        seenPodiums.add(key(row.name)); p.podiums++;
        p.events.push({title,date,result:`#${i+1} podium`});
      });
      if(winner) {
        const p=ensure(winner);
        if(p) {
          p.wins++;
          if(!seenPodiums.has(key(winner))) { p.podiums++; p.events.push({title,date,result:'Champion'}); }
          else { const item=p.events.find(x=>x.title===title && x.date===date); if(item) item.result='Champion'; }
          p.titles.add(eventKey);
        }
        events.push({title,date,winner,type:e.type || 'event',eventKey});
        recorded.add(`${key(winner)}|${key(e.metric || title)}`);
      }
    });
    // Include historical winner names for discoverability, without inflating archive-derived statistics.
    [...(detail.sotwChampions||[]),...(detail.botwChampions||[])].forEach(row => {
      const p=ensure(row.winner); if(!p) return;
      if(row.source==='legacy') p.events.push({title:row.eventName || 'Legacy champion',date:'',result:'Legacy winner (not counted in archive totals)'});
    });
    const ranking = [...players.values()].sort((a,b)=>b.wins-a.wins || b.podiums-a.podiums || a.name.localeCompare(b.name));
    const maxWins=Math.max(0,...ranking.map(p=>p.wins));
    const maxPodiums=Math.max(0,...ranking.map(p=>p.podiums));
    ranking.forEach(p=>p.badges=badges(p,maxWins,maxPodiums));
    const featured=ranking.filter(p=>p.wins>0).slice(0,3);
    host.innerHTML=`<section class="records-feature"><div class="records-feature-head"><div><p class="eyebrow">THE HALL OF LEGENDS</p><h2>Ironkin Legends</h2><p>Champions who left their mark on the clan.</p></div><span class="records-count">${ranking.filter(p=>p.wins).length} archive champions</span></div><div class="records-legends-grid">${featured.length ? featured.map((p,i)=>`<button class="records-legend ${i===0?'is-king':''}" type="button" data-record-player="${escape(key(p.name))}"><span class="records-legend-medal">${['♛','🥈','🥉'][i]}</span><small>${['MOST DECORATED','RUNNER-UP','THIRD PLACE'][i]}</small><strong>${escape(p.name)}</strong><span>${p.wins} wins · ${p.podiums} podiums</span><span class="records-legend-cta">View achievements ↗</span></button>`).join('') : '<p class="admin-muted">No archived champions yet.</p>'}</div></section><section class="records-feature"><div class="records-feature-head"><div><p class="eyebrow">ALL-TIME STANDINGS</p><h2>Champions Leaderboard</h2></div><label class="records-search-label">Find a member <input id="recordsMemberSearch" type="search" placeholder="Search players…" autocomplete="off"></label></div><div class="records-ranking" id="recordsRanking"></div></section><section class="records-feature"><div class="records-feature-head"><div><p class="eyebrow">THROUGH THE YEARS</p><h2>Clan History Timeline</h2></div><label class="records-search-label">Year <select id="recordsYearFilter"><option value="all">All years</option>${[...new Set(events.map(e=>String(e.date).slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse().map(y=>`<option value="${y}">${y}</option>`).join('')}</select></label></div><div id="recordsTimeline" class="records-timeline"></div></section>`;
    const rankingEl=host.querySelector('#recordsRanking');
    function renderRanking(q='') {
      const matches=ranking.filter(p=>key(p.name).includes(key(q)));
      rankingEl.innerHTML=matches.length?matches.slice(0,100).map(p=>`<button type="button" class="records-ranking-row" data-record-player="${escape(key(p.name))}"><span class="records-rank">#${ranking.indexOf(p)+1}</span><span class="records-rank-name"><strong>${escape(p.name)}</strong><small>${p.badges.slice(0,2).map(escape).join(' · ') || 'Competitor'}</small></span><span>${p.wins} <small>wins</small></span><span>${p.podiums} <small>podiums</small></span><span aria-hidden="true">↗</span></button>`).join(''):'<p class="admin-muted">No matching members.</p>';
    }
    host.querySelector('#recordsMemberSearch').addEventListener('input',e=>renderRanking(e.target.value));
    renderRanking();
    const timeline=host.querySelector('#recordsTimeline');
    const dated=events.filter(e=>!Number.isNaN(Date.parse(e.date)) && e.date).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    function renderTimeline(year='all') {
      const matches=dated.filter(e=>year==='all'||String(e.date).slice(0,4)===year);
      timeline.innerHTML=matches.length?matches.map(e=>`<article class="records-timeline-item"><time>${escape(new Date(e.date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}))}</time><div><strong>${escape(e.title)}</strong><span>Champion: <button type="button" data-record-player="${escape(key(e.winner))}">${escape(e.winner)}</button></span></div></article>`).join(''):'<p class="admin-muted">No dated archive victories for this year.</p>';
    }
    host.querySelector('#recordsYearFilter').addEventListener('change',e=>renderTimeline(e.target.value));
    renderTimeline();
    classify();
  });
})();
