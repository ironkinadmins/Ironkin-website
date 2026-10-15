/* Admin presentation layer. Keeps existing IDs, handlers, and backend workflows intact. */
(() => {
  const ready = () => {
    const standard = document.getElementById('eventSubtab-standard');
    const nav = document.querySelector('.admin-command-nav');
    if (!standard || !nav) return;
    const hero = document.querySelector('.admin-hero');
    const overview = document.createElement('section');
    overview.className = 'ik-command-overview';
    overview.innerHTML = `<div class="ik-overview-head"><div><p class="eyebrow">Command center</p><h2>What would you like to manage?</h2><p>Choose a workspace. All existing tools are still available.</p></div><button type="button" class="ik-small-btn" id="ikOverviewToggle" aria-expanded="true">Hide overview</button></div><div class="ik-quick-grid"><button type="button" data-ik-jump="events">⚔️ <strong>Events</strong><small>Setup, rewards, drops & results</small></button><a href="/ironkin-games-admin.html">🏆 <strong>Ironkin Games</strong><small>Teams, challenges & scoring</small></a><button type="button" data-ik-jump="bingo">🧩 <strong>Battleship Bingo</strong><small>Board, teams & proof reviews</small></button><button type="button" data-ik-jump="profiles">👥 <strong>Members</strong><small>Directory, profiles & access</small></button><button type="button" data-ik-jump="clan-plugin">🔌 <strong>Plugin & diagnostics</strong><small>Tracking and maintenance</small></button><button type="button" data-ik-jump="handbook">📖 <strong>Staff Handbook</strong><small>Documentation editor</small></button></div>`;
    hero?.after(overview);
    const toggle = overview.querySelector('#ikOverviewToggle');
    toggle.addEventListener('click', () => {
      const collapsed = overview.classList.toggle('ik-overview-collapsed');
      toggle.textContent = collapsed ? 'Show overview' : 'Hide overview';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });
    overview.querySelectorAll('[data-ik-jump]').forEach(btn => btn.addEventListener('click', () => {
      const target = btn.dataset.ikJump;
      const selector = target === 'events' ? '[data-event-subtab="standard"]' : target === 'bingo' ? '[data-event-subtab="bingo"]' : `[data-admin-tab="${target}"]`;
      document.querySelector(selector)?.click();
      nav.scrollIntoView({behavior:'smooth',block:'start'});
    }));
    const toolbar = document.createElement('div');
    toolbar.className = 'ik-event-toolbar';
    toolbar.innerHTML = `<div class="ik-workflow-title"><span class="eyebrow">Event manager</span><h2>One event. Five focused workspaces.</h2><p>Choose the task you're working on. Switching views does not discard edits.</p></div><div class="ik-workflow-tabs" role="group" aria-label="Event management workspaces"><button type="button" data-ik-stage="setup">01 · Setup & rewards</button><button type="button" data-ik-stage="items">02 · Items & drops</button><button type="button" data-ik-stage="results">03 · Results & publishing</button><button type="button" data-ik-stage="all">View all</button></div>`;
    standard.prepend(toolbar);
    const cards = [...standard.children].filter(el => el.matches('section.admin-card'));
    const stageFor = card => card.id === 'resultsPublishingCard' ? 'results' : ['standardDropsEditor','bountiesEditor','eventItemImportCard'].includes(card.id) ? 'items' : 'setup';
    const setStage = stage => {
      toolbar.querySelectorAll('[data-ik-stage]').forEach(btn => {
        const active = btn.dataset.ikStage === stage;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      cards.forEach(card => {
        // Only control visibility at the card level; preserve internal dynamic display logic.
        card.classList.toggle('ik-stage-hidden', stage !== 'all' && stageFor(card) !== stage);
      });
      try { sessionStorage.setItem('ik-admin-stage',stage); } catch (_) {}
    };
    toolbar.querySelectorAll('[data-ik-stage]').forEach(btn => btn.addEventListener('click', () => setStage(btn.dataset.ikStage)));
    let initial = 'setup';
    try { initial = sessionStorage.getItem('ik-admin-stage') || 'setup'; } catch (_) {}
    setStage(['setup','items','results','all'].includes(initial) ? initial : 'setup');
    // Contextual item manager heading, without touching existing item form handlers.
    const itemCard = document.getElementById('eventItemImportCard');
    if (itemCard) {
      const note = document.createElement('p');
      note.className = 'ik-maintenance-note';
      note.textContent = 'Advanced import · Use for bulk updates; individual items are managed above.';
      itemCard.prepend(note);
    }
    const plugin = document.getElementById('adminTab-clan-plugin');
    if (plugin) {
      const intro = document.createElement('div');
      intro.className = 'ik-workspace-intro';
      intro.innerHTML = '<p class="eyebrow">Tracking & maintenance</p><h2>Clan Plugin</h2><p>Review tracking first. Historical imports and repair tools are grouped below as advanced maintenance.</p>';
      plugin.prepend(intro);
      const advanced = document.getElementById('historicalDropImportCard');
      if (advanced) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'ik-advanced-toggle';
        button.textContent = '⚙ Show advanced maintenance: historical backfill';
        button.setAttribute('aria-expanded','false');
        advanced.before(button);
        advanced.classList.add('ik-advanced-hidden');
        button.addEventListener('click', () => {
          const open = advanced.classList.toggle('ik-advanced-hidden') === false;
          button.setAttribute('aria-expanded',String(open));
          button.textContent = open ? '⚙ Hide advanced maintenance' : '⚙ Show advanced maintenance: historical backfill';
        });
      }
    }
    // Avoid showing every navigation card and the overview simultaneously.
    nav.classList.add('ik-nav-compact');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready); else ready();
})();
