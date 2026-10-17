/* Ironkin icons (2026-10-17): swaps text glyphs (⌄ › → ↗ ⌕ ✕ ✓ …) for
   Heroicons v2 "mini" SVGs (MIT, github.com/tailwindlabs/heroicons).
   Runs over the page and over anything rendered later, so JS templates
   need no changes. The original glyph is kept in data-glyph. */
(function () {
  if (window.__ikIcons) return;
  window.__ikIcons = true;

  var P = {
    'chevron-down': 'M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z',
    'chevron-up': 'M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z',
    'chevron-right': 'M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z',
    'chevron-left': 'M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z',
    'arrow-right': 'M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z',
    'arrow-left': 'M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z',
    'arrow-up': 'M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z',
    'arrow-down': 'M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z',
    'arrow-up-right': 'M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z',
    'magnifying-glass': 'M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z',
    'x-mark': 'M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z',
    'check': 'M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z',
    'arrow-path': 'M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z'
  };
  // glyph -> [icon, label used only when the glyph is a control's whole content]
  var MAP = {
    '⌄': ['chevron-down'], '˅': ['chevron-down'], '▾': ['chevron-down'], '▼': ['chevron-down'],
    '▴': ['chevron-up'], '▲': ['chevron-up'],
    '›': ['chevron-right', 'Next'], '‹': ['chevron-left', 'Previous'],
    '→': ['arrow-right'], '⟶': ['arrow-right'], '←': ['arrow-left', 'Back'], '⟵': ['arrow-left', 'Back'],
    '↑': ['arrow-up', 'Move up'], '↓': ['arrow-down', 'Move down'], '↗': ['arrow-up-right'],
    '⌕': ['magnifying-glass', 'Search'], '✕': ['x-mark', 'Close'], '✖': ['x-mark', 'Close'],
    '✓': ['check'], '✔': ['check'], '↻': ['arrow-path', 'Refresh'], '⟳': ['arrow-path', 'Refresh']
  };
  var RE = /[⌄˅▾▼▴▲›‹→⟶←⟵↑↓↗⌕✕✖✓✔↻⟳×]/;
  var RE_G = /[⌄˅▾▼▴▲›‹→⟶←⟵↑↓↗⌕✕✖✓✔↻⟳]/g;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1, CODE: 1, PRE: 1, NOSCRIPT: 1, svg: 1, SVG: 1 };
  var NS = 'http://www.w3.org/2000/svg';

  function svg(name, glyph) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 20 20');
    s.setAttribute('fill', 'currentColor');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.setAttribute('class', 'ik-ico ik-ico-' + name);
    s.setAttribute('data-glyph', glyph);
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('fill-rule', 'evenodd');
    p.setAttribute('clip-rule', 'evenodd');
    p.setAttribute('d', P[name]);
    s.appendChild(p);
    return s;
  }

  function skippable(el) {
    for (var n = el; n && n !== document.body; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      if (SKIP[n.nodeName] || n.isContentEditable || n.hasAttribute('data-no-icons')) return true;
    }
    return false;
  }

  function labelControl(textNode, label) {
    var host = textNode.parentNode;
    if (!label || !host || host.nodeType !== 1) return;
    var ctl = host.closest('button, a, [role="button"], summary');
    if (!ctl || ctl.hasAttribute('aria-label') || ctl.hasAttribute('aria-labelledby')) return;
    if ((ctl.textContent || '').replace(RE_G, '').replace(/×/g, '').trim()) return;   // has real words already
    ctl.setAttribute('aria-label', label);
  }

  function swap(t) {
    var v = t.nodeValue;
    if (!v || !RE.test(v) || !t.parentNode || skippable(t.parentNode)) return;
    // × is multiplication ("×3") unless it is the whole label of a control
    if (v.trim() === '×') {
      labelControl(t, 'Close');
      t.parentNode.replaceChild(svg('x-mark', '×'), t);
      return;
    }
    RE_G.lastIndex = 0;
    if (!RE_G.test(v)) return;
    RE_G.lastIndex = 0;
    var frag = document.createDocumentFragment(), last = 0, m, firstLabel = null;
    while ((m = RE_G.exec(v))) {
      var hit = MAP[m[0]];
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      frag.appendChild(svg(hit[0], m[0]));
      if (!firstLabel && hit[1]) firstLabel = hit[1];
      last = m.index + 1;
    }
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    labelControl(t, firstLabel);
    t.parentNode.replaceChild(frag, t);
  }

  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { swap(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    if (!RE.test(root.textContent || '')) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) if (RE.test(n.nodeValue)) list.push(n);
    list.forEach(swap);
  }

  var queue = [], queued = false;
  function flush() {
    queued = false;
    var q = queue; queue = [];
    q.forEach(scan);
  }
  function init() {
    scan(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') queue.push(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) {
          var a = m.addedNodes[j];
          if (a.nodeType === 1 && a.namespaceURI === NS) continue;
          queue.push(a);
        }
      }
      if (queue.length && !queued) { queued = true; requestAnimationFrame(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
