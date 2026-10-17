/* Ironkin Design System D: motion (2026-10-17).
   Scroll-reveal for cards present at load, and count-up for stat numbers.
   Built to be safe on live pages:
   - Only elements that exist in the first ~2s are revealed. Content that
     re-renders later (polling boards, admin refreshes) just appears.
   - Count-up stops if the page's own JS rewrites the number meanwhile.
   - Elements already on screen at load are never hidden.
   - Reduced-motion users get no motion at all. */
(function () {
  if (window.__ikMotion) return;
  window.__ikMotion = true;
  if (!('IntersectionObserver' in window)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var CARD = [
    '.card', '.admin-card', '.games-card', '.profile-panel', '.event-panel', '.handbook-card',
    '.home-panel', '.home-feature-panel', '.home-news-section', '.home-status-rail article', '.ik-visual-link',
    '.calendar-card', '.archive-card', '.hof-summary-card', '.hof-record-card', '.records-feature', '.records-legend',
    '.rank-live-card', '.profile-hub-card', '.profile-stat-card', '.games-standings-card', '.games-season-card',
    '.challenge-card', '.bounty-card-item', '.event-detail-card', '.callout'
  ].join(',');
  var NUM = '.featured-stat strong, .home-status-rail strong, .event-kpi strong, .profile-stat-card strong, .hof-summary-card strong, .result-stat-strip strong';
  var STOP_AFTER = 2200;
  var t0 = performance.now();
  var seen = new WeakSet();

  function countUp(el) {
    var raw = (el.textContent || '').trim();
    var m = raw.match(/^([\d,]+(?:\.\d+)?)([KMB%]?)$/);
    if (!m) return;
    var end = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(end) || end === 0) return;
    var dec = (m[1].split('.')[1] || '').length, comma = m[1].indexOf(',') > -1, suf = m[2];
    var fmt = function (v) { return (comma ? Math.round(v).toLocaleString('en-US') : v.toFixed(dec)) + suf; };
    var start = performance.now(), dur = 1000, last = fmt(0);
    el.textContent = last;
    (function tick(now) {
      if (el.textContent !== last) return;            // page re-rendered it: let the page win
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      last = p < 1 ? fmt(end * e) : raw;
      el.textContent = last;
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      el.classList.add('ik-in');
      io.unobserve(el);
      el.querySelectorAll(NUM).forEach(countUp);
      setTimeout(function () { el.classList.remove('ik-rv', 'ik-in'); el.style.removeProperty('--ik-d'); }, 1200);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  function tag(root) {
    var vh = innerHeight;
    var list = [];
    if (root.matches && root.matches(CARD)) list.push(root);
    if (root.querySelectorAll) list = list.concat([].slice.call(root.querySelectorAll(CARD)));
    list.forEach(function (el) {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.closest('.site-header, dialog, [hidden]')) return;
      if (el.matches('.reveal-on-scroll, .ik-reveal') || el.closest('.reveal-on-scroll, .ik-reveal')) return;   // page already animates it
      if (el.parentElement && el.parentElement.closest('.ik-rv')) return;   // reveal the outer card only
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.top < vh * 0.9) {
        // already on screen: quick, staggered fade with no hiding gap
        el.classList.add('ik-rv');
        var sibs = el.parentElement ? [].filter.call(el.parentElement.children, function (c) { return c.matches(CARD); }) : [];
        el.style.setProperty('--ik-d', Math.min(sibs.indexOf(el), 6) * 60 + 'ms');
        requestAnimationFrame(function () { io.observe(el); });
        return;
      }
      el.classList.add('ik-rv');
      var s = el.parentElement ? [].filter.call(el.parentElement.children, function (c) { return c.matches(CARD); }) : [];
      var i = s.indexOf(el);
      if (i > 0) el.style.setProperty('--ik-d', Math.min(i % 4, 3) * 70 + 'ms');
      io.observe(el);
    });
  }

  function init() {
    tag(document.body);
    var mo = new MutationObserver(function (muts) {
      if (performance.now() - t0 > STOP_AFTER) { mo.disconnect(); return; }
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) tag(n); }); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, STOP_AFTER);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
