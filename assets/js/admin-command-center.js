/* Compact Admin navigation: reuse the existing working controls, never duplicate them. */
(() => {
  const ready = () => {
    const nav = document.querySelector('.admin-command-nav');
    if (!nav) return;
    nav.classList.add('ik-nav-compact');
    // Keep native event editor navigation and all existing event handlers intact.
    // Put rarely needed historical backfill behind a reversible disclosure.
    const advanced = document.getElementById('historicalDropImportCard');
    if (advanced && !document.getElementById('ikAdvancedMaintenanceToggle')) {
      const button = document.createElement('button');
      button.id = 'ikAdvancedMaintenanceToggle';
      button.type = 'button';
      button.className = 'ik-advanced-toggle';
      button.setAttribute('aria-controls', advanced.id);
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Show advanced maintenance · Historical backfill';
      advanced.before(button);
      advanced.classList.add('ik-advanced-hidden');
      button.addEventListener('click', () => {
        const open = advanced.classList.toggle('ik-advanced-hidden') === false;
        button.setAttribute('aria-expanded', String(open));
        button.textContent = open ? 'Hide advanced maintenance · Historical backfill' : 'Show advanced maintenance · Historical backfill';
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
