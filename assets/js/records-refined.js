(() => {
  const grid = document.getElementById('recordsGrid');
  const host = document.getElementById('recordsLegends');
  const dialog = document.getElementById('recordsProfileDialog');
  if (!grid || !host) return;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = v => String(v || '').trim().toLocaleLowerCase();
  const chapters = ['legends','champions','timeline','milestones'];
  const labels = {legends:['THE HALL OF LEGENDS','Ironkin Legends'],champions:['ALL-TIME STANDINGS','Champions Leaderboard'],timeline:['THROUGH THE YEARS','Clan History Timeline'],milestones:['THE RECORD BOOKS','Clan Milestones']};
  const tabs = [...document.querySelectorAll('[data-record-chapter]')];
  let active = 'legends';
  function classify() {
    const sections = [...host.querySelectorAll(':scope > .records-feature')];
    sections.forEach((section,i) => { section.hidden = chapters[i] !== active; });
    host.hidden = active === 'milestones';
    grid.hidden = active !== 'milestones';
    grid.setAttribute('aria-busy', String(!!grid.querySelector('.records-loading')));
    tabs.forEach(tab => {const on = tab.dataset.recordChapter === active;tab.setAttribute('aria-selected',String(on));tab.tabIndex = on ? 0 : -1;});
    const [kicker,title] = labels[active];
    document.getElementById('recordsChapterKicker').textContent=kicker;
    document.getElementById('recordsChapterTitle').textContent=title;
    document.getElementById('recordsChapterCounter').textContent=String(chapters.indexOf(active)+1).padStart(2,'0')+' / 04';
  }
  function selectChapter(chapter, focus=false) {
    if (!chapters.includes(chapter)) return;
    active=chapter;
    classify();
    if (focus) tabs.find(t=>t.dataset.recordChapter===active)?.focus();
  }
  tabs.forEach(tab=>{
    tab.addEventListener('click',()=>selectChapter(tab.dataset.recordChapter));
    tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const i=chapters.indexOf(active);selectChapter(e.key==='Home'?chapters[0]:e.key==='End'?chapters[3]:chapters[(i+(e.key==='ArrowRight'?1:3))%4],true);}});
  });
  document.getElementById('recordsChapterPrev')?.addEventListener('click',()=>selectChapter(chapters[(chapters.indexOf(active)+3)%4]));
  document.getElementById('recordsChapterNext')?.addEventListener('click',()=>selectChapter(chapters[(chapters.indexOf(active)+1)%4]));
  new MutationObserver(classify).observe(grid,{childList:true});
  classify();
  const players = new Map();
  const ensure = name => {
    const id = key(name);
    if (!id) return null;
    if (!players.has(id)) players.set(id, {name:String(name).trim(), wins:0, podiums:0, events:[], titles:new Set(), badges:[], categories:new Set(), legacyWins:0});
    return players.get(id);
  };
  const badgeNames = ['First Podium','First Champion','Three-Time Champion','Five-Time Champion','Ten-Time Champion','Five Podiums','Ten Podiums','SOTW Champion','BOTW Champion','Versatile Champion','Archive Veteran','Legacy Legend','Most Decorated Champion','Podium Leader'];
  // Rarity is a fixed achievement tier, not a claim about live unlock frequency.
  const badgeRarity = {
    'First Podium':'common', 'First Champion':'common',
    'Three-Time Champion':'rare', 'Five-Time Champion':'epic', 'Ten-Time Champion':'legendary',
    'Five Podiums':'rare', 'Ten Podiums':'epic',
    'SOTW Champion':'rare', 'BOTW Champion':'rare', 'Versatile Champion':'epic',
    'Archive Veteran':'rare', 'Legacy Legend':'epic',
    'Most Decorated Champion':'legendary', 'Podium Leader':'legendary'
  };
  const rarityLabels = {common:'Common',rare:'Rare',epic:'Epic',legendary:'Legendary'};
  function eventCategory(value) {
    const v = String(value || '').toLowerCase();
    if (/\bsotw\b|skill of the week/.test(v)) return 'sotw';
    if (/\bbotw\b|boss of the week/.test(v)) return 'botw';
    return '';
  }
  function badges(p, mostWins, mostPodiums) {
    const out = [];
    if (p.podiums >= 1) out.push('First Podium');
    if (p.wins >= 1) out.push('First Champion');
    if (p.wins >= 3) out.push('Three-Time Champion');
    if (p.wins >= 5) out.push('Five-Time Champion');
    if (p.wins >= 10) out.push('Ten-Time Champion');
    if (p.podiums >= 5) out.push('Five Podiums');
    if (p.podiums >= 10) out.push('Ten Podiums');
    if (p.categories.has('sotw')) out.push('SOTW Champion');
    if (p.categories.has('botw')) out.push('BOTW Champion');
    if (p.categories.has('sotw') && p.categories.has('botw')) out.push('Versatile Champion');
    if (p.events.length >= 10) out.push('Archive Veteran');
    if (p.legacyWins >= 3) out.push('Legacy Legend');
    if (p.wins > 0 && p.wins === mostWins) out.push('Most Decorated Champion');
    if (p.podiums > 0 && p.podiums === mostPodiums) out.push('Podium Leader');
    return out;
  }
  let mostWinsSeen = 0, mostPodiumsSeen = 0;
  function badgeDescription(name, player, maxWins, maxPodiums) {
    const descriptions = {
      'First Podium': `Place in the top 3 of at least 1 recorded event. ${player.name} has ${player.podiums} podium(s).`,
      'First Champion': `Win at least 1 recorded clan event. ${player.name} has ${player.wins} win(s).`,
      'Three-Time Champion': `Win at least 3 recorded clan events. ${player.name} has ${player.wins} wins.`,
      'Five-Time Champion': `Win at least 5 recorded clan events. ${player.name} has ${player.wins} wins.`,
      'Ten-Time Champion': `Win at least 10 recorded events. ${player.name} has ${player.wins} wins.`,
      'Five Podiums': `Finish in the top 3 of at least 5 recorded events. ${player.name} has ${player.podiums} podium finishes.`,
      'Ten Podiums': `Earn 10 recorded top-three finishes. ${player.name} has ${player.podiums} podiums.`,
      'SOTW Champion': 'Win at least one Skill of the Week event identified as SOTW in the archive.',
      'BOTW Champion': 'Win at least one Boss of the Week event identified as BOTW in the archive.',
      'Versatile Champion': 'Win at least one SOTW and one BOTW event.',
      'Archive Veteran': `Appear in at least 10 recorded event results. ${player.name} has ${player.events.length} recorded appearances.`,
      'Legacy Legend': `Win at least 3 legacy competitions not already counted in the dated archive. ${player.name} has ${player.legacyWins} such wins.`,
      'Most Decorated Champion': `Share the highest recorded event-win total in the clan (${maxWins} wins). Ties qualify.`,
      'Podium Leader': `Share the highest recorded top-three finish total in the clan (${maxPodiums} podiums). Ties qualify.`
    };
    return descriptions[name] || 'Earned from recorded clan event results.';
  }
  dialog?.addEventListener('click', e => {
    const badge = e.target.closest('.records-badge');
    if (!badge) return;
    const wasOpen = badge.classList.contains('is-tooltip-open');
    dialog.querySelectorAll('.records-badge.is-tooltip-open').forEach(el=>el.classList.remove('is-tooltip-open'));
    if (!wasOpen) badge.classList.add('is-tooltip-open');
  });
  function showProfile(id) {
    const p = players.get(id); if (!p || !dialog) return;
    const body = dialog.querySelector('#recordsProfileContent');
    const allBadges = badgeNames;
    const badgeCatalog = allBadges.map(name => {
      const unlocked = p.badges.includes(name);
      const description = badgeDescription(name,p,mostWinsSeen,mostPodiumsSeen);
      const rarity = badgeRarity[name] || 'common';
      return `<li class="records-catalog-badge rarity-${rarity} ${unlocked ? 'is-unlocked' : 'is-locked'}"><span class="records-catalog-icon" aria-hidden="true">${unlocked ? '✦' : '◇'}</span><span class="records-catalog-copy"><strong>${escape(name)}</strong><span class="records-badge-rarity">${rarityLabels[rarity]}</span><small>${escape(description)}</small></span><span class="records-catalog-status">${unlocked ? 'Earned' : 'Locked'}</span></li>`;
    }).join('');
    const completion = Math.round((p.badges.length / allBadges.length) * 100);
    body.innerHTML = `<div class="records-profile-layout"><div class="records-profile-main"><p class="eyebrow">IRONKIN LEGEND</p><h2 id="recordsProfileTitle">${escape(p.name)}</h2><div class="records-profile-stats"><span><b>${p.wins}</b> event wins</span><span><b>${p.podiums}</b> podiums</span><span><b>${p.events.length}</b> recorded appearances</span></div><h3>Event history</h3><div class="records-profile-events">${p.events.length ? p.events.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(e=>`<div><strong>${escape(e.title)}</strong><span>${escape(e.result)}${e.date ? ' · '+escape(String(e.date).slice(0,10)) : ''}</span></div>`).join('') : '<p>No archived appearances yet.</p>'}</div><p class="records-profile-note">Achievements reflect the available event archive. Legacy winner records without dates may not appear in the timeline.</p></div><aside class="records-badge-sidebar" aria-label="Achievement badge collection"><div class="records-badge-sidebar-heading"><span class="eyebrow">ACHIEVEMENTS</span><h3>Badge collection</h3><p>${p.badges.length} of ${allBadges.length} unlocked · ${completion}% complete</p><div class="records-badge-progress" role="progressbar" aria-label="Badge collection completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion}"><span style="width:${completion}%"></span></div><div class="records-rarity-legend" aria-label="Achievement rarity tiers"><span class="rarity-common">Common</span><span class="rarity-rare">Rare</span><span class="rarity-epic">Epic</span><span class="rarity-legendary">Legendary</span></div></div><ul class="records-badge-catalog">${badgeCatalog}</ul></aside></div>`;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
  }
  host.addEventListener('click', e => { const btn=e.target.closest('[data-record-player]'); if(btn) showProfile(btn.dataset.recordPlayer); });
  dialog?.addEventListener('click', e => { if(e.target === dialog || e.target.closest('.records-modal-close')) dialog.close(); });
  document.addEventListener('ironkin:records-loaded', ({detail}) => {
    players.clear();
    const archive = Array.isArray(detail.archive) ? detail.archive : [];
    const events = [];
    const legacySeen = new Set();
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
          const category=eventCategory(`${e.type || ''} ${title}`);
          if(category) p.categories.add(category);
          if(!seenPodiums.has(key(winner))) { p.podiums++; p.events.push({title,date,result:'Champion'}); }
          else { const item=p.events.find(x=>x.title===title && x.date===date); if(item) item.result='Champion'; }
          p.titles.add(eventKey);
        }
        events.push({title,date,winner,type:e.type || 'event',eventKey});
        recorded.add(`${key(winner)}|${key(e.metric || title)}`);
      }
    });
    // Historical champions are included in wins and profiles, with archived duplicates removed.
    const normalizeEvent = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g,'');
    const archiveKeys = new Set(archive.filter(e => e?.winner?.name).map(e => `${key(e.winner.name)}|${normalizeEvent(e.metric || e.title)}`));
    [...(detail.sotwChampions||[]),...(detail.botwChampions||[])].forEach(row => {
      const p=ensure(row.winner); if(!p) return;
      const k=`${key(row.winner)}|${normalizeEvent(row.eventName)}`;
      const urlKey=String(row.url || '').match(/competitions\/(\d+)/)?.[1] || '';
      const dedupKey=urlKey ? `${key(row.winner)}|${urlKey}` : k;
      if(legacySeen.has(dedupKey)) return;
      legacySeen.add(dedupKey);
      if(row.source === 'archive') return;
      // A matching archive winner is already counted. Prefer its dated entry.
      if(archiveKeys.has(k) || archive.some(e => key(e?.winner?.name)===key(row.winner) && normalizeEvent(e.metric || e.title).includes(normalizeEvent(row.eventName)))) return;
      p.wins++; p.podiums++; p.legacyWins++;
      const category = (detail.sotwChampions || []).includes(row) ? 'sotw' : 'botw';
      p.categories.add(category);
      p.events.push({title:row.eventName || 'Legacy champion',date:'',result:'Legacy champion',url:row.url || ''});
    });
    const ranking = [...players.values()].sort((a,b)=>b.wins-a.wins || b.podiums-a.podiums || a.name.localeCompare(b.name));
    const maxWins=Math.max(0,...ranking.map(p=>p.wins));
    const maxPodiums=Math.max(0,...ranking.map(p=>p.podiums));
    mostWinsSeen = maxWins; mostPodiumsSeen = maxPodiums;
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
    // The publish control is gated by the server session; the endpoint checks again.
    const publishBox=document.getElementById('recordsDiscordPublish');
    const previewButton=document.getElementById('recordsPreviewPublish');
    const publishDialog=document.getElementById('recordsPublishDialog');
    const status=document.getElementById('recordsPublishStatus');
    const publishData={sotw:detail.sotwChampions||[],botw:detail.botwChampions||[]};
    fetch('/api/admin/records/publish',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.authorized && publishBox) publishBox.hidden=false;}).catch(()=>{});
    previewButton?.addEventListener('click',()=>{
      document.getElementById('recordsPublishPreview').innerHTML=`<div><strong>Skill of the Week</strong><span>${publishData.sotw.length} winners</span></div><div><strong>Boss of the Week</strong><span>${publishData.botw.length} winners</span></div><p>Existing messages with matching titles will be updated where possible. If no matching message exists, a new one will be created.</p>`;
      status.textContent='';publishDialog.showModal();
    });
    document.getElementById('recordsCancelPublish')?.addEventListener('click',()=>publishDialog.close());
    document.getElementById('recordsConfirmPublish')?.addEventListener('click',async e=>{
      if(!window.confirm('Publish both record embeds to the Hall of Flame Discord channel?'))return;
      e.currentTarget.disabled=true;status.textContent='Publishing…';
      try {const response=await fetch('/api/admin/records/publish',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(publishData)});const result=await response.json();if(!response.ok)throw Error(result.error||'Publish failed');status.textContent=`Published: ${result.results.map(x=>x.type+' '+x.action).join(', ')}`;}
      catch(error){status.textContent='Could not publish: '+error.message;}
      finally{e.currentTarget.disabled=false;}
    });
  });
})();
