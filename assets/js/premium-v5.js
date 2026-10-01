(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  function markPage(){
    const p = location.pathname.toLowerCase();
    if (p.includes('hall-of-flame')) document.body.classList.add('ik-hall-page');
    document.body.classList.add('ik-v5');
  }

  function setActiveNav(){
    const current=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    $$('.premium-nav-links a').forEach(a=>{
      const target=(new URL(a.href,location.href).pathname.split('/').pop()||'index.html').toLowerCase();
      a.classList.toggle('active',target===current);
    });
  }

  function upgradeFooter(){
    // Idempotent: never create more than one premium footer.
    if ($('.ik-footer')) return;
    const old=$('footer:not(.ik-footer)');
    if(!old && document.body.classList.contains('admin-page')) return;
    const f=document.createElement('footer'); f.className='ik-footer';
    f.innerHTML=`<div class="ik-footer-inner">
      <div class="ik-footer-brand"><img src="/assets/ironkin-emblem.png" alt=""><div><strong>Ironkin</strong><p>Forged Alone. Bound as Kin.</p></div></div>
      <div class="ik-footer-col"><strong>Explore</strong><a href="/profile.html">Member Profile</a><a href="/ranks.html">Ranks</a><a href="/hall-of-flame.html">Hall of Flame</a><a href="/records.html">Records</a></div>
      <div class="ik-footer-col"><strong>Compete</strong><a href="/events.html">Events</a><a href="/calendar.html">Calendar</a><a href="/bingo.html">Bingo</a><a href="/ironkin-games.html">Ironkin Games</a></div>
      <div class="ik-footer-col"><strong>Community</strong><a href="/shop.html">Ember Shop</a><a href="/ember-leaderboard.html">Ember Leaderboard</a><a href="/rules.html">Rules</a><a href="/archive.html">Archive</a></div>
    </div><div class="ik-footer-bottom"><span>Old School RuneScape is a trademark of Jagex Ltd. Ironkin is not affiliated with or endorsed by Jagex.</span><span>© ${new Date().getFullYear()} Ironkin Clan</span></div>`;
    if(old) old.replaceWith(f); else document.body.appendChild(f);
  }

  function parseNumber(text){
    if(!text) return 0;
    const raw=String(text).replace(/,/g,'');
    const m=raw.match(/(-?\d+(?:\.\d+)?)\s*([KMBT])?/i); if(!m) return 0;
    const mult={K:1e3,M:1e6,B:1e9,T:1e12}[(m[2]||'').toUpperCase()]||1;
    return Number(m[1])*mult;
  }

  function buildDataViz(){
    // Profile: turn existing top-skill rows into a quick visual summary without changing source data.
    const skillBox=$('.profile-top-skills');
    if(skillBox && !$('.ik-data-viz',skillBox.parentElement||document)){
      const rows=$$('.profile-skill-row',skillBox).slice(0,5);
      const data=rows.map(r=>({label:($('strong',r)?.textContent||$('span',r)?.textContent||'Skill').trim(),value:parseNumber(r.textContent),display:(r.textContent.match(/[\d,.]+\s*[KMBT]?/i)||[''])[0]})).filter(x=>x.value>0);
      if(data.length) insertViz(skillBox,data,'Progress snapshot','Top tracked skills');
    }
    // Leaderboard / record style rows: gives live data a visual hierarchy.
    const host=$('#emberLeaderboard, #recordsGrid, .leaderboard, .records-grid');
    if(host && !$('.ik-data-viz')){
      const rows=$$('tr, .leaderboard-row, .record-card',host).slice(0,6);
      const data=rows.map((r,i)=>({label:($('a,strong,h3,.name',r)?.textContent||`#${i+1}`).trim(),value:parseNumber(r.textContent),display:(r.textContent.match(/[\d,.]+\s*[KMBT]?/i)||[''])[0]})).filter(x=>x.value>0);
      if(data.length) insertViz(host,data,'Clan pulse','Live comparative view');
    }
  }
  function insertViz(anchor,data,title,sub){
    const max=Math.max(...data.map(d=>d.value),1), el=document.createElement('section'); el.className='ik-data-viz ik-reveal';
    el.innerHTML=`<div class="ik-data-viz-head"><div><p class="eyebrow">Data view</p><h3>${title}</h3></div><small>${sub}</small></div><div class="ik-bars">${data.map(d=>`<div class="ik-bar-row"><span class="ik-bar-label">${escapeHtml(d.label)}</span><div class="ik-bar-track"><div class="ik-bar-fill" data-width="${Math.max(3,(d.value/max)*100).toFixed(1)}%"></div></div><span class="ik-bar-value">${escapeHtml(d.display)}</span></div>`).join('')}</div>`;
    anchor.insertAdjacentElement('afterend',el); requestAnimationFrame(()=>{$$('.ik-bar-fill',el).forEach(x=>x.style.width=x.dataset.width); revealObserve(el);});
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function revealObserve(root=document){
    const els=root.matches?.('.ik-reveal')?[root]:$$('.page > section, .profile-grid > *, .hall-grid > *, .events-grid > *, .home-ledger-grid > *, .home-news-grid > *, .ik-reveal',root);
    els.forEach(el=>el.classList.add('ik-reveal'));
    if(!('IntersectionObserver'in window)){els.forEach(el=>el.classList.add('ik-visible'));return;}
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('ik-visible');io.unobserve(e.target);}}),{threshold:.08,rootMargin:'0px 0px -25px'});
    els.forEach(el=>io.observe(el));
  }

  function upgradeBadges(){
    $$('.profile-badge').forEach(b=>{
      const tip=b.getAttribute('data-tooltip')||b.getAttribute('aria-label');
      if(tip&&!b.title)b.title=tip;
    });
  }

  function init(){ markPage(); upgradeFooter(); setActiveNav(); revealObserve(); upgradeBadges(); buildDataViz();
    const obs=new MutationObserver(()=>{setActiveNav();upgradeBadges();buildDataViz();});
    obs.observe(document.body,{childList:true,subtree:true}); setTimeout(()=>obs.disconnect(),5000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
