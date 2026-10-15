/* Admin workspace presentation only. Existing admin.js owns all data and actions. */
(() => {
  'use strict';
  const workspace = document.getElementById('adminEventWorkspace');
  if (!workspace) return;
  const tabs = Array.from(workspace.querySelectorAll('[data-workspace]'));
  const panels = Array.from(document.querySelectorAll('#eventSubtab-standard [data-admin-workspace-panel]'));
  const available = new Set(tabs.map(tab => tab.dataset.workspace));
  function activate(name, updateHash = true) {
    if (!available.has(name)) name = 'setup';
    for (const tab of tabs) {
      const active = tab.dataset.workspace === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) {
      const active = panel.dataset.adminWorkspacePanel === name;
      panel.classList.toggle('admin-workspace-hidden', !active);
      // Do not modify inline display: admin.js controls event-specific visibility.
    }
    if (updateHash && history.replaceState) {
      const url = new URL(location.href);
      url.searchParams.set('eventTool', name);
      history.replaceState(history.state, '', url);
    }
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab.dataset.workspace));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const i = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); activate(tabs[next].dataset.workspace);
    });
  }
  const initial = new URLSearchParams(location.search).get('eventTool');
  activate(available.has(initial) ? initial : 'setup', false);
})();
